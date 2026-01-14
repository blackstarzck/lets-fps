import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Octree } from 'three/addons/math/Octree.js'

export class GameEngine {
  constructor(container) {
    this.container = container
    this.clock = new THREE.Clock()
    this.worldOctree = new Octree()
    this.projectiles = []
    this.isMapLoaded = false
    
    this.init()
  }

  init() {
    // Scene
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x88ccee)
    this.scene.fog = new THREE.Fog(0x88ccee, 0, 50)
    
    this.onProjectileHit = null // Callback for projectile hits

    // Camera
    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )
    this.camera.rotation.order = 'YXZ'

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.VSMShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.container.appendChild(this.renderer.domElement)

    // Lighting
    this.setupLighting()

    // Window resize handler
    window.addEventListener('resize', () => this.onWindowResize())
  }

  setupLighting() {
    // Hemisphere light
    const fillLight = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5)
    fillLight.position.set(2, 1, 1)
    this.scene.add(fillLight)

    // Directional light with shadows
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5)
    directionalLight.position.set(-5, 25, -1)
    directionalLight.castShadow = true
    directionalLight.shadow.camera.near = 0.01
    directionalLight.shadow.camera.far = 500
    directionalLight.shadow.camera.right = 30
    directionalLight.shadow.camera.left = -30
    directionalLight.shadow.camera.top = 30
    directionalLight.shadow.camera.bottom = -30
    directionalLight.shadow.mapSize.width = 1024
    directionalLight.shadow.mapSize.height = 1024
    directionalLight.shadow.radius = 4
    directionalLight.shadow.bias = -0.00006
    this.scene.add(directionalLight)
  }

  async loadMap(path = '/models/gltf/collision-world.glb') {
    return new Promise((resolve, reject) => {
      console.log(`Attempting to load map from: ${path}`)
      const loader = new GLTFLoader()
      
      loader.load(
        path,
        (gltf) => {
          console.log('GLTF loaded successfully')
          this.scene.add(gltf.scene)
          this.worldOctree.fromGraphNode(gltf.scene)

          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              child.castShadow = true
              child.receiveShadow = true
              if (child.material.map) {
                child.material.map.anisotropy = 4
              }
            }
          })

          this.isMapLoaded = true
          resolve(gltf.scene)
        },
        (xhr) => {
          console.log((xhr.loaded / xhr.total * 100) + '% loaded')
        },
        (error) => {
          console.error('Failed to load map:', error)
          reject(error)
        }
      )
    })
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  updateProjectiles(deltaTime, playerPhysics, remoteColliders = []) {
    const GRAVITY = 30
    
    // 1. Update positions and World Collisions
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const sphere = this.projectiles[i]

      // Move
      sphere.collider.center.addScaledVector(sphere.velocity, deltaTime)

      // World Collision
      const result = this.worldOctree.sphereIntersect(sphere.collider)

      if (result) {
        // Bounce
        sphere.velocity.addScaledVector(result.normal, -result.normal.dot(sphere.velocity) * 1.5)
        sphere.collider.center.add(result.normal.multiplyScalar(result.depth))
      } else {
        // Gravity
        sphere.velocity.y -= GRAVITY * deltaTime
      }

      // Air resistance
      const damping = Math.exp(-1.5 * deltaTime) - 1
      sphere.velocity.addScaledVector(sphere.velocity, damping)

      // Local Player Collision
      if (playerPhysics) {
        playerPhysics.resolveSphereCollision(sphere)
      }

      // Remote Players Collision
      if (remoteColliders.length > 0) {
        this.resolveRemoteCollisions(sphere, remoteColliders)
      }

      // Remove if out of bounds OR lifetime expired
      const now = performance.now()
      const age = now - sphere.spawnTime
      const isExpired = sphere.spawnTime && (age > sphere.lifetime)
      
      // Debug log every 5 seconds
      if (Math.floor(age / 1000) % 5 === 0 && Math.floor(age) % 60 === 0) {
        console.log(`Projectile ID ${i} age: ${age.toFixed(1)}ms / ${sphere.lifetime}ms`)
      }

      if (sphere.collider.center.y < -50 || isExpired) {
        if (isExpired) console.log('Projectile expired and removed')
        this.scene.remove(sphere)
        sphere.geometry.dispose()
        sphere.material.dispose()
        this.projectiles.splice(i, 1)
        continue
      }
      
      // Update mesh position
      sphere.position.copy(sphere.collider.center)
    }

    // 2. Sphere-Sphere Collisions
    this.resolveSpheresCollisions()
  }

  resolveRemoteCollisions(sphere, remoteColliders) {
    const vector1 = new THREE.Vector3()
    const vector2 = new THREE.Vector3() // For velocity calculation if needed, but remote players are kinematic here
    const sphereCenter = sphere.collider.center
    
    for (const remote of remoteColliders) {
        // Skip invalid colliders
        if (!remote.start || !remote.end) continue

        // Use Line3 to find closest point on capsule segment to sphere center
        const line = new THREE.Line3(remote.start, remote.end)
        const closestPoint = new THREE.Vector3()
        line.closestPointToPoint(sphereCenter, true, closestPoint)

        const r = remote.radius + sphere.collider.radius
        const r2 = r * r
        const d2 = closestPoint.distanceToSquared(sphereCenter)

        if (d2 < r2) {
            // Collision detected!
            // Normal from Player -> Sphere (to push sphere away)
            const normal = vector1.subVectors(sphereCenter, closestPoint).normalize()
            
            // If sphere is exactly inside line (rare), push up
            if (normal.lengthSq() === 0) {
                normal.set(0, 1, 0)
            }

            // Bounce sphere off player
            // Remote players are immovable objects (kinematic) from local perspective
            // v' = v - 2 * (v . n) * n  (Reflection)
            // But let's add some elasticity/damping like walls
            
            const vDotN = sphere.velocity.dot(normal)
            sphere.velocity.addScaledVector(normal, -vDotN * 1.5) // 1.5 bounce factor

            // Push sphere out
            const d = Math.sqrt(d2)
            const overlap = r - d
            sphereCenter.addScaledVector(normal, overlap)

            // Trigger Knockback Event
            // Impulse direction is opposite to normal (Sphere -> Player)
            // Magnitude depends on sphere velocity/mass
            if (this.onProjectileHit && !sphere.hitSet.has(remote.id)) {
                sphere.hitSet.add(remote.id) // Mark this player as hit by this sphere

                // Approximate impulse based on sphere velocity
                // We use a fixed base impulse for gameplay feel + velocity factor
                const impulseDir = normal.clone().negate()
                // Cap velocity contribution to avoid crazy knockback
                const speed = Math.min(sphere.velocity.length(), 50) 
                const impulseMag = 15 + speed * 0.5 
                
                // Add some up-vector to lift them off ground
                impulseDir.y += 0.5 
                impulseDir.normalize().multiplyScalar(impulseMag)
                
                this.onProjectileHit(remote.id, impulseDir)
            }
        }
    }
  }

  resolveSpheresCollisions() {
    const vector1 = new THREE.Vector3()
    const vector2 = new THREE.Vector3()
    const vector3 = new THREE.Vector3()

    for (let i = 0, length = this.projectiles.length; i < length; i++) {
      const s1 = this.projectiles[i]

      for (let j = i + 1; j < length; j++) {
        const s2 = this.projectiles[j]

        const d2 = s1.collider.center.distanceToSquared(s2.collider.center)
        const r = s1.collider.radius + s2.collider.radius
        const r2 = r * r

        if (d2 < r2) {
          const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize()
          const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity))
          const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity))

          s1.velocity.add(v2).sub(v1)
          s2.velocity.add(v1).sub(v2)

          const d = (r - Math.sqrt(d2)) / 2

          s1.collider.center.addScaledVector(normal, d)
          s2.collider.center.addScaledVector(normal, -d)
        }
      }
    }
  }

  createProjectile(position, velocity, color) {
    const radius = 0.2
    const geometry = new THREE.IcosahedronGeometry(radius, 5)
    const material = new THREE.MeshLambertMaterial({ color: color || 0xffff00 })
    const sphere = new THREE.Mesh(geometry, material)
    
    sphere.castShadow = true
    sphere.receiveShadow = true
    
    // Physics properties
    sphere.collider = new THREE.Sphere(position.clone(), radius)
    sphere.velocity = velocity.clone()
    sphere.hitSet = new Set() // Track players hit by this projectile
    
    // Lifetime - 40 seconds
    sphere.spawnTime = performance.now()
    sphere.lifetime = 40000 // 40 seconds in ms
    console.log('Projectile created with lifetime:', sphere.lifetime, 'spawnTime:', sphere.spawnTime)
    
    // Sync mesh with collider
    sphere.position.copy(position)

    this.scene.add(sphere)
    this.projectiles.push(sphere)
    
    // Limit number of projectiles
    if (this.projectiles.length > 100) {
      const old = this.projectiles.shift()
      this.scene.remove(old)
      old.geometry.dispose()
      old.material.dispose()
    }
  }

  getDeltaTime() {
    return Math.min(0.05, this.clock.getDelta())
  }

  dispose() {
    window.removeEventListener('resize', this.onWindowResize)
    this.renderer.dispose()
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement)
    }
  }
}
