import axios from 'axios'

export const ACCESS_TOKEN_KEY = 'access_token'
export const REFRESH_TOKEN_KEY = 'refresh_token'
export const AUTH_CLEARED_EVENT = 'auth:cleared'
const DEFAULT_API_TIMEOUT_MS = 30000

function resolveApiTimeout() {
  const configuredTimeout = Number(import.meta.env.VITE_API_TIMEOUT_MS)
  if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
    return configuredTimeout
  }
  return DEFAULT_API_TIMEOUT_MS
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:5001/api',
  timeout: resolveApiTimeout(),
})

const USER_KEY = 'user'

/**
 * Where the current session lives. "Remember me" keeps it in localStorage
 * (survives closing the browser); otherwise it is kept in sessionStorage and
 * ends with the browser session, which suits shared clinic computers.
 */
function sessionStore() {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY) ? sessionStorage : localStorage
}

export function getAccessToken() {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem(ACCESS_TOKEN_KEY) || localStorage.getItem('token')
}

export function getRefreshToken() {
  return sessionStore().getItem(REFRESH_TOKEN_KEY)
}

/**
 * Store tokens. Pass `remember` when signing in to choose where the session
 * lives; leave it out (token refresh, credential changes) to keep the
 * session where it already is.
 */
export function setAuthTokens(accessToken, refreshToken, { remember } = {}) {
  let store = sessionStore()
  if (remember !== undefined) {
    store = remember ? localStorage : sessionStorage
    const other = remember ? sessionStorage : localStorage
    for (const key of [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, 'token']) other.removeItem(key)
  }
  if (accessToken) {
    store.setItem(ACCESS_TOKEN_KEY, accessToken)
    localStorage.removeItem('token')
  }
  if (refreshToken) {
    store.setItem(REFRESH_TOKEN_KEY, refreshToken)
  }
}

/** The signed-in user saved alongside the tokens, or null. */
export function readStoredUser() {
  if (!getAccessToken()) return null
  try {
    return JSON.parse(sessionStore().getItem(USER_KEY) || 'null')
  } catch {
    return null
  }
}

export function writeStoredUser(user) {
  if (user) sessionStore().setItem(USER_KEY, JSON.stringify(user))
  else sessionStore().removeItem(USER_KEY)
}

export function clearAuthStorage() {
  for (const store of [localStorage, sessionStorage]) {
    for (const key of [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, USER_KEY, 'token']) store.removeItem(key)
  }
  window.dispatchEvent(new Event(AUTH_CLEARED_EVENT))
}

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise = null

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config
    const status = error?.response?.status

    if (!originalRequest || status !== 401) {
      return Promise.reject(error)
    }

    const requestUrl = originalRequest.url || ''
    const isAuthEndpoint = ['/auth/login', '/auth/refresh', '/auth/register', '/auth/google'].some((path) => requestUrl.includes(path))
    if (originalRequest._retry || isAuthEndpoint) {
      return Promise.reject(error)
    }

    // The tokens may have been replaced while this request was in flight
    // (e.g. a password or email change revokes older sessions and hands this
    // tab new ones). Retry with the current token instead of refreshing with
    // a refresh token the server has already invalidated.
    const sentToken = String(originalRequest.headers?.Authorization || '').replace(/^Bearer /, '')
    const currentToken = getAccessToken()
    if (currentToken && sentToken && currentToken !== sentToken) {
      originalRequest._retry = true
      originalRequest.headers.Authorization = `Bearer ${currentToken}`
      return api(originalRequest)
    }

    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      clearAuthStorage()
      return Promise.reject(error)
    }

    originalRequest._retry = true

    try {
      if (!refreshPromise) {
        refreshPromise = axios.post(`${api.defaults.baseURL}/auth/refresh`, { refresh_token: refreshToken }, { timeout: api.defaults.timeout })
      }

      const refreshResponse = await refreshPromise
      const refreshData = getApiData(refreshResponse)
      setAuthTokens(refreshData.access_token, refreshData.refresh_token)
      if (refreshData.user) writeStoredUser(refreshData.user)

      const accessToken = getAccessToken()
      if (accessToken) {
        originalRequest.headers.Authorization = `Bearer ${accessToken}`
      }

      return api(originalRequest)
    } catch (refreshError) {
      // Same race as above, detected after the refresh attempt.
      if (getRefreshToken() && getRefreshToken() !== refreshToken && getAccessToken()) {
        originalRequest.headers.Authorization = `Bearer ${getAccessToken()}`
        return api(originalRequest)
      }
      clearAuthStorage()
      return Promise.reject(refreshError)
    } finally {
      refreshPromise = null
    }
  },
)

export function getApiData(response) {
  if (!response || !response.data) {
    return null
  }

  if (typeof response.data.success === 'boolean') {
    return response.data.data
  }

  return response.data
}

export function getApiPaginated(response) {
  if (!response || !response.data) {
    return { data: [], page: 1, limit: 20, total: 0, totalPages: 1 }
  }

  const payload = response.data
  const items = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.data?.data)
      ? payload.data.data
      : Array.isArray(payload)
        ? payload
        : []

  const limit = payload.limit || payload.data?.limit || items.length || 20
  const total = payload.total ?? payload.data?.total ?? items.length
  const totalPages = payload.total_pages || payload.data?.total_pages || Math.max(1, Math.ceil(total / limit))

  return {
    data: items,
    page: payload.page || payload.data?.page || 1,
    limit,
    total,
    totalPages,
  }
}

export function getApiErrorMessage(error, fallbackMessage = 'Request failed') {
  const serverMessage = error?.response?.data?.error?.message
  const legacyMessage = error?.response?.data?.error
  if (serverMessage) return serverMessage
  if (legacyMessage) return legacyMessage
  if (error?.code === 'ECONNABORTED') {
    return 'Request timed out. Check that the backend server is running.'
  }
  if (error?.request && !error?.response) {
    return `Cannot connect to the backend at ${api.defaults.baseURL}. Start the backend server and try again.`
  }
  return fallbackMessage
}

export default api
