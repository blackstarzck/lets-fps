import { useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js'
import { supabase } from '../lib/supabase'
import { MODELS, STORAGE_URL } from '../game/constants'
import './CharacterSelectModal.css'

export function CharacterSelectModal({ currentProfile, onClose, onSelect }) {
  // Default to white if no color, as we removed tint selection
  const fixedColor = '#ffffff' 
  const [selectedModel, setSelectedModel] = useState(currentProfile?.modelUrl || MODELS[0].file)
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const modelRef = useRef(null)
  const mixerRef = useRef(null)

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  // Three.js Preview Setup
  useEffect(() => {
    if (!canvasRef.current) return

    // Scene setup
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x1a1a2e) // Dark blue background
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
    renderer.setSize(400, 400) // Fixed size for preview
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true

    // Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0)
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

      // Check mixer ref directly from ref object to avoid closure staleness
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
      // Note: model removal handled in loadModel effect
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
          mixerRef.current = null // Clear mixer
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
      
      onClose()
    } catch (error) {
      console.error('Failed to save character:', error)
      alert('Failed to save character selection')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Close when clicking backdrop
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <div className="modal-overlay" onClick={handleBackdropClick}>
      <div className="modal-content wide-modal">
        <button className="close-btn" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal-header">
          <h2>Customize Character</h2>
          <p>Choose your avatar</p>
        </div>

        <div className="modal-body-row">
          {/* Left Column: Selection */}
          <div className="modal-section left-col">
            <h3>Choose Model</h3>
            <div className="modal-models-list">
              {MODELS.map((model) => (
                <div 
                  key={model.file}
                  className={`modal-model-item ${selectedModel === model.file ? 'active' : ''}`}
                  onClick={() => setSelectedModel(model.file)}
                >
                  <span className="model-name">{model.name}</span>
                  {selectedModel === model.file && <span className="check-mark">✓</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Live Preview */}
          <div className="modal-section right-col">
            <h3>Live Preview</h3>
            <div className="canvas-container">
              <canvas ref={canvasRef} className="preview-canvas" />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button 
            className="save-btn" 
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : 'Confirm Selection'}
          </button>
        </div>
      </div>
    </div>
  )
}
