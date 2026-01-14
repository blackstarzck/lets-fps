import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { MODELS, STORAGE_URL } from './constants'

// Interpolation factor for smooth movement
const LERP_FACTOR = 0.15

export class RemotePlayersManager {
  constructor(scene) {
    this.scene = scene
    this.players = new Map() // userId -> { mesh, targetPosition, targetRotation, username, mixer, action }
    this.loader = new GLTFLoader()
    this.modelCache = new Map() // url -> gltf
    
    // Default geometry for loading state
    this.placeholderGeometry = new THREE.CylinderGeometry(0.3, 0.3, 1.8, 16)
    this.placeholderMaterial = new THREE.MeshLambertMaterial({ color: 0x888888 })
  }

  async preloadModels() {
    console.log('Preloading all character models...')
    const promises = MODELS.map(modelDef => {
      const url = STORAGE_URL + modelDef.file
      // Skip if already cached
      if (this.modelCache.has(url)) return Promise.resolve()
      
      return new Promise((resolve) => {
        this.loader.load(url, (gltf) => {
          this.modelCache.set(url, gltf)
          console.log(`Preloaded: ${modelDef.name}`)
          resolve()
        }, undefined, (err) => {
          console.error(`Failed to preload ${modelDef.name}:`, err)
          // Resolve anyway to continue loading
          resolve()
        })
      })
    })
    
    await Promise.all(promises)
    console.log('All models preloaded')
  }

