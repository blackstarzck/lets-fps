import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import './CharacterSelect.css'

const COLORS = [
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' }
]

const MODELS = [
  { name: 'Runner', file: 'Meshy_AI_Animation_Running_withSkin.glb' },
  { name: 'Purple Girl', file: 'Meshy_AI_purple_girly_grown_up_0113234503_texture.glb' },
  { name: 'Sunflower', file: 'Meshy_AI_Sunflower_Circle_Brea_0113234457_texture.glb' }
]

const STORAGE_URL = 'https://hgczujipznppjguxzkor.supabase.co/storage/v1/object/public/models/'

export function CharacterSelect({ username, onSelect }) {
  const [selectedColor, setSelectedColor] = useState(COLORS[7].value)
  const [selectedModel, setSelectedModel] = useState(MODELS[0].file)
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    <div className="char-select-container">
      <div className="char-select-card">
        <h1>Welcome, {username}!</h1>
        <p>Create your character</p>

        <div className="selection-section">
          <h3>1. Choose Model</h3>
          <div className="models-grid">
            {MODELS.map((model) => (
              <div 
                key={model.file}
                className={`model-card ${selectedModel === model.file ? 'active' : ''}`}
                onClick={() => setSelectedModel(model.file)}
              >
                <div className="model-preview-placeholder">
                  {/* In a real app, we might load a 3D preview or thumbnail here */}
                  <span>{model.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="selection-section">
          <h3>2. Choose Color (Tint)</h3>
          <div className="color-grid">
            {COLORS.map((color) => (
              <button
                key={color.name}
                className={`color-btn ${selectedColor === color.value ? 'active' : ''}`}
                style={{ backgroundColor: color.value }}
                onClick={() => setSelectedColor(color.value)}
                title={color.name}
                type="button"
              />
            ))}
          </div>
        </div>

        <div className="preview-container">
          <p>Preview (Color Only)</p>
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
          className="start-btn" 
          onClick={handleSubmit}
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating...' : 'Enter World'}
        </button>
      </div>
    </div>
  )
}
