import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MODELS, STORAGE_URL } from './constants'

export class PlayerController {
  constructor(camera, physics, domElement, engine, profile) {
    this.camera = camera
    this.physics = physics
    this.domElement = domElement
    this.engine = engine
    this.profile = profile || { color: '#ffff00' }
    this.multiplayer = null // Will be set after construction
    
    // State
    this.isThirdPerson = false
    this.projectileColor = this.profile.color
    
    // Model
    this.loader = new GLTFLoader()
    this.model = null
    this.mixer = null
    this.actions = {}
    this.isMoving = false
    
    this.keyStates = {}
    this.mouseButtons = {}
    this.isLocked = false
    this.mouseTime = 0
    
    this.direction = new THREE.Vector3()
    
    // Third person camera settings
    this.cameraOffset = new THREE.Vector3(0, 2, -4) // Behind and up
    this.currentCameraPosition = new THREE.Vector3()
    
    // Bind handlers for removal
    this.onKeyDown = this.onKeyDown.bind(this)
    this.onKeyUp = this.onKeyUp.bind(this)
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onPointerLockChange = this.onPointerLockChange.bind(this)
    this.requestPointerLock = this.requestPointerLock.bind(this)

    this.setupEventListeners()
    
    // Load own character model if url exists
    if (this.profile.modelUrl) {
      this.loadModel(this.profile.modelUrl, this.profile.color)
    }
  }