  getPlayerColor(userId) {
    // Legacy support or fallback
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash % 360)
    return new THREE.Color(`hsl(${hue}, 70%, 50%)`)
  }

  addPlayer(userId, username, color = '#ffffff', initialPosition = { x: 0, y: 0, z: 0 }, modelUrl = null) {
    if (this.players.has(userId)) return

    // Ensure valid numbers for position
    const safePos = {
        x: Number(initialPosition?.x || 0),
        y: Number(initialPosition?.y || 0),
        z: Number(initialPosition?.z || 0)
    }

    console.log(`[RemotePlayers] addPlayer: ${username} (${userId}) at ${JSON.stringify(safePos)}`)

    // Create container group
    const playerGroup = new THREE.Group()
    // Adjust Y position to match updatePlayer logic (capsule top -> floor)
    playerGroup.position.set(safePos.x, safePos.y - 1, safePos.z)
    
    // 1. Create Placeholder first
    const placeholder = new THREE.Mesh(this.placeholderGeometry, new THREE.MeshLambertMaterial({ color }))
    placeholder.position.y = 0.9
    placeholder.castShadow = true
    placeholder.receiveShadow = true
    playerGroup.add(placeholder)

    // DEBUG: Add explicit Red Box to confirm position/rendering (WALLHACK STYLE)
    /* 
    const debugGeo = new THREE.BoxGeometry(0.5, 50, 0.5); // Very tall red pole
    const debugMat = new THREE.MeshBasicMaterial({ 
        color: 0xff0000, 
        wireframe: true,
        depthTest: false, // Always visible through walls
        depthWrite: false
    });
    const debugMesh = new THREE.Mesh(debugGeo, debugMat);
    debugMesh.name = 'DEBUG_POLE';
    debugMesh.renderOrder = 999; // Render last (on top)
    playerGroup.add(debugMesh);
    */

    // Username label
    const label = this.createUsernameLabel(username)
    label.position.y = 2.0
    playerGroup.add(label)

    this.scene.add(playerGroup)
    
    // Store player data
    const playerData = {
      mesh: playerGroup,
      targetPosition: new THREE.Vector3(safePos.x, safePos.y - 1, safePos.z),
      targetRotation: new THREE.Euler(0, 0, 0),
      username,
      modelUrl,
      yOffset: 0,
      mixer: null,
      actions: {},
      isMoving: false,
      justJoined: true, // Flag for initial teleport
      placeholder // Keep reference to remove later
    }
    
    this.players.set(userId, playerData)

    // 2. Load GLB Model if URL provided
    if (modelUrl) {
      this.loadPlayerModel(userId, modelUrl, color)
    }

    // Force visible for debugging
    playerGroup.visible = true
    console.log(`[RemotePlayers] Player ${username} added to scene at ${JSON.stringify(playerGroup.position)}`)
  }

  async loadPlayerModel(userId, modelFile, colorHex) {
    console.log(`[RemotePlayers] loadPlayerModel called for ${userId}, file: ${modelFile}`)
    try {
      // Find model definition
      const modelDef = MODELS.find(m => m.file === modelFile)
      
      if (!modelDef) {
          console.warn(`[RemotePlayers] Model definition not found for file: ${modelFile}. Available models:`, MODELS.map(m => m.file))
      }

      const yOffset = modelDef ? (modelDef.yOffset || 0) : 0
      const radius = modelDef ? (modelDef.radius || 0.35) : 0.35

      // Construct full URL from filename
      const url = modelFile.startsWith('http') ? modelFile : STORAGE_URL + modelFile
      console.log(`[RemotePlayers] Loading GLTF from: ${url}`)
      
      let gltf = this.modelCache.get(url)
      
      if (!gltf) {
        console.log(`[RemotePlayers] Model not cached, fetching...`)
        gltf = await new Promise((resolve, reject) => {
          this.loader.load(url, resolve, undefined, reject)
        })
        this.modelCache.set(url, gltf)
        console.log(`[RemotePlayers] Model fetched and cached: ${url}`)
      } else {
        console.log(`[RemotePlayers] Using cached model: ${url}`)
      }

      const player = this.players.get(userId)
      if (!player) {
          console.warn(`[RemotePlayers] Player ${userId} left before model loaded`)
          return 
      }

      // Update player yOffset and radius
      player.yOffset = yOffset
      player.radius = radius

      console.log(`[RemotePlayers] Applying model to player ${userId}, yOffset: ${yOffset}`)

      // Clone the model properly using SkeletonUtils for SkinnedMesh support
      const model = SkeletonUtils.clone(gltf.scene)
      
      // Apply color/tint to meshes if possible
      const color = new THREE.Color(colorHex)
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
          
          // Clone material to avoid affecting other players
          if (child.material) {
            child.material = child.material.clone()
            // Apply tint if texture exists, or set color
            child.material.color.set(color) 
          }
        }
      })

      // Scale and Position adjustments
      // Assuming standard mixamo-like characters ~1.8m tall
      // Adjust these based on your specific models
      model.scale.set(1, 1, 1) // Restore original scale
      model.position.y = yOffset || 0 // Apply Y offset for different models
      model.rotation.y = Math.PI // Fix orientation if needed (Mixamo often faces +Z)

      // Debug model bounds
      // const box = new THREE.Box3().setFromObject(model);
      // const size = new THREE.Vector3();
      // box.getSize(size);
      // console.log(`[RemotePlayers] Loaded Model Bounds for ${userId}: Size=${JSON.stringify(size)}, Center=${JSON.stringify(box.getCenter(new THREE.Vector3()))}`);

      // Animation Setup
      if (gltf.animations && gltf.animations.length > 0) {
        player.mixer = new THREE.AnimationMixer(model)
        
        // Try to find Idle and Run animations
        // If the model only has one animation (e.g. running), use it
        // Or check animation names
        gltf.animations.forEach((clip) => {
            const action = player.mixer.clipAction(clip)
            player.actions[clip.name] = action
            // console.log(`Loaded animation: ${clip.name} for ${player.username}`)
        })
        
        // Play first animation by default (usually Idle or the only one)
        const firstClip = gltf.animations[0]
        if (firstClip) {
             player.actions[firstClip.name].play()
        }
      }

      // Swap placeholder with model
      player.mesh.add(model)
      player.model = model // Save reference
      
      // Remove placeholder now that model is loaded
      if (player.placeholder) {
        player.mesh.remove(player.placeholder)
        player.placeholder = null
      }
      
      console.log(`[RemotePlayers] Model successfully attached to player ${userId}`)

    } catch (error) {
      console.error(`[RemotePlayers] Failed to load model for ${userId}:`, error)
      // Fallback: Keep placeholder
    }
  }

  createUsernameLabel(username) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    canvas.width = 256
    canvas.height = 64

    context.fillStyle = 'rgba(0, 0, 0, 0.5)'
    context.fillRect(0, 0, canvas.width, canvas.height)
    
    context.font = 'bold 32px Arial'
    context.fillStyle = 'white'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(username, canvas.width / 2, canvas.height / 2)

    const texture = new THREE.CanvasTexture(canvas)
    const material = new THREE.SpriteMaterial({ map: texture })
    const sprite = new THREE.Sprite(material)
    sprite.scale.set(1, 0.25, 1)

    return sprite
  }

  updatePlayer(userId, state) {
    const player = this.players.get(userId)
    if (!player) return

    // Ensure valid numbers for state position
    const safePos = {
        x: Number(state.position?.x || 0),
        y: Number(state.position?.y || 0),
        z: Number(state.position?.z || 0)
    }

    // Debug update position
    // console.log(`[RemotePlayers] Updating ${player.username}:`, state.position)

    // Make visible on first update if it was hidden
    if (!player.mesh.visible) player.mesh.visible = true;
    
    // Check if we need to load/update model
    if (state.modelUrl && state.modelUrl !== player.modelUrl) {
        console.log(`Model update detected for ${player.username}: ${player.modelUrl} -> ${state.modelUrl}`)
        player.modelUrl = state.modelUrl
        // Remove old model if exists (but keep placeholder for now)
        if (player.model) {
            player.mesh.remove(player.model)
            player.model = null
        }
        // Load new model
        this.loadPlayerModel(userId, state.modelUrl, state.color || '#ffffff')
    } else if (player.modelUrl && !player.model) {
        // Retry loading model if url exists but model is missing
        this.loadPlayerModel(userId, player.modelUrl, state.color || '#ffffff')
    }

    // Update target position for interpolation
    player.targetPosition.set(
      safePos.x,
      safePos.y - 1, // Adjust for capsule center offset if needed (depends on model origin)
      safePos.z
    )

    // Check movement for animation
    // Simple check: distance to target > threshold
    const dist = player.mesh.position.distanceTo(player.targetPosition)
    player.isMoving = dist > 0.1

    // Update target rotation (only Y axis for body rotation)
    player.targetRotation.y = state.rotation.y
  }

  removePlayer(userId) {
    const player = this.players.get(userId)
    if (!player) return

    this.scene.remove(player.mesh)
    
    // Dispose resources
    if (player.mixer) {
        player.mixer.stopAllAction()
    }
    
    player.mesh.traverse((child) => {
      if (child.isMesh) {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
              if (Array.isArray(child.material)) {
                  child.material.forEach(m => m.dispose())
              } else {
                  child.material.dispose()
              }
          }
      }
    })

    this.players.delete(userId)
  }

  update(deltaTime = 0.016) {
    // Interpolate all remote players towards their target positions
    this.players.forEach((player) => {
      // Position interpolation
      if (player.justJoined) {
        // Teleport immediately for first update
        player.mesh.position.copy(player.targetPosition)
        // Also sync rotation immediately
        player.mesh.rotation.y = player.targetRotation.y
        player.justJoined = false
      } else {
        player.mesh.position.lerp(player.targetPosition, LERP_FACTOR)
        
        // Rotation interpolation (Y axis only)
        const currentY = player.mesh.rotation.y
        let targetY = player.targetRotation.y
        
        // Shortest path interpolation for angle
        const delta = targetY - currentY
        if (delta > Math.PI) targetY -= Math.PI * 2
        if (delta < -Math.PI) targetY += Math.PI * 2
        
        player.mesh.rotation.y += (targetY - currentY) * LERP_FACTOR
      }

      // Update Animation
      if (player.mixer) {
          player.mixer.update(deltaTime)
          
          // Simple state machine
          // Note: Needs valid animation names from the GLB files
          // For now, just play whatever is there, maybe speed up if moving
          
          // Example: if there's an action named 'Run' and 'Idle'
          // const runAction = player.actions['Run']
          // const idleAction = player.actions['Idle']
          // if (runAction && idleAction) {
          //     if (player.isMoving) {
          //         runAction.play()
          //         idleAction.stop()
          //     } else {
          //         idleAction.play()
          //         runAction.stop()
          //     }
          // }
      }
    })
  }

  getPlayerCount() {
    return this.players.size
  }

  getRemoteColliders() {
    const colliders = []
    this.players.forEach((player) => {
      // Validate position
      if (
          isNaN(player.mesh.position.x) || 
          isNaN(player.mesh.position.y) || 
          isNaN(player.mesh.position.z) ||
          !isFinite(player.mesh.position.x) ||
          !isFinite(player.mesh.position.y) ||
          !isFinite(player.mesh.position.z)
      ) {
          console.warn(`[RemotePlayers] Skipping collider for ${player.username} - Invalid position:`, player.mesh.position);
          return;
      }

      // Create segment for capsule
      const radius = player.radius || 0.35
      const height = 1.8 // Standard height
      
      // Capsule segment starts at radius up and ends at height-radius up
      const start = new THREE.Vector3(player.mesh.position.x, player.mesh.position.y + radius, player.mesh.position.z)
      const end = new THREE.Vector3(player.mesh.position.x, player.mesh.position.y + height - radius, player.mesh.position.z)

      colliders.push({
        id: player.username,
        start: start,
        end: end,
        radius: radius,
        position: player.mesh.position, // Keep for backward compatibility/fallback
        height: height
      })
    })
    return colliders
  }

  debugScene() {
    console.log(`[RemotePlayers] Debug - Scene UUID: ${this.scene.uuid}, Children: ${this.scene.children.length}, Players: ${this.players.size}`)
    this.players.forEach((p, id) => {
        const worldPos = new THREE.Vector3()
        p.mesh.getWorldPosition(worldPos)
        console.log(`[RemotePlayers] Player ${p.username} (${id}): Vis=${p.mesh.visible}, LocalPos=${JSON.stringify(p.mesh.position)}, WorldPos=${JSON.stringify(worldPos)}, InScene=${this.scene.children.includes(p.mesh)}`)
    })
  }

  dispose() {
    this.players.forEach((player, userId) => {
      this.removePlayer(userId)
    })
    this.placeholderGeometry.dispose()
    this.placeholderMaterial.dispose()
  }
}
