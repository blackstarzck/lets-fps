import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { supabase } from '../lib/supabase'
import { MODELS, COLORS, STORAGE_URL } from '../game/constants'
import './CharacterSelect.css'

export { MODELS, COLORS } 

export function CharacterSelect({ username, onSelect }) {
  const fixedColor = '#ffffff'
  const [selectedModel, setSelectedModel] = useState(MODELS[0].file)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const modelRef = useRef(null)
  const mixerRef = useRef(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Three.js Preview Setup
  useEffect(() => {
    if (!canvasRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = null // Transparent background
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100)
    camera.position.set(0, 1.5, 3.5)
    camera.lookAt(0, 1.0, 0)

    // Renderer
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      antialias: true,
      alpha: true 
    })
    renderer.setSize(500, 500) // Fixed size for preview
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2)
    hemiLight.position.set(0, 20, 0)
    scene.add(hemiLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
    dirLight.position.set(3, 10, 5)
    dirLight.castShadow = true
    scene.add(dirLight)

    // Floor (invisible shadow catcher)
    const planeGeometry = new THREE.PlaneGeometry(10, 10)
    const planeMaterial = new THREE.ShadowMaterial({ opacity: 0.3 })
    const plane = new THREE.Mesh(planeGeometry, planeMaterial)
    plane.rotation.x = -Math.PI / 2
    plane.receiveShadow = true
    scene.add(plane)

    // Animation Loop
    const clock = new THREE.Clock()
    let animationFrameId

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate)
      const delta = clock.getDelta()

      if (modelRef.current) {
        // Slow rotation
        modelRef.current.rotation.y += delta * 0.5
      }

      if (mixerRef.current) {
        mixerRef.current.update(delta)
      }

      renderer.render(scene, camera)
    }

    animate()

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId)
      renderer.dispose()
      // Note: scene clearing handled in loadModel
    }
  }, [])

  // Load Model when selection changes
  useEffect(() => {
    if (!sceneRef.current) return

    let isMounted = true

    const loadModel = async () => {
      try {
        // Remove previous model
        if (modelRef.current) {
          sceneRef.current.remove(modelRef.current)
          modelRef.current = null
          mixerRef.current = null
        }

        const modelDef = MODELS.find(m => m.file === selectedModel)
        const url = selectedModel.startsWith('http') ? selectedModel : STORAGE_URL + selectedModel
        
        const loader = new GLTFLoader()
        const gltf = await new Promise((resolve, reject) => {
          loader.load(url, resolve, undefined, reject)
        })

        if (!isMounted) return

        // Use SkeletonUtils to safely clone
        const model = SkeletonUtils.clone(gltf.scene)
        
        // Normalize scale and position
        model.scale.set(0.75, 0.75, 0.75) // Reduce size by half from 1.5
        model.position.set(0, (modelDef?.yOffset || 0) * 0.5, 0) // Adjust offset for smaller scale

        // Setup shadows
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
          }
        })

        // Setup Animation (Play first clip)
        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model)
          const action = mixer.clipAction(gltf.animations[0])
          action.play()
          mixerRef.current = mixer
        }

        sceneRef.current.add(model)
        modelRef.current = model

      } catch (err) {
        console.error('Failed to load preview model:', err)
      }
    }

    loadModel()
    
    return () => { isMounted = false }
  }, [selectedModel])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Update user metadata with character selection
      const { data, error } = await supabase.auth.updateUser({
        data: {
          color: fixedColor,
          model_url: selectedModel,
          has_character: true
        }
      })

      if (error) throw error

      onSelect({
        color: fixedColor,
        modelUrl: selectedModel
      })
    } catch (error) {
      console.error('Failed to save character:', error)
      alert('Failed to save character selection')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className={`char-select-container ${mounted ? 'visible' : ''}`}>
      <div className="bg-animation">
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>
        <div className="orb orb-3"></div>
      </div>
      
      <div className="char-select-card glass-panel wide-card">
        <div className="header-section">
          <h1 className="gradient-text">Welcome, {username}</h1>
          <p className="subtitle">Initialize Your Avatar</p>
        </div>

        <div className="content-grid-row">
          <div className="selection-column">
            <div className="selection-section">
              <div className="section-header">
                <h3>Select Model</h3>
              </div>
              <div className="models-list-vertical">
                {MODELS.map((model) => (
                  <div 
                    key={model.file}
                    className={`model-list-item ${selectedModel === model.file ? 'active' : ''}`}
                    onClick={() => setSelectedModel(model.file)}
                  >
                    <span className="model-name">{model.name}</span>
                    {selectedModel === model.file && <span className="check-mark">✓</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="preview-column">
            <div className="preview-container-3d">
              <div className="preview-label">Live Preview</div>
              <canvas ref={canvasRef} className="preview-canvas-3d" />
            </div>

            <button 
              className="start-btn" 
              onClick={handleSubmit}
              disabled={isSubmitting}
            >
              <span className="btn-content">
                {isSubmitting ? 'INITIALIZING...' : 'ENTER WORLD'}
              </span>
              <div className="btn-glow"></div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
