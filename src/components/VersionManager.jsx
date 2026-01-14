import { useEffect, useRef } from 'react'

export function VersionManager() {
  const versionRef = useRef(null)

  useEffect(() => {
    // Function to check version
    const checkVersion = async () => {
      try {
        // Append timestamp to bypass browser cache
        const res = await fetch(`/version.json?t=${Date.now()}`, {
            headers: { 'Cache-Control': 'no-cache' }
        })
        if (!res.ok) return

        const data = await res.json()
        const serverVersion = data.version

        // Initialize local version on first load
        if (!versionRef.current) {
            versionRef.current = serverVersion
            console.log(`[VersionManager] Current version: ${serverVersion}`)
            return
        }

        // Check mismatch
        if (versionRef.current !== serverVersion) {
            console.log(`[VersionManager] New version detected: ${serverVersion}. Reloading...`)
            // Force reload ignoring cache
            window.location.reload(true)
        }
      } catch (err) {
        // Silent fail (network error, etc)
        // console.warn('[VersionManager] Check failed', err)
      }
    }

    // Check immediately
    checkVersion()

    // Check every 60 seconds
    // Also check on visibility change (when user comes back to tab)
    const interval = setInterval(checkVersion, 60 * 1000)
    
    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            checkVersion()
        }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
        clearInterval(interval)
        document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null // Renderless component
}