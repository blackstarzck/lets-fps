import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as THREE from 'three'
import { GameEngine } from '../game/engine'
import { PlayerPhysics, STEPS_PER_FRAME } from '../game/physics'
import { PlayerController } from '../game/player'
import { MultiplayerManager } from '../game/multiplayer'
import { RemotePlayersManager } from '../game/remotePlayers'
import { Chat } from './Chat'
import { CharacterSelectModal } from './CharacterSelectModal'
import { getAllProfiles } from '../lib/supabase'
import './Game.css'

export function Game({ user, profile, onLogout, onChangeCharacter }) {
  const containerRef = useRef(null)
  const gameRef = useRef(null)
  const animationRef = useRef(null)
  
  const [isLoading, setIsLoading] = useState(true)
  const [isFadingOut, setIsFadingOut] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState('Initializing...')
  const [messages, setMessages] = useState([])
  const [onlinePlayers, setOnlinePlayers] = useState([])
  const [allProfiles, setAllProfiles] = useState([])
  const [isConnected, setIsConnected] = useState(false)
  const [isThirdPerson, setIsThirdPerson] = useState(false)
  const [ballColor, setBallColor] = useState(profile?.color || '#ffff00')
  const [showCharacterModal, setShowCharacterModal] = useState(false)
  const [notifications, setNotifications] = useState([])

  const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Player'
  const isMaster = user.email === 'bucheongosok@gmail.com'

  // Fetch all profiles on mount
  useEffect(() => {
    getAllProfiles().then(profiles => {
      console.log('Fetched profiles:', profiles)
      if (profiles && profiles.length > 0) {
        setAllProfiles(profiles)
      } else {
        // Fallback if no profiles table: at least show current user
        setAllProfiles([{ id: user.id, username, ...profile }])
      }
    })
  }, [])

  // Merge profiles with online status
  const playerList = useMemo(() => {
    // Map of online user IDs
    const onlineMap = new Set(onlinePlayers.map(p => p.userId))
    onlineMap.add(user.id) // Self is always online

    // Create list from all profiles
    let list = allProfiles.map(p => ({
        userId: p.id,
        username: p.username || p.display_name || 'Unknown',
        email: p.email, // Add email
        isOnline: onlineMap.has(p.id),
        isSelf: p.id === user.id
    }))

    // Add any online players not in profiles (guests/temp)
    onlinePlayers.forEach(op => {
        if (!list.find(p => p.userId === op.userId)) {
            list.push({
                userId: op.userId,
                username: op.username,
                email: 'Guest', // Default for unknown
                isOnline: true,
                isSelf: false
            })
        }
    })
    
    // Ensure self is in list if fetch failed
    if (!list.find(p => p.userId === user.id)) {
        list.push({
            userId: user.id,
            username,
            email: user.email, // Use current user email
            isOnline: true,
            isSelf: true
        })
    }

    // Sort: Self first, then Online, then Alphabetical
    return list.sort((a, b) => {
        if (a.isSelf) return -1
        if (b.isSelf) return 1
        if (a.isOnline && !b.isOnline) return -1
        if (!a.isOnline && b.isOnline) return 1
        return a.username.localeCompare(b.username)
    })
  }, [allProfiles, onlinePlayers, user.id, username])

  const addNotification = useCallback((message, type) => {
    const id = Date.now() + Math.random()
    setNotifications(prev => [...prev, { id, message, type }])

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 4000)
  }, [])

  const handleTogglePerspective = () => {
    if (gameRef.current?.controller) {
      const newMode = !isThirdPerson
      setIsThirdPerson(newMode)
      gameRef.current.controller.setPerspective(newMode)
    }
  }

  const handleBallColorChange = (e) => {
    const color = e.target.value
    setBallColor(color)
    if (gameRef.current?.controller) {
      gameRef.current.controller.setProjectileColor(color)
    }
  }

  const handleSendMessage = useCallback((message, color) => {
    if (gameRef.current?.multiplayer) {
      gameRef.current.multiplayer.sendChatMessage(message, color)
      // Add own message to chat
      setMessages(prev => [...prev, {
        userId: user.id,
        username,
        color: color || profile.color,
        message,
        timestamp: Date.now()
      }])
    }
  }, [user.id, username, profile])

  const handleKickPlayer = useCallback((targetUserId) => {
    if (gameRef.current?.multiplayer && isMaster) {
      gameRef.current.multiplayer.kickPlayer(targetUserId)
    }
  }, [isMaster])

  useEffect(() => {
    if (!containerRef.current) return

    let engine = null
    let physics = null
    let controller = null
    let multiplayer = null
    let remotePlayers = null
    let isRunning = true

    async function initGame() {
      try {
        console.log('Starting game initialization...')

        // Clear container first to prevent duplicate canvases
        if (containerRef.current) {
          containerRef.current.innerHTML = ''
        }

        // Step 1: Initialize Three.js engine
        setLoadingStatus('Setting up 3D engine...')
        engine = new GameEngine(containerRef.current)
        // Store engine reference immediately for cleanup
        if (!gameRef.current) gameRef.current = {}
        gameRef.current.engine = engine

        console.log('Engine initialized')

        // Setup Hit Callback
        engine.onProjectileHit = (targetUserId, impulse) => {
            // Find target userId from username (id stored in collider is username)
            // Wait, remoteColliders in remotePlayers.js sets id: player.username
            // We need userId to send message.
            // Let's fix remotePlayers to store userId in collider
            
            // Actually, we can look up via activeRemotePlayers map
            if (gameRef.current?.remotePlayers && gameRef.current?.multiplayer) {
                const rp = gameRef.current.remotePlayers
                let targetId = null
                
                // Find user by username (inefficient but works for now)
                // Better: update remotePlayers to pass userId in collider
                for (const [uid, p] of rp.players) {
                    if (p.username === targetUserId) {
                        targetId = uid;
                        break;
                    }
                }

                if (targetId) {
                    console.log(`Sending knockback to ${targetUserId} (${targetId})`)
                    gameRef.current.multiplayer.sendKnockback(targetId, impulse)
                }
            }
        }

        // Step 2: Load map
        setLoadingStatus('Loading map...')
        try {
          await engine.loadMap()
          console.log('Map loaded successfully')
        } catch (error) {
          console.warn('Map load failed, creating placeholder world:', error)
          createPlaceholderWorld(engine)
        }

        // Step 3: Initialize physics
        setLoadingStatus('Initializing physics...')
        console.log('Initializing Physics...')
        physics = new PlayerPhysics(engine.worldOctree)
        // Reset physics to ensure player starts at safe position
        physics.reset()
        console.log('Physics initialized')

        // Step 4: Initialize player controller
        setLoadingStatus('Setting up controls...')
        console.log('Initializing Controller...')
        controller = new PlayerController(engine.camera, physics, engine.renderer.domElement, engine, profile)
        console.log('Controls initialized')

        // Step 5: Initialize remote players manager
        console.log('Initializing RemotePlayers...')
        remotePlayers = new RemotePlayersManager(engine.scene)

        // Preload models for smooth multiplayer experience
        setLoadingStatus('Loading characters...')
        await remotePlayers.preloadModels()

        // Step 6: Connect to multiplayer
        setLoadingStatus('Connecting to server...')
        console.log('Connecting to Multiplayer...')
        multiplayer = new MultiplayerManager(user.id, username, profile)

        // Connect controller to multiplayer for projectile sync
        controller.setMultiplayer(multiplayer)

        // Set up multiplayer callbacks
        multiplayer.onPlayerMove = (data) => {
          // Use gameRef to ensure we use the active instance
          const activeRemotePlayers = gameRef.current?.remotePlayers
          if (!activeRemotePlayers) return

          if (!activeRemotePlayers.players.has(data.userId)) {
            console.log('[Game] Adding new player from move:', data.username, data.modelUrl)
            activeRemotePlayers.addPlayer(data.userId, data.username, data.color, data.position, data.model_url || data.modelUrl)
          }
          activeRemotePlayers.updatePlayer(data.userId, data)
        }

        multiplayer.onPlayerJoin = (presence) => {
          console.log('[Game] Player joined:', presence.username, presence.model_url)
          const activeRemotePlayers = gameRef.current?.remotePlayers
          const activeController = gameRef.current?.controller
          const activeMultiplayer = gameRef.current?.multiplayer

          let isNewPlayer = true;
          if (activeRemotePlayers) {
            // Check if player already exists
            if (activeRemotePlayers.players.has(presence.user_id)) {
              isNewPlayer = false;
            }
            activeRemotePlayers.addPlayer(presence.user_id, presence.username, presence.color, undefined, presence.model_url || presence.modelUrl)
          }

          if (isNewPlayer) {
            addNotification(`${presence.username} joined the game`, 'join')
          } else {
            console.log(`[Game] Player ${presence.username} updated (ignored join notification)`)
          }

          // Broadcast our position to the new player with a slight delay
          if (activeController) {
            console.log('Broadcasting initial position to new player')
            setTimeout(() => {
              if (gameRef.current?.multiplayer) {
                gameRef.current.multiplayer.broadcastPosition(activeController.getState(), true)
              }
            }, 500)
            // Send again to be safe
            setTimeout(() => {
              if (gameRef.current?.multiplayer) {
                gameRef.current.multiplayer.broadcastPosition(activeController.getState(), true)
              }
            }, 1500)
          }
        }

        multiplayer.onPlayerLeave = (presence) => {
          console.log('Player left:', presence.user_id)
          remotePlayers.removePlayer(presence.user_id)
          addNotification(`${presence.username} left the game`, 'leave')
        }

        multiplayer.onChatMessage = (data) => {
          setMessages(prev => [...prev.slice(-50), data]) // Keep last 50 messages
        }

        multiplayer.onPresenceSync = (state) => {
          console.log('[Game] Presence Sync:', state)
          const activeRemotePlayers = gameRef.current?.remotePlayers

          const playerList = Object.entries(state)
            .filter(([id]) => id !== user.id)
            .map(([id, presences]) => {
              const presence = presences[0]
              if (presence) {
                const modelUrl = presence.model_url || presence.modelUrl
                
                // Pre-create remote player (hidden until position sync)
                if (activeRemotePlayers) {
                  activeRemotePlayers.addPlayer(
                    id,
                    presence.username,
                    presence.color,
                    undefined,
                    modelUrl
                  )
                }
              }
              return {
                userId: id,
                username: presence?.username || 'Unknown'
              }
            })
          setOnlinePlayers(playerList)
        }

        // Handle remote projectile spawns
        console.log('Setting up onProjectileSpawn handler')
        multiplayer.onProjectileSpawn = (data) => {
          console.log('Game.jsx: onProjectileSpawn called with:', data)
          if (engine) {
            const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z)
            const velocity = new THREE.Vector3(data.velocity.x, data.velocity.y, data.velocity.z)
            console.log('Creating remote projectile at:', position, 'with velocity:', velocity)
            engine.createProjectile(position, velocity, data.color)
          } else {
            console.warn('Engine not available for projectile spawn')
          }
        }

        multiplayer.onKick = (data) => {
          if (data.targetUserId === user.id) {
            multiplayer.disconnect()
            alert('You have been kicked by the master.')
            onLogout()
          } else {
            console.log('Another player was kicked:', data.targetUserId)
            remotePlayers.removePlayer(data.targetUserId)
          }
        }

        multiplayer.onRequestState = (data) => {
          console.log('Received state request from:', data.userId)
          if (controller) {
            multiplayer.broadcastPosition(controller.getState(), true)
          }
        }

        multiplayer.onKnockback = (data) => {
            console.log('Received Knockback!', data.impulse)
            if (controller) {
                controller.applyKnockback(data.impulse)
            }
        }

        await multiplayer.connect()
        setIsConnected(true)

        // Request initial state from existing players with retries
        const requestStateWithRetry = () => {
          if (gameRef.current?.multiplayer) {
            gameRef.current.multiplayer.requestState()
          }
        }

        requestStateWithRetry()
        setTimeout(requestStateWithRetry, 1000)
        setTimeout(requestStateWithRetry, 2000)

        // Store references
        gameRef.current = {
          engine,
          physics,
          controller,
          multiplayer,
          remotePlayers
        }

          // Start game loop
        let frameCount = 0
        function gameLoop() {
          if (!isRunning) return

          const rawDeltaTime = engine.getDeltaTime()
          const subStepDelta = rawDeltaTime / STEPS_PER_FRAME
          const remoteColliders = remotePlayers.getRemoteColliders()

          // 1. Process Input Once per Frame
          // Pass full frame deltaTime to controller
          controller.update(rawDeltaTime)

          // 2. Physics substeps for accurate collision
          for (let i = 0; i < STEPS_PER_FRAME; i++) {
            physics.update(subStepDelta)
            physics.resolvePlayerCollisions(remoteColliders)
            physics.teleportIfOutOfBounds(engine.camera)
            engine.updateProjectiles(subStepDelta, physics, remoteColliders)
          }

          // Update remote players (animation)
          remotePlayers.update(rawDeltaTime)

          // Broadcast own position
          multiplayer.broadcastPosition(controller.getState())

          // Render
          engine.render()

          // After first few frames are rendered, start fade out
          frameCount++
          if (frameCount === 3) {
            setIsFadingOut(true)
            // Remove loading overlay after fade animation completes
            setTimeout(() => {
              setIsLoading(false)
            }, 500)
          }

          // Debug scene periodically
          if (frameCount % 120 === 0 && gameRef.current?.remotePlayers && gameRef.current?.engine) {
            console.log(`[Game] Engine Scene UUID: ${gameRef.current.engine.scene.uuid}`)
            gameRef.current.remotePlayers.debugScene()
          }

          animationRef.current = requestAnimationFrame(gameLoop)
        }

        animationRef.current = requestAnimationFrame(gameLoop)

      } catch (error) {
        console.error('Failed to initialize game:', error)
        setLoadingStatus(`Error: ${error.message}`)
      }
    }

    initGame()

    // Cleanup
    return () => {
      isRunning = false

      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }

      // Cleanup components
      if (multiplayer) multiplayer.disconnect()
      if (remotePlayers) remotePlayers.dispose()
      if (controller) controller.dispose()
      if (engine) engine.dispose()

      // Clear refs
      gameRef.current = null
    }
  }, [user.id, username]) // Removed profile to prevent re-init on change

  // Handle profile updates dynamically
  useEffect(() => {
    if (!gameRef.current || !profile) return

    const { controller, multiplayer, engine } = gameRef.current

    // Update Controller
    if (controller) {
      console.log('Updating controller profile:', profile)
      controller.profile = profile
      controller.setProjectileColor(profile.color)
      setBallColor(profile.color)

      // Reload model if changed
      if (controller.model) {
        engine.scene.remove(controller.model)
        controller.model = null
      }
      if (profile.modelUrl) {
        controller.loadModel(profile.modelUrl, profile.color)
      }
    }

    // Update Multiplayer
    if (multiplayer) {
      console.log('Updating multiplayer profile:', profile)
      multiplayer.profile = profile
      // Update presence
      if (multiplayer.channel) {
        multiplayer.channel.track({
          user_id: user.id,
          username: username,
          color: profile.color,
          model_url: profile.modelUrl,
          joined_at: new Date().toISOString()
        }).then(() => {
          // Force broadcast position to ensure others update the model immediately
          if (controller) {
            multiplayer.broadcastPosition(controller.getState(), true)
          }
        }).catch(err => console.error('Failed to update presence:', err))
      }
    }
  }, [profile, user.id, username])


  return (
    <div className="game-wrapper">
      <div ref={containerRef} className="game-container" />

      {isLoading && (
        <div className={`loading-overlay ${isFadingOut ? 'fade-out' : ''}`}>
          <div className="loading-content">
            <div className="spinner-container">
              <div className="loading-spinner" />
              <div className="spinner-inner" />
            </div>
            <h2 className="loading-title">Entering World</h2>
            <p className="loading-text">{loadingStatus}</p>
            <div className="loading-progress">
              <div className="loading-progress-bar" />
            </div>
          </div>
          <p className="loading-tip">Tip: Use WASD to move, SPACE to jump, and click to shoot!</p>
        </div>
      )}

      {!isLoading && (
        <>
          {/* Notifications */}
          <div className="notification-container">
            {notifications.map(notification => (
              <div
                key={notification.id}
                className={`notification-item ${notification.type === 'join' ? 'notification-join' : 'notification-leave'}`}
              >
                <span className="notification-icon">{notification.type === 'join' ? '👋' : '🚪'}</span>
                <span className="notification-text">{notification.message}</span>
              </div>
            ))}
          </div>

          <div className="game-hud">
            <div className="player-list-overlay">
              <div className="player-list-header">
                <span className="player-list-title">Players</span>
                <span className={`connection-dot ${isConnected ? 'connected' : ''}`} title={isConnected ? 'Connected' : 'Disconnected'} />
              </div>
              <div className="player-list-scroll">
                {playerList.map((player) => (
                  <div key={player.userId} className={`player-list-item ${player.isSelf ? 'self' : ''} ${!player.isOnline ? 'offline' : ''}`}>
                    <span className="player-status-indicator" title={player.isOnline ? 'Online' : 'Offline'}>
                      {player.isOnline ? '●' : '○'}
                    </span>
                    <div className="player-info-text">
                        <span className="player-name-text">{player.username}</span>
                        {player.email && <span className="player-email-text">{player.email}</span>}
                    </div>
                    {isMaster && player.isOnline && !player.isSelf && (
                      <button
                        className="kick-btn-overlay"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`Are you sure you want to kick ${player.username}?`)) {
                            handleKickPlayer(player.userId)
                          }
                        }}
                        title="Kick player"
                      >
                        🚫
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="hud-top">
              <div className="hud-controls">
                <button onClick={() => setShowCharacterModal(true)} className="secondary-btn">
                  Change Character
                </button>
                <button onClick={onLogout} className="logout-btn">
                  Logout
                </button>
              </div>
            </div>

            <div className="hud-center">
              <div className="crosshair">+</div>
            </div>

            <div className="hud-instructions">
              Click to start • WASD to move • SPACE to jump • ESC to unlock mouse
            </div>

            <div className="hud-settings">
              <div className="setting-item">
                <span className="setting-label">View:</span>
                <button
                  className={`view-btn ${isThirdPerson ? 'active' : ''}`}
                  onClick={handleTogglePerspective}
                >
                  {isThirdPerson ? '3rd Person' : '1st Person'}
                </button>
              </div>
              <div className="setting-item">
                <span className="setting-label">Ball Color:</span>
                <input
                  type="color"
                  value={ballColor}
                  onChange={handleBallColorChange}
                  className="color-picker"
                />
              </div>
            </div>
          </div>

            <Chat
            messages={messages}
            onSendMessage={handleSendMessage}
            players={onlinePlayers} // Use only online players for chat count? Or full list? Usually online.
            isMaster={isMaster}
            onKickPlayer={handleKickPlayer}
          />

          {showCharacterModal && (
            <CharacterSelectModal
              currentProfile={profile}
              onClose={() => setShowCharacterModal(false)}
              onSelect={(newProfile) => {
                // Update App state via callback
                if (onChangeCharacter) {
                  onChangeCharacter(newProfile)
                }
                setShowCharacterModal(false)
              }}
            />
          )}
        </>
      )}
    </div>
  )
}

// Create a simple placeholder world when map file is missing
function createPlaceholderWorld(engine) {
  // Ground plane
  const groundGeometry = new THREE.PlaneGeometry(100, 100)
  const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x4a7c4e })
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  engine.scene.add(ground)

  // Add some boxes for obstacles
  const boxGeometry = new THREE.BoxGeometry(2, 2, 2)
  const boxMaterial = new THREE.MeshLambertMaterial({ color: 0x8b7355 })

  const positions = [
    [5, 1, 5], [-5, 1, -5], [10, 1, -3], [-8, 1, 7],
    [0, 1, 15], [12, 1, 12], [-12, 1, -12]
  ]

  positions.forEach(([x, y, z]) => {
    const box = new THREE.Mesh(boxGeometry, boxMaterial)
    box.position.set(x, y, z)
    box.castShadow = true
    box.receiveShadow = true
    engine.scene.add(box)
  })

  // Rebuild octree with placeholder geometry
  engine.worldOctree.fromGraphNode(engine.scene)
}
