import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
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

    // Create container group
    const playerGroup = new THREE.Group()
    // Adjust Y position to match updatePlayer logic (capsule top -> floor)
    playerGroup.position.set(initialPosition.x, initialPosition.y - 1, initialPosition.z)
    
    // 1. Create Placeholder first
    const placeholder = new THREE.Mesh(this.placeholderGeometry, new THREE.MeshLambertMaterial({ color }))
    placeholder.position.y = 0.9
    placeholder.castShadow = true
    placeholder.receiveShadow = true
    playerGroup.add(placeholder)

    // Username label
    const label = this.createUsernameLabel(username)
    label.position.y = 2.0
    playerGroup.add(label)

    this.scene.add(playerGroup)
    
    // Store player data
    const playerData = {
      mesh: playerGroup,
      targetPosition: new THREE.Vector3(initialPosition.x, initialPosition.y - 1, initialPosition.z),
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

    // If initial position is default (0,0,0) and likely from join event without pos data,
    // hide player until first update to avoid spawn clustering
    if (initialPosition.x === 0 && initialPosition.y === 0 && initialPosition.z === 0) {
        console.log(`Player ${username} (${userId}) created at 0,0,0 - hiding until update`)
        playerGroup.visible = false
    } else {
        console.log(`Player ${username} (${userId}) created at valid pos - visible`)
    }
  }

  async loadPlayerModel(userId, modelFile, colorHex) {
    try {
      // Find model definition
      const modelDef = MODELS.find(m => m.file === modelFile)
      const yOffset = modelDef ? (modelDef.yOffset || 0) : 0
      const radius = modelDef ? (modelDef.radius || 0.35) : 0.35

      // Construct full URL from filename
      const url = modelFile.startsWith('http') ? modelFile : STORAGE_URL + modelFile
      
      let gltf = this.modelCache.get(url)
      
      if (!gltf) {
        gltf = await new Promise((resolve, reject) => {
          this.loader.load(url, resolve, undefined, reject)
        })
        this.modelCache.set(url, gltf)
      }

      const player = this.players.get(userId)
      if (!player) return // Player might have left

      // Update player yOffset and radius
      player.yOffset = yOffset
      player.radius = radius

      console.log(`Loading model for ${userId}: ${modelFile}, yOffset: ${yOffset}`)

      // Clone the model
      const model = gltf.scene.clone()
      
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
      model.scale.set(1, 1, 1) 
      model.position.y = yOffset || 0 // Apply Y offset for different models
      model.rotation.y = Math.PI // Fix orientation if needed (Mixamo often faces +Z)

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
      player.mesh.remove(player.placeholder)
      player.mesh.add(model)
      player.model = model // Save reference

    } catch (error) {
      console.error(`Failed to load model for ${userId}:`, error)
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

    // Make visible on first update if it was hidden
    if (!player.mesh.visible) {
        console.log(`Player ${player.username} (${userId}) received first update - making visible`)
        player.mesh.visible = true
    }

    // Update target position for interpolation
    player.targetPosition.set(
      state.position.x,
      state.position.y - 1, // Adjust for capsule center offset if needed (depends on model origin)
      state.position.z
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

  dispose() {
    this.players.forEach((player, userId) => {
      this.removePlayer(userId)
    })
    this.placeholderGeometry.dispose()
    this.placeholderMaterial.dispose()
  }
}
