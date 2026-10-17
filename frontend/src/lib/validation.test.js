import { afterEach, describe, expect, it } from 'vitest'
import { clearAuthStorage, getAccessToken, getRefreshToken, readStoredUser, setAuthTokens, writeStoredUser } from '@/api/client'
import { authErrorMessage, isValidEmail, normalizeEmail, passwordProblem } from './validation'

const t = (_key, fallback, values) => String(fallback).replace(/\{\{(\w+)\}\}/g, (_, name) => values?.[name] ?? '')

describe('isValidEmail (mirrors the server rule)', () => {
  it.each(['a@b', 'x@', '@x.com', 'a b@x.com', '<script>@x.com', 'a..b@x.com', '.a@x.com', 'a@x..com', 'a@-x.com', 'a@x.c', `${'a'.repeat(250)}@x.com`, '', '   '])(
    'rejects %j', (email) => expect(isValidEmail(email)).toBe(false),
  )
  it.each(['  Mixed.Case+tag@Example.COM ', 'name@sub.clinic.example.org', "o'neil@example.kh"])(
    'accepts %j', (email) => expect(isValidEmail(email)).toBe(true),
  )
  it('normalises case and surrounding spaces', () => {
    expect(normalizeEmail('  Doctor@Example.COM ')).toBe('doctor@example.com')
  })
})

describe('passwordProblem', () => {
  it.each([['1234567', 'short'], ['        ', 'blank'], ['p'.repeat(129), 'long'], ['12345678', null], ['p'.repeat(128), null]])(
    '%j -> %j', (password, problem) => expect(passwordProblem(password)).toBe(problem),
  )
})

describe('authErrorMessage', () => {
  const apiError = (status, error) => ({ response: { status, data: { success: false, error } } })

  it('turns the raw rate-limit text into a readable message', () => {
    expect(authErrorMessage(apiError(429, { code: 'rate_limited', message: '5 per 1 minute' }), t, 'x').message)
      .toBe('Too many attempts. Please wait a minute and try again.')
  })
  it('translates known server messages and keeps the blamed field', () => {
    const result = authErrorMessage(apiError(400, { message: 'Email is already in use.', details: { field: 'email' } }), t, 'x')
    expect(result).toEqual({ field: 'email', message: 'An account with this email already exists. Try signing in instead.' })
    expect(authErrorMessage(apiError(401, { message: 'Invalid credentials.' }), t, 'x').message).toBe('Incorrect email or password.')
  })
  it('falls back for unknown errors', () => {
    expect(authErrorMessage({}, t, 'Registration failed').message).toBe('Registration failed')
  })
})

describe('"Remember me" session storage', () => {
  afterEach(() => clearAuthStorage())

  it('keeps an unremembered session only for this browser session', () => {
    setAuthTokens('a1', 'r1', { remember: false })
    writeStoredUser({ id: 1, name: 'Session User' })
    expect(sessionStorage.getItem('access_token')).toBe('a1')
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(readStoredUser()).toEqual({ id: 1, name: 'Session User' })
  })

  it('keeps a remembered session across browser restarts', () => {
    setAuthTokens('a2', 'r2', { remember: true })
    writeStoredUser({ id: 2 })
    expect(localStorage.getItem('access_token')).toBe('a2')
    expect(sessionStorage.getItem('access_token')).toBeNull()
    expect(readStoredUser()).toEqual({ id: 2 })
  })

  it('refreshing tokens keeps the session where it already is', () => {
    setAuthTokens('a3', 'r3', { remember: false })
    setAuthTokens('a4', 'r4')
    expect(getAccessToken()).toBe('a4')
    expect(getRefreshToken()).toBe('r4')
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('switching to a remembered sign-in clears the old session copy', () => {
    setAuthTokens('a5', 'r5', { remember: false })
    writeStoredUser({ id: 5 })
    setAuthTokens('a6', 'r6', { remember: true })
    expect(sessionStorage.getItem('access_token')).toBeNull()
    expect(sessionStorage.getItem('user')).toBeNull()
    expect(getAccessToken()).toBe('a6')
  })

  it('signing out clears both places', () => {
    setAuthTokens('a7', 'r7', { remember: true })
    sessionStorage.setItem('access_token', 'stale')
    clearAuthStorage()
    expect(getAccessToken()).toBeNull()
    expect(readStoredUser()).toBeNull()
  })
})
