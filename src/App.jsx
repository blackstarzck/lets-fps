import { useState, useEffect } from 'react'
import { AuthForm } from './components/Auth'
import { CharacterSelect } from './components/CharacterSelect'
import { Game } from './components/Game'
import { supabase, signIn, signUp, signOut, getSession, onAuthStateChange } from './lib/supabase'
import './App.css'

function App() {
  const [user, setUser] = useState(null)
  const [characterProfile, setCharacterProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check initial session
    getSession().then(({ session }) => {
      const currentUser = session?.user || null
      setUser(currentUser)
      // Always start from character select screen - don't auto-load profile
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = onAuthStateChange((_event, session) => {
      const currentUser = session?.user || null
      setUser(currentUser)
      // Reset character profile on auth change (login/logout)
      setCharacterProfile(null)
    })

    return () => subscription.unsubscribe()
  }, [])

  const handleAuth = async (email, password, username, isLogin) => {
    if (isLogin) {
      const { data, error } = await signIn(email, password)
      if (error) throw error
      setUser(data.user)
    } else {
      const { data, error } = await signUp(email, password, username)
      if (error) throw error
      
      // If email confirmation is required, show message
      if (data.user && !data.session) {
        throw new Error('Please check your email to confirm your account')
      }
      
      setUser(data.user)
    }
  }

  const handleCharacterSelect = (profile) => {
    setCharacterProfile(profile)
  }

  const handleLogout = async () => {
    await signOut()
    setUser(null)
    setCharacterProfile(null)
  }

  const handleChangeCharacter = (newProfile) => {
    // If newProfile is provided (from modal), update it
    // Otherwise, reset to null to show character select screen
    if (newProfile) {
      setCharacterProfile(newProfile)
    } else {
      setCharacterProfile(null)
    }
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="app">
        <AuthForm onLogin={handleAuth} />
      </div>
    )
  }

  if (!characterProfile) {
    const username = user.user_metadata?.username || user.email?.split('@')[0] || 'Player'
    return (
      <div className="app">
        <CharacterSelect username={username} onSelect={handleCharacterSelect} />
      </div>
    )
  }

  return (
    <div className="app">
      <Game 
        user={user} 
        profile={characterProfile} 
        onLogout={handleLogout}
        onChangeCharacter={handleChangeCharacter}
      />
    </div>
  )
}

export default App
