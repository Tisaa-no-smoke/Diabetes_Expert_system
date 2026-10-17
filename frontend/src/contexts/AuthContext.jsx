import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api, { AUTH_CLEARED_EVENT, clearAuthStorage, getAccessToken, getApiData, getRefreshToken, readStoredUser, setAuthTokens, writeStoredUser } from '../api/client'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(() => readStoredUser())

  // Persist a directly-set user before React re-renders: callers navigate
  // right after signing in, and a reload in that gap would otherwise find the
  // tokens without the user and fall back to the login page.
  const setUser = useCallback((next) => {
    if (typeof next !== 'function') writeStoredUser(next)
    setUserState(next)
  }, [])

  useEffect(() => {
    const onAuthCleared = () => setUserState(null)
    const onStorage = (event) => {
      if (event.key === 'user' || event.key === null) setUserState(readStoredUser())
    }
    window.addEventListener(AUTH_CLEARED_EVENT, onAuthCleared)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(AUTH_CLEARED_EVENT, onAuthCleared)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    writeStoredUser(user)
  }, [user])

  // Keep the cached user in sync (e.g. profile_completed flips after onboarding,
  // or an administrator changes this user's role permissions in another tab).
  useEffect(() => {
    if (!user?.id || !getAccessToken()) return
    let cancelled = false

    const syncUser = () => {
      api.get('/auth/me')
        .then((response) => {
          const data = getApiData(response)
          const nextUser = data?.user || data
          if (!cancelled && getAccessToken() && nextUser?.email) setUser((current) => current ? ({ ...current, ...nextUser }) : null)
        })
        .catch(() => { /* offline or token refresh in flight — cached user stays */ })
    }

    syncUser()
    const interval = window.setInterval(syncUser, 30000)
    window.addEventListener('focus', syncUser)
    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.removeEventListener('focus', syncUser)
    }
  }, [user?.id])

  const loginWithGoogle = async (credential) => {
    const response = await api.post('/auth/google', { credential })
    const data = getApiData(response)
    setAuthTokens(data.access_token || data.token, data.refresh_token, { remember: true })
    setUser(data.user)
    return data.user
  }

  const logout = async () => {
    try {
      await api.post('/auth/logout', { refresh_token: getRefreshToken() })
    } catch {
      // Best effort logout; local cleanup still enforced.
    } finally {
      clearAuthStorage()
      setUser(null)
      window.location.assign('/login')
    }
  }

  const refreshUser = async () => {
    const response = await api.get('/auth/me')
    const data = getApiData(response)
    const nextUser = data?.user || data
    if (nextUser?.email) setUser((current) => ({ ...current, ...nextUser }))
    return nextUser
  }

  const updateUser = (patch) => {
    setUser((current) => {
      const updated = { ...current, ...patch }
      writeStoredUser(updated)
      return updated
    })
  }

  const value = useMemo(() => ({
    user,
    setUser,
    updateUser,
    logout,
    refreshUser,
    loginWithGoogle,
  }), [user, setUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
