import * as THREE from 'three'

// Interpolation factor for smooth movement
const LERP_FACTOR = 0.15

export class RemotePlayersManager {
  constructor(scene) {
    this.scene = scene
    this.players = new Map() // userId -> { mesh, targetPosition, targetRotation, username }
    
    // Shared geometry and material for player models
    this.playerGeometry = this.createPlayerGeometry()
    this.playerMaterials = new Map() // userId -> material (unique colors)
  }

  createPlayerGeometry() {
    // Create a simple capsule-like shape using cylinder + spheres
    const group = new THREE.Group()
    
    // Body (cylinder)
    const bodyGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 16)
    const body = new THREE.Mesh(bodyGeometry)
    body.position.y = 0.6
    
    // Head (sphere)
    const headGeometry = new THREE.SphereGeometry(0.25, 16, 16)
    const head = new THREE.Mesh(headGeometry)
    head.position.y = 1.1
    
    // Combine into BufferGeometry for efficiency
    return { bodyGeometry, headGeometry }
  }

  getPlayerColor(userId) {
    // Generate consistent color from userId
    let hash = 0
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash)
    }
    const hue = Math.abs(hash % 360)
    return new THREE.Color(`hsl(${hue}, 70%, 50%)`)
  }

  addPlayer(userId, username, color = '#ffffff', initialPosition = { x: 0, y: 0, z: 0 }) {
    if (this.players.has(userId)) return

    const material = new THREE.MeshLambertMaterial({ color })
    this.playerMaterials.set(userId, material)

    // Create player mesh group
    const playerGroup = new THREE.Group()
    
    // Body
    const body = new THREE.Mesh(this.playerGeometry.bodyGeometry, material)
    body.position.y = 0.6
    body.castShadow = true
    body.receiveShadow = true
    playerGroup.add(body)
    
    // Head
    const head = new THREE.Mesh(this.playerGeometry.headGeometry, material)
    head.position.y = 1.1
    head.castShadow = true
    head.receiveShadow = true
    playerGroup.add(head)

    // Username label
    const label = this.createUsernameLabel(username)
    label.position.y = 1.6
    playerGroup.add(label)

    // Set initial position
    playerGroup.position.set(initialPosition.x, initialPosition.y, initialPosition.z)

    this.scene.add(playerGroup)
    
    this.players.set(userId, {
      mesh: playerGroup,
      targetPosition: new THREE.Vector3(initialPosition.x, initialPosition.y, initialPosition.z),
      targetRotation: new THREE.Euler(0, 0, 0),
      username
    })
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

    // Update target position for interpolation
    player.targetPosition.set(
      state.position.x,
      state.position.y - 1, // Adjust for capsule center offset
      state.position.z
    )

    // Update target rotation (only Y axis for body rotation)
    player.targetRotation.y = state.rotation.y
  }

  removePlayer(userId) {
    const player = this.players.get(userId)
    if (!player) return

    this.scene.remove(player.mesh)
    
    // Dispose resources
    player.mesh.traverse((child) => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (child.material.map) child.material.map.dispose()
        child.material.dispose()
      }
    })

    this.players.delete(userId)
    this.playerMaterials.delete(userId)
  }

  update() {
    // Interpolate all remote players towards their target positions
    this.players.forEach((player) => {
      // Position interpolation
      player.mesh.position.lerp(player.targetPosition, LERP_FACTOR)
      
      // Rotation interpolation (Y axis only)
      const currentY = player.mesh.rotation.y
      const targetY = player.targetRotation.y
      player.mesh.rotation.y = currentY + (targetY - currentY) * LERP_FACTOR
    })
  }

  getPlayerCount() {
    return this.players.size
  }

  dispose() {
    this.players.forEach((player, userId) => {
      this.removePlayer(userId)
    })
    this.playerGeometry.bodyGeometry.dispose()
    this.playerGeometry.headGeometry.dispose()
  }
}
