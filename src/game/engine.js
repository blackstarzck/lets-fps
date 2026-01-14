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

  updateProjectiles(deltaTime, playerPhysics) {
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

      // Player Collision
      if (playerPhysics) {
        playerPhysics.resolveSphereCollision(sphere)
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
