import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { COLORS, MODELS } from './CharacterSelect'
import './CharacterSelectModal.css'

export function CharacterSelectModal({ currentProfile, onClose, onSelect }) {
  const [selectedColor, setSelectedColor] = useState(currentProfile?.color || COLORS[7].value)
  const [selectedModel, setSelectedModel] = useState(currentProfile?.modelUrl || MODELS[0].file)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

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
      <div className="modal-content">
        <button className="close-btn" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal-header">
          <h2>Customize Character</h2>
          <p>Update your look in the game</p>
        </div>

        <div className="modal-section">
          <h3>Choose Model</h3>
          <div className="modal-models-grid">
            {MODELS.map((model) => (
              <div 
                key={model.file}
                className={`modal-model-card ${selectedModel === model.file ? 'active' : ''}`}
                onClick={() => setSelectedModel(model.file)}
              >
                <div className="modal-model-preview">
                  <span>{model.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-section">
          <h3>Choose Color</h3>
          <div className="modal-color-grid">
            {COLORS.map((color) => (
              <button
                key={color.name}
                className={`modal-color-btn ${selectedColor === color.value ? 'active' : ''}`}
                style={{ backgroundColor: color.value }}
                onClick={() => setSelectedColor(color.value)}
                title={color.name}
                type="button"
              />
            ))}
          </div>
        </div>

        <div className="modal-preview-area">
          <div 
            className="character-preview"
            style={{ backgroundColor: selectedColor }}
          >
             <div className="preview-face">
              <div className="preview-eye"></div>
              <div className="preview-eye"></div>
            </div>
          </div>
        </div>

        <button 
          className="save-btn" 
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
