import * as THREE from 'three'
import { Capsule } from 'three/addons/math/Capsule.js'

export const GRAVITY = 30
export const STEPS_PER_FRAME = 5

export class PlayerPhysics {
  constructor(worldOctree) {
    this.worldOctree = worldOctree
    
    // Player collider - capsule shape
    this.collider = new Capsule(
      new THREE.Vector3(0, 0.35, 0),
      new THREE.Vector3(0, 1, 0),
      0.35
    )
    
    this.velocity = new THREE.Vector3()
    this.direction = new THREE.Vector3()
    this.onFloor = false
  }

  reset() {
    // Start slightly higher to avoid falling through floor
    this.collider.start.set(0, 5, 0)
    this.collider.end.set(0, 5.65, 0)
    this.collider.radius = 0.35
    this.velocity.set(0, 0, 0)
    this.onFloor = false
  }

  checkCollisions() {
    const result = this.worldOctree.capsuleIntersect(this.collider)
    
    this.onFloor = false

    if (result) {
      this.onFloor = result.normal.y > 0

      if (!this.onFloor) {
        this.velocity.addScaledVector(
          result.normal,
          -result.normal.dot(this.velocity)
        )
      }

      if (result.depth >= 1e-10) {
        this.collider.translate(result.normal.multiplyScalar(result.depth))
      }
    }
  }

  update(deltaTime) {
    let damping = Math.exp(-4 * deltaTime) - 1

    if (!this.onFloor) {
      this.velocity.y -= GRAVITY * deltaTime
      // Small air resistance
      damping *= 0.1
    }

    this.velocity.addScaledVector(this.velocity, damping)

    const deltaPosition = this.velocity.clone().multiplyScalar(deltaTime)
    this.collider.translate(deltaPosition)

    this.checkCollisions()
  }

  jump() {
    if (this.onFloor) {
      this.velocity.y = 15
    }
  }

  getPosition() {
    return this.collider.end.clone()
  }

  setPosition(position) {
    const offset = new THREE.Vector3(0, -0.65, 0)
    this.collider.start.copy(position).add(offset)
    offset.y = 0
    this.collider.end.copy(position)
  }

  teleportIfOutOfBounds(camera) {
    if (camera.position.y <= -25) {
      this.reset()
      camera.position.copy(this.collider.end)
      camera.rotation.set(0, 0, 0)
    }
  }

  // Handle collision between player and a sphere projectile
  resolveSphereCollision(sphere) {
    const vector1 = new THREE.Vector3()
    const vector2 = new THREE.Vector3()
    const vector3 = new THREE.Vector3()

    const center = vector1.addVectors(this.collider.start, this.collider.end).multiplyScalar(0.5)
    const sphereCenter = sphere.collider.center
    
    const r = this.collider.radius + sphere.collider.radius
    const r2 = r * r

    // Approximation: check start, end, and center points of capsule
    for (const point of [this.collider.start, this.collider.end, center]) {
      const d2 = point.distanceToSquared(sphereCenter)

      if (d2 < r2) {
        const normal = vector1.copy(point).sub(sphereCenter).normalize().negate() // Direction from sphere to player point? 
        // Logic from sample: vector1.subVectors(point, sphere_center).normalize() -> Vector from Sphere to Player Point (if point is player)
        // Wait, sample logic: normal = vector1.subVectors(point, sphere_center).normalize()
        // point is on player capsule. sphere_center is sphere.
        // So normal is direction from Sphere -> Player.
        
        // Re-implementing exactly as sample code for safety:
        // const normal = vector1.subVectors( point, sphere_center ).normalize();
        
        const normalVector = new THREE.Vector3().subVectors(point, sphereCenter).normalize()
        
        const v1 = vector2.copy(normalVector).multiplyScalar(normalVector.dot(this.velocity))
        const v2 = vector3.copy(normalVector).multiplyScalar(normalVector.dot(sphere.velocity))

        this.velocity.add(v2).sub(v1)
        sphere.velocity.add(v1).sub(v2)

        const d = (r - Math.sqrt(d2)) / 2
        sphereCenter.addScaledVector(normalVector, -d)
      }
    }
  }
}