  async loadModel(modelFile, colorHex) {
    try {
      // Find model definition to get yOffset
      const modelDef = MODELS.find(m => m.file === modelFile)
      this.modelYOffset = modelDef ? (modelDef.yOffset || 0) : 0
      
      // Update collision radius if defined
      if (modelDef && modelDef.radius) {
        this.physics.collider.radius = modelDef.radius
      }

      // Construct full URL from filename
      const url = modelFile.startsWith('http') ? modelFile : STORAGE_URL + modelFile
      
      const gltf = await new Promise((resolve, reject) => {
        this.loader.load(url, resolve, undefined, reject)
      })

      this.model = gltf.scene
      
      // Apply tint
      const color = new THREE.Color(colorHex)
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true
          child.receiveShadow = true
          if (child.material) {
            child.material = child.material.clone()
            child.material.color.set(color)
          }
        }
      })

      // Setup Animation
      if (gltf.animations && gltf.animations.length > 0) {
        this.mixer = new THREE.AnimationMixer(this.model)
        gltf.animations.forEach((clip) => {
          this.actions[clip.name] = this.mixer.clipAction(clip)
        })
        // Play first animation (usually Idle)
        const firstClip = gltf.animations[0]
        if (firstClip) this.actions[firstClip.name].play()
      }

      // Initial visibility based on perspective
      this.model.visible = this.isThirdPerson
      
      this.engine.scene.add(this.model)

    } catch (error) {
      console.error('Failed to load local player model:', error)
    }
  }

  setupEventListeners() {
    document.addEventListener('keydown', this.onKeyDown)
    document.addEventListener('keyup', this.onKeyUp)
    document.addEventListener('mousedown', this.onMouseDown)
    document.addEventListener('mouseup', this.onMouseUp)
    document.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
    this.domElement.addEventListener('click', this.requestPointerLock)
  }

  onKeyDown(e) {
    this.keyStates[e.code] = true
  }

  onKeyUp(e) {
    this.keyStates[e.code] = false
  }

  onMouseDown(e) {
    if (this.isLocked && e.button === 0) {
      this.mouseTime = performance.now()
    }
  }

  onMouseUp(e) {
    if (this.isLocked && e.button === 0) {
      this.shoot()
    }
  }

  onMouseMove(e) {
    if (document.pointerLockElement === this.domElement) {
      this.camera.rotation.y -= e.movementX / 500
      this.camera.rotation.x -= e.movementY / 500
      
      this.camera.rotation.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, this.camera.rotation.x)
      )
    }
  }

  onPointerLockChange() {
    this.isLocked = document.pointerLockElement === this.domElement
  }

  requestPointerLock() {
    this.domElement.requestPointerLock()
  }

  getForwardVector() {
    this.camera.getWorldDirection(this.direction)
    this.direction.y = 0
    this.direction.normalize()
    return this.direction
  }

  getSideVector() {
    this.camera.getWorldDirection(this.direction)
    this.direction.y = 0
    this.direction.normalize()
    this.direction.cross(this.camera.up)
    return this.direction
  }

  setPerspective(isThirdPerson) {
    this.isThirdPerson = isThirdPerson
    if (this.model) {
      this.model.visible = isThirdPerson
    }
  }

  setMultiplayer(multiplayer) {
    this.multiplayer = multiplayer
  }

  setProjectileColor(color) {
    this.projectileColor = new THREE.Color(color)
  }

  applyKnockback(impulse) {
    this.physics.applyImpulse(new THREE.Vector3(impulse.x, impulse.y, impulse.z))
  }

  update(deltaTime) {
    // Movement speed - faster on ground
    const speedDelta = deltaTime * (this.physics.onFloor ? 25 : 8)

    // Check if moving for animation
    this.isMoving = false

    // WASD movement
    if (this.keyStates['KeyW']) {
      this.physics.velocity.add(
        this.getForwardVector().multiplyScalar(speedDelta)
      )
      this.isMoving = true
    }

    if (this.keyStates['KeyS']) {
      this.physics.velocity.add(
        this.getForwardVector().multiplyScalar(-speedDelta)
      )
      this.isMoving = true
    }

    if (this.keyStates['KeyA']) {
      this.physics.velocity.add(
        this.getSideVector().multiplyScalar(-speedDelta)
      )
      this.isMoving = true
    }

    if (this.keyStates['KeyD']) {
      this.physics.velocity.add(
        this.getSideVector().multiplyScalar(speedDelta)
      )
      this.isMoving = true
    }

    // Jump
    if (this.keyStates['Space']) {
      this.physics.jump()
    }

    // Update camera position
    const playerPos = this.physics.getPosition()
    
    if (this.isThirdPerson) {
      // Third Person Camera Logic
      // Calculate offset rotated by camera yaw
      const offset = this.cameraOffset.clone()
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camera.rotation.y)
      
      const targetPos = playerPos.clone().add(offset)
      
      // Simple collision check for camera (prevent going through walls) - optional refinement
      // For now just set position
      this.camera.position.lerp(targetPos, 0.1) // Smooth follow
      
      // Look at player
      // this.camera.lookAt(playerPos) // This overrides mouse look, so we need a different approach if we want mouse to control rotation
      
      // Better 3rd person: Camera orbits around player based on mouse input
      // Re-using existing mouse look rotation from camera object
      
      // In first person, camera rotation is controlled directly by mouse.
      // In third person, we want the camera to orbit.
      // Current implementation rotates camera object directly in event listener.
      
      // Let's attach camera to a boom arm conceptually
      // We already have camera.rotation set by mouse.
      // We just need to position the camera relative to player based on that rotation.
      
      const dist = 4
      const height = 2
      
      // Calculate position based on rotation
      const back = new THREE.Vector3(0, 0, 1).applyEuler(this.camera.rotation)
      const cameraPos = playerPos.clone().add(new THREE.Vector3(0, height, 0)).add(back.multiplyScalar(dist))
      
      this.camera.position.copy(cameraPos)
      
    } else {
      // First Person
      this.camera.position.copy(playerPos)
    }

    // Update Model Position & Animation
    if (this.model) {
      // Sync model position with physics (feet position)
      // physics.getPosition() returns eye level (end of capsule)
      // We need bottom of capsule. Capsule height is ~1.65 (start 0.35, end 1 + radius 0.35 = 1.35? Wait)
      // Physics: start(0,0.35,0), end(0,1,0), radius 0.35. Total height = 0.35 + 1 - 0.35 + 0.35*2 = 1.7?
      // Actually collider.start is bottom sphere center, collider.end is top sphere center.
      // Bottom of player is collider.start.y - radius
      
      const bottomPos = this.physics.collider.start.clone()
      bottomPos.y -= this.physics.collider.radius
      
      // Apply model-specific Y offset
      bottomPos.y += (this.modelYOffset || 0)
      
      this.model.position.copy(bottomPos)
      
      // Sync rotation with camera yaw (so character faces forward)
      // But only Y rotation
      this.model.rotation.y = this.camera.rotation.y + Math.PI // +PI because model usually faces +Z, camera looks -Z
      
      // Update mixer
      if (this.mixer) this.mixer.update(deltaTime)
    }
  }

  shoot() {
    // Get shoot direction (center of screen)
    this.camera.getWorldDirection(this.direction)
    
    // Calculate spawn position
    let spawnPos
    if (this.isThirdPerson && this.model) {
       // Spawn from character hand or forward if 3rd person
       // Simplify: spawn from player position + forward
       spawnPos = this.physics.collider.end.clone()
       spawnPos.addScaledVector(this.direction, 1.2)
    } else {
       // 1st person: spawn from camera
       spawnPos = this.physics.collider.end.clone()
       spawnPos.addScaledVector(this.direction, 0.8) // Increased from 0.525 to 0.8 to avoid self-collision
    }

    // Calculate impulse based on charge time
    const impulse = 15 + 30 * (1 - Math.exp((this.mouseTime - performance.now()) * 0.001))

    // Velocity
    const velocity = this.direction.clone().multiplyScalar(impulse)
    velocity.addScaledVector(this.physics.velocity, 2)

    // Create local projectile
    const sphere = this.engine.createProjectile(spawnPos, velocity, this.projectileColor)
    if (sphere) sphere.owner = 'local'
    
    // Broadcast to other players
    if (this.multiplayer) {
      console.log('PlayerController calling broadcastProjectile')
      this.multiplayer.broadcastProjectile(spawnPos, velocity, this.projectileColor)
    } else {
      console.warn('Multiplayer instance not set in PlayerController')
    }
  }

  getState() {
    const pos = this.physics.getPosition()
    return {
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotation: { y: this.camera.rotation.y },
      isMoving: this.isMoving
    }
  }

  dispose() {
    document.removeEventListener('keydown', this.onKeyDown)
    document.removeEventListener('keyup', this.onKeyUp)
    document.removeEventListener('mousedown', this.onMouseDown)
    document.removeEventListener('mouseup', this.onMouseUp)
    document.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    this.domElement.removeEventListener('click', this.requestPointerLock)
  }
}
