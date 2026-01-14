import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS, MODELS } from '../game/constants'
import './CharacterSelect.css'

export { COLORS, MODELS } // Re-export for compatibility if needed

export function CharacterSelect({ username, onSelect }) {
  const [selectedColor, setSelectedColor] = useState(COLORS[7].value)
  const [selectedModel, setSelectedModel] = useState(MODELS[0].file)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Update user metadata with character selection
      const { data, error } = await supabase.auth.updateUser({
        data: {
          color: selectedColor,
          model_url: selectedModel,
          has_character: true
        }
      })

      if (error) throw error

      onSelect({
        color: selectedColor,
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
      
      <div className="char-select-card glass-panel">
        <div className="header-section">
          <h1 className="gradient-text">Welcome, {username}</h1>
          <p className="subtitle">Initialize Your Avatar</p>
        </div>

        <div className="content-grid">
          <div className="selection-column">
            <div className="selection-section">
              <div className="section-header">
                <span className="step-number">01</span>
                <h3>Select Model</h3>
              </div>
              <div className="models-grid">
                {MODELS.map((model) => (
                  <div 
                    key={model.file}
                    className={`model-card ${selectedModel === model.file ? 'active' : ''}`}
                    onClick={() => setSelectedModel(model.file)}
                  >
                    <div className="model-card-content">
                      <div className="model-icon">
                        {/* Simple geometric representation */}
                        <div className="cube-icon"></div>
                      </div>
                      <span className="model-name">{model.name}</span>
                    </div>
                    {selectedModel === model.file && <div className="glow-effect"></div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="selection-section">
              <div className="section-header">
                <span className="step-number">02</span>
                <h3>Select Tint</h3>
              </div>
              <div className="color-grid">
                {COLORS.map((color) => (
                  <button
                    key={color.name}
                    className={`color-btn ${selectedColor === color.value ? 'active' : ''}`}
                    style={{ backgroundColor: color.value }}
                    onClick={() => setSelectedColor(color.value)}
                    title={color.name}
                    type="button"
                  >
                    {selectedColor === color.value && <div className="active-dot"></div>}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="preview-column">
            <div className="preview-container">
              <div className="preview-label">Live Preview</div>
              <div 
                className="character-preview"
                style={{ 
                  backgroundColor: selectedColor,
                  boxShadow: `0 0 50px ${selectedColor}60`
                }}
              >
                 <div className="preview-face">
                  <div className="preview-eye"></div>
                  <div className="preview-eye"></div>
                </div>
                <div className="scan-line"></div>
              </div>
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
