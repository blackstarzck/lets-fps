import { useState } from 'react'
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

export function CharacterSelect({ username, onSelect }) {
  const [selectedColor, setSelectedColor] = useState(COLORS[7].value) // Default Blue

  const handleSubmit = (e) => {
    e.preventDefault()
    onSelect({ color: selectedColor })
  }

  return (
    <div className="char-select-container">
      <div className="char-select-card">
        <h1>Welcome, {username}!</h1>
        <p>Choose your character color</p>

        <div className="preview-container">
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

        <button className="start-btn" onClick={handleSubmit}>
          Enter World
        </button>
      </div>
    </div>
  )
}
