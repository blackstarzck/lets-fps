import * as THREE from 'three'

export class PlayerController {
  constructor(camera, physics, domElement, engine, profile) {
    this.camera = camera
    this.physics = physics
    this.domElement = domElement
    this.engine = engine
    this.profile = profile || { color: '#ffff00' }
    
    this.keyStates = {}
    this.mouseButtons = {}
    this.isLocked = false
    this.mouseTime = 0
    
    this.direction = new THREE.Vector3()
    
    this.setupEventListeners()
  }

  setupEventListeners() {
    // Keyboard events
    document.addEventListener('keydown', (e) => {
      this.keyStates[e.code] = true
    })
    
    document.addEventListener('keyup', (e) => {
      this.keyStates[e.code] = false
    })

    // Mouse events for shooting
    document.addEventListener('mousedown', (e) => {
      if (this.isLocked && e.button === 0) { // Left click
        this.mouseTime = performance.now()
      }
    })

    document.addEventListener('mouseup', (e) => {
      if (this.isLocked && e.button === 0) { // Left click release
        this.shoot()
      }
    })

    // Mouse look
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === this.domElement) {
        this.camera.rotation.y -= e.movementX / 500
        this.camera.rotation.x -= e.movementY / 500
        
        // Clamp vertical rotation
        this.camera.rotation.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, this.camera.rotation.x)
        )
      }
    })

    // Pointer lock
    this.domElement.addEventListener('click', () => {
      this.domElement.requestPointerLock()
    })

    document.addEventListener('pointerlockchange', () => {
      this.isLocked = document.pointerLockElement === this.domElement
    })
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

  update(deltaTime) {
    // Movement speed - faster on ground
    const speedDelta = deltaTime * (this.physics.onFloor ? 25 : 8)

    // WASD movement
    if (this.keyStates['KeyW']) {
      this.physics.velocity.add(
        this.getForwardVector().multiplyScalar(speedDelta)
      )
    }

    if (this.keyStates['KeyS']) {
      this.physics.velocity.add(
        this.getForwardVector().multiplyScalar(-speedDelta)
      )
    }

    if (this.keyStates['KeyA']) {
      this.physics.velocity.add(
        this.getSideVector().multiplyScalar(-speedDelta)
      )
    }

    if (this.keyStates['KeyD']) {
      this.physics.velocity.add(
        this.getSideVector().multiplyScalar(speedDelta)
      )
    }

    // Jump
    if (this.keyStates['Space']) {
      this.physics.jump()
    }

    // Update camera position to follow physics
    this.camera.position.copy(this.physics.getPosition())
  }

  shoot() {
    // Get shoot direction (center of screen)
    this.camera.getWorldDirection(this.direction)
    
    // Calculate spawn position (in front of player)
    // Uses physics collider end (top of player) but slightly forward
    const spawnPos = this.physics.collider.end.clone()
    spawnPos.addScaledVector(this.direction, this.physics.collider.radius * 1.5)

    // Calculate impulse based on charge time
    const impulse = 15 + 30 * (1 - Math.exp((this.mouseTime - performance.now()) * 0.001))

    // Velocity = direction * impulse + player velocity
    const velocity = this.direction.clone().multiplyScalar(impulse)
    velocity.addScaledVector(this.physics.velocity, 2)

    this.engine.createProjectile(spawnPos, velocity, this.profile.color)
  }

  getState() {
    return {
      position: {
        x: this.camera.position.x,
        y: this.camera.position.y,
        z: this.camera.position.z
      },
      rotation: {
        x: this.camera.rotation.x,
        y: this.camera.rotation.y,
        z: this.camera.rotation.z
      },
      isJumping: !this.physics.onFloor
    }
  }

  dispose() {
    // Event listeners will be garbage collected with the document
  }
}
