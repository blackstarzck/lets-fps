import { useState, useRef, useEffect } from 'react'
import './Chat.css'

export function Chat({ messages, onSendMessage, players, isMaster, onKickPlayer }) {
  const [inputValue, setInputValue] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (inputValue.trim()) {
      onSendMessage(inputValue)
      setInputValue('')
    }
  }

  const handleKeyDown = (e) => {
    // Prevent game controls while typing
    e.stopPropagation()
    
    if (e.key === 'Escape') {
      inputRef.current?.blur()
      setIsExpanded(false)
    }
  }

  const handleFocus = () => {
    setIsExpanded(true)
  }

  return (
    <div className={`chat-container ${isExpanded ? 'expanded' : ''}`}>
      <div className="chat-header">
        <span className="chat-title">💬 Chat</span>
        <span className="player-count">👥 {players.length} online</span>
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty">No messages yet. Say hi!</div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className="chat-message">
              <span className="chat-username">{msg.username}:</span>
              <span className="chat-text">{msg.message}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-form">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder="Press Enter to chat..."
          maxLength={200}
          className="chat-input"
        />
        <button type="submit" className="chat-send">
          Send
        </button>
      </form>

      {isExpanded && (
        <div className="chat-players">
          <div className="players-title">Online Players:</div>
          {players.map((player, index) => (
            <div key={index} className="player-item">
              <span className="player-name">{player.username}</span>
              {isMaster && index > 0 && ( // First player is self, don't show kick button
                <button 
                  className="kick-btn"
                  onClick={(e) => {
                    e.stopPropagation() // Prevent chat collapse
                    if (window.confirm(`Are you sure you want to kick ${player.username}?`)) {
                      onKickPlayer(player.userId)
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
      )}
    </div>
  )
}
