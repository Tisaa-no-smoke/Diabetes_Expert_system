/**
 * Account field rules shared by the sign-in, sign-up, and profile forms.
 * They mirror backend/app/utils/validation.py so the browser catches what
 * the server would reject.
 */
import { getApiErrorMessage } from '@/api/client'

export const EMAIL_MAX_LENGTH = 254
export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const NAME_MAX_LENGTH = 120

const EMAIL_PATTERN = new RegExp(
  "^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+" +
  '@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?' +
  '(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*' +
  '\\.[A-Za-z]{2,63}$',
)

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase()
}

export function isValidEmail(value) {
  const email = normalizeEmail(value)
  const local = email.split('@')[0]
  return Boolean(
    email &&
    email.length <= EMAIL_MAX_LENGTH &&
    local.length <= 64 &&
    !email.includes('..') &&
    !local.startsWith('.') &&
    !local.endsWith('.') &&
    EMAIL_PATTERN.test(email),
  )
}

/** Why a new password is not acceptable, or null when it is. */
export function passwordProblem(password) {
  const value = String(password ?? '')
  if (value.length < PASSWORD_MIN_LENGTH) return 'short'
  if (value.length > PASSWORD_MAX_LENGTH) return 'long'
  if (!value.trim()) return 'blank'
  return null
}

export function passwordProblemMessage(problem, t) {
  if (problem === 'short') return t('auth.errors.passwordShort', 'Use at least {{min}} characters.', { min: PASSWORD_MIN_LENGTH })
  if (problem === 'long') return t('auth.errors.passwordLong', 'Use at most {{max}} characters.', { max: PASSWORD_MAX_LENGTH })
  if (problem === 'blank') return t('auth.errors.passwordBlank', 'A password cannot be only spaces.')
  return ''
}

/**
 * Translate an auth API error into the user's language. Returns the field the
 * server blamed (if any) so the form can highlight it.
 */
export function authErrorMessage(error, t, fallback) {
  const body = error?.response?.data?.error || {}
  const details = body.details || {}
  const message = body.message || ''
  const field = details.field || null

  if (body.code === 'rate_limited') {
    return { field: null, message: t('auth.errors.rateLimited', 'Too many attempts. Please wait a minute and try again.') }
  }
  if (details.rule === 'min_length' && /password/.test(field || '')) return { field, message: passwordProblemMessage('short', t) }
  if (details.rule === 'max_length' && /password/.test(field || '')) return { field, message: passwordProblemMessage('long', t) }
  if (details.rule === 'blank') return { field, message: passwordProblemMessage('blank', t) }

  const known = {
    'Invalid credentials.': ['auth.errors.invalidCredentials', 'Incorrect email or password.'],
    'User account is inactive.': ['auth.errors.inactive', 'This account has been disabled. Please contact your clinic administrator.'],
    'Email is already in use.': ['auth.errors.emailInUse', 'An account with this email already exists. Try signing in instead.'],
    'A valid email is required.': ['auth.errors.emailInvalid', 'Enter a valid email address, like name@example.com.'],
    'Name is required.': ['auth.errors.nameRequired', 'Enter your full name.'],
  }[message]
  if (known) return { field, message: t(known[0], known[1]) }
  if (details.rule === 'max_length' && field === 'name') {
    return { field, message: t('auth.errors.nameLong', 'Use at most {{max}} characters.', { max: NAME_MAX_LENGTH }) }
  }
  return { field, message: getApiErrorMessage(error, fallback) }
}
