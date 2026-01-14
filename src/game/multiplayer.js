import { supabase } from '../lib/supabase'

const BROADCAST_INTERVAL_MS = 1000 / 30 // 30 updates per second

export class MultiplayerManager {
  constructor(userId, username, profile) {
    this.userId = userId
    this.username = username
    this.profile = profile || { color: '#ffffff' }
    this.channel = null
    this.lastBroadcastTime = 0
    this.lastPosition = { x: 0, y: 0, z: 0 }
    
    // Callbacks
    this.onPlayerJoin = null
    this.onPlayerLeave = null
    this.onPlayerMove = null
    this.onChatMessage = null
    this.onPresenceSync = null
    this.onProjectileSpawn = null
    this.onKick = null
    this.onRequestState = null
  }

  async connect(roomId = 'world-1') {
    this.channel = supabase.channel(roomId, {
      config: {
        presence: { key: this.userId },
        broadcast: { ack: false, self: false }
      }
    })

    // Listen for player position updates
    this.channel.on('broadcast', { event: 'player-move' }, (payload) => {
      if (this.onPlayerMove && payload.payload.userId !== this.userId) {
        this.onPlayerMove(payload.payload)
      }
    })

    // Listen for state requests (new player joining)
    this.channel.on('broadcast', { event: 'request-state' }, (payload) => {
      console.log(`[Multiplayer] Received request-state from ${payload.payload.userId}`)
      if (this.onRequestState && payload.payload.userId !== this.userId) {
        this.onRequestState(payload.payload)
      }
    })

    // Listen for chat messages
    this.channel.on('broadcast', { event: 'chat-message' }, (payload) => {
      if (this.onChatMessage && payload.payload.userId !== this.userId) {
        this.onChatMessage(payload.payload)
      }
    })

    // Listen for projectile spawns
    this.channel.on('broadcast', { event: 'projectile-spawn' }, (payload) => {
      if (this.onProjectileSpawn && payload.payload.userId !== this.userId) {
        this.onProjectileSpawn(payload.payload)
      }
    })

    // Listen for kick events
    this.channel.on('broadcast', { event: 'kick-event' }, (payload) => {
      if (this.onKick) {
        this.onKick(payload.payload)
      }
    })

    // Listen for presence sync
    this.channel.on('presence', { event: 'sync' }, () => {
      const state = this.channel.presenceState()
      if (this.onPresenceSync) {
        this.onPresenceSync(state)
      }
    })

    // Listen for player joins
    this.channel.on('presence', { event: 'join' }, ({ newPresences }) => {
      if (this.onPlayerJoin) {
        newPresences.forEach(presence => {
          if (presence.user_id !== this.userId) {
            this.onPlayerJoin(presence)
          }
        })
      }
    })

    // Listen for player leaves
    this.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
      if (this.onPlayerLeave) {
        const currentState = this.channel.presenceState()
        leftPresences.forEach(presence => {
          // Check if this user is still in the state (meaning it was just an update, not a leave)
          const userId = presence.user_id
          const isStillHere = Object.keys(currentState).includes(userId)
          
          if (!isStillHere) {
             this.onPlayerLeave(presence)
          } else {
             console.log(`[Multiplayer] User ${userId} updated presence (ignored leave event)`)
          }
        })
      }
    })

    // Subscribe and track presence
    return new Promise((resolve, reject) => {
      // Timeout to prevent hanging indefinetely
      const timeoutId = setTimeout(() => {
        console.warn('Multiplayer connection timed out, proceeding in offline mode')
        resolve() // Resolve anyway to let the game start
      }, 5000)

      this.channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          clearTimeout(timeoutId)
          console.log('Successfully subscribed to channel')
          try {
            await this.channel.track({
              user_id: this.userId,
              username: this.username,
              color: this.profile.color,
              model_url: this.profile.modelUrl, // Add modelUrl to presence
              joined_at: new Date().toISOString()
            })
            console.log('Presence tracked')
          } catch (err) {
            console.error('Failed to track presence:', err)
          }
          resolve()
        } else if (status === 'CHANNEL_ERROR') {
          clearTimeout(timeoutId)
          console.error('Channel error')
          reject(new Error('Failed to subscribe to channel'))
        }
      })
    })
  }

  broadcastPosition(state, force = false) {
    if (!this.channel) return

    const now = performance.now()
    
    // Throttle broadcasts, unless forced
    if (!force && now - this.lastBroadcastTime < BROADCAST_INTERVAL_MS) {
      return
    }

    // Only broadcast if position changed significantly, unless forced
    const pos = state.position
    const threshold = 0.01
    const moved = 
      Math.abs(pos.x - this.lastPosition.x) > threshold ||
      Math.abs(pos.y - this.lastPosition.y) > threshold ||
      Math.abs(pos.z - this.lastPosition.z) > threshold

    if (!moved && !force) return

    if (force) console.log(`[Multiplayer] Broadcasting position (FORCED) for ${this.userId}`)

    this.channel.send({
      type: 'broadcast',
      event: 'player-move',
      payload: {
        userId: this.userId,
        username: this.username,
        color: this.profile.color,
        modelUrl: this.profile.modelUrl, // Add modelUrl to broadcast
        ...state,
        timestamp: Date.now()
      }
    })

    this.lastBroadcastTime = now
    this.lastPosition = { ...pos }
  }

  sendChatMessage(message) {
    if (!this.channel || !message.trim()) return

    this.channel.send({
      type: 'broadcast',
      event: 'chat-message',
      payload: {
        userId: this.userId,
        username: this.username,
        color: this.profile.color,
        message: message.trim(),
        timestamp: Date.now()
      }
    })
  }

  kickPlayer(targetUserId) {
    if (!this.channel) return

    console.log('Broadcasting kick event for user:', targetUserId)
    
    this.channel.send({
      type: 'broadcast',
      event: 'kick-event',
      payload: {
        targetUserId: targetUserId,
        kickedBy: this.userId,
        timestamp: Date.now()
      }
    })
  }

  broadcastProjectile(position, velocity, color) {
    if (!this.channel) {
      console.warn('Cannot broadcast projectile: No channel')
      return
    }

    console.log('Broadcasting projectile:', { position, velocity, color })
    
    this.channel.send({
      type: 'broadcast',
      event: 'projectile-spawn',
      payload: {
        userId: this.userId,
        position: { x: position.x, y: position.y, z: position.z },
        velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
        color,
        timestamp: Date.now()
      }
    }).then(status => {
      console.log('Broadcast send status:', status)
    }).catch(err => {
      console.error('Broadcast failed:', err)
    })
  }

  requestState() {
    if (!this.channel) return

    console.log('Requesting game state from other players...')
    this.channel.send({
      type: 'broadcast',
      event: 'request-state',
      payload: {
        userId: this.userId,
        timestamp: Date.now()
      }
    })
  }

  async disconnect() {
    if (this.channel) {
      await this.channel.untrack()
      await supabase.removeChannel(this.channel)
      this.channel = null
    }
  }
}
