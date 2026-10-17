import { useState, useMemo, useEffect, useRef } from 'react'
import { AlertCircle, Eye, EyeOff, LockKeyhole, Mail, User } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api, { getApiData, setAuthTokens } from '../api/client'
import {
  authErrorMessage,
  EMAIL_MAX_LENGTH,
  isValidEmail,
  NAME_MAX_LENGTH,
  normalizeEmail,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordProblem,
  passwordProblemMessage,
} from '@/lib/validation'
import { useAuth } from '@/contexts/AuthContext'
import { useLanguage } from '@/contexts/LanguageContext'
import { LanguageSwitcher } from '@/components/auth/LanguageSwitcher'
import { AuthShowcasePanel } from '@/components/auth/AuthShowcasePanel'
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton'

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

function FieldError({ id, message }) {
  if (!message) return null
  return (
    <p id={id} className="flex items-center gap-1 pt-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
      <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
      {message}
    </p>
  )
}

export function SignUpPage() {
  const { setUser, loginWithGoogle } = useAuth()
  const { language, t } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()



  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    // Consent must be an active choice, so the box starts unticked.
    agreeToTerms: false,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // Field messages appear once a field has been left or the form submitted,
  // not while someone is still typing their first characters.
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [serverFieldErrors, setServerFieldErrors] = useState({})

  const transitionDirection = location.state?.authTransition
  const formAnimationClass =
    transitionDirection === 'to-register'
      ? 'auth-anim-to-register'
      : transitionDirection === 'to-login'
      ? 'auth-anim-to-login'
      : 'auth-anim-default'

  const fieldErrors = useMemo(() => {
    const errors = {}
    const name = formData.name.trim()
    if (!name) errors.name = t('auth.errors.nameRequired', 'Enter your full name.')
    else if (name.length > NAME_MAX_LENGTH) errors.name = t('auth.errors.nameLong', 'Use at most {{max}} characters.', { max: NAME_MAX_LENGTH })
    if (!formData.email.trim()) errors.email = t('auth.errors.emailRequired', 'Enter your email address.')
    else if (!isValidEmail(formData.email)) errors.email = t('auth.errors.emailInvalid', 'Enter a valid email address, like name@example.com.')
    const problem = passwordProblem(formData.password)
    if (problem) errors.password = passwordProblemMessage(problem, t)
    if (!formData.confirmPassword) errors.confirmPassword = t('auth.errors.confirmRequired', 'Type the same password again.')
    else if (formData.password !== formData.confirmPassword) errors.confirmPassword = t('auth.errorPasswordMismatch', 'Password and confirm password must match.')
    if (!formData.agreeToTerms) errors.terms = t('auth.errorAgreeTerms', 'Please agree to the terms and conditions.')
    return { ...errors, ...serverFieldErrors }
  }, [formData, serverFieldErrors, t])

  const inputClass = (field, base) =>
    visibleError(field) ? base.replace('border-slate-200 dark:border-slate-800', 'border-red-400 dark:border-red-700') : base
  const visibleError = (field) => ((submitted || touched[field]) ? fieldErrors[field] : '')
  const markTouched = (field) => () => setTouched((current) => ({ ...current, [field]: true }))
  const updateField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }))
    if (serverFieldErrors[field]) setServerFieldErrors(({ [field]: _cleared, ...rest }) => rest)
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    const order = ['name', 'email', 'password', 'confirmPassword', 'terms']
    const firstInvalid = order.find((field) => fieldErrors[field])
    if (firstInvalid) {
      document.getElementById(firstInvalid === 'terms' ? 'terms' : firstInvalid)?.focus()
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await api.post('/auth/register', {
        name: formData.name.trim(),
        email: normalizeEmail(formData.email),
        password: formData.password,
      })
      const data = getApiData(response)
      setAuthTokens(data.access_token || data.token, data.refresh_token, { remember: true })
      setUser(data.user)
      navigate('/profile-setup')
    } catch (err) {
      const { field, message } = authErrorMessage(err, t, t('auth.errorRegistrationFailed', 'Registration failed'))
      if (['name', 'email', 'password'].includes(field)) {
        setServerFieldErrors({ [field]: message })
        document.getElementById(field)?.focus()
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSuccess(tokenOrCredential) {
    const token = tokenOrCredential?.access_token || tokenOrCredential?.credential || tokenOrCredential
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const user = await loginWithGoogle(token)
      if (user?.role === 'patient' && !user?.profile_completed) {
        navigate('/profile-setup')
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      setError(authErrorMessage(err, t, t('auth.errorGoogleLoginFailed', 'Google sign-in failed. Please try again.')).message)
    } finally {
      setLoading(false)
    }
  }

  function handleGoogleError(err) {
    console.error('Google signup error:')
    setError(t('auth.errorGoogleLoginFailed', 'Google sign-in failed. Please try again.'))
  }

  return (
    <div className="h-screen h-[100dvh] max-h-[100dvh] w-full flex flex-col lg:flex-row overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans selection:bg-blue-500/20">
      <style>{`


        html[lang='km'] .auth-heading {
          line-height: 1.4;
        }

        @keyframes authSlideInFromLeft {
          0% {
            opacity: 0;
            transform: translateX(-36px) scale(0.985);
            filter: blur(4px);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes authSlideInFromRight {
          0% {
            opacity: 0;
            transform: translateX(36px) scale(0.985);
            filter: blur(4px);
          }
          100% {
            opacity: 1;
            transform: translateX(0) scale(1);
            filter: blur(0);
          }
        }

        @keyframes authFadeInUp {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.99);
            filter: blur(3px);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
            filter: blur(0);
          }
        }

        .auth-anim-to-login {
          animation: authSlideInFromLeft 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
          will-change: transform, opacity, filter;
        }

        .auth-anim-to-register {
          animation: authSlideInFromRight 420ms cubic-bezier(0.16, 1, 0.3, 1) both;
          will-change: transform, opacity, filter;
        }

        .auth-anim-default {
          animation: authFadeInUp 380ms cubic-bezier(0.16, 1, 0.3, 1) both;
          will-change: transform, opacity, filter;
        }

        @media (min-height: 620px) {
          .auth-form-column {
            overflow-y: hidden !important;
          }
        }
      `}</style>

      {/* ── LEFT HALF: Sign Up Form ── */}
      <div className="auth-form-column w-full lg:w-1/2 h-full max-h-[100dvh] flex flex-col justify-between px-6 py-4 sm:px-10 sm:py-5 lg:px-12 lg:py-6 relative overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-r border-slate-200/80 dark:border-slate-800">
        {/* Header bar: Logo & Language Switcher */}
        <div className="flex items-center justify-between gap-4 w-full shrink-0">
          <Link to="/" className="inline-flex items-center gap-2.5 group transition-opacity hover:opacity-90">
            <img
              src="/images/logo.png"
              alt="Diabetes Expert System Logo"
              className="w-8 h-8 sm:w-9 sm:h-9 object-contain drop-shadow-sm group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-1"
                style={{ fontFamily: 'var(--font-latin-display)' }}
              >
                Diabetes Expert System
              </span>
              <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-none">
                {language === 'km' ? 'ប្រព័ន្ធជំនាញគ្លីនិក v3.0' : 'Clinical Decision Support v3.0'}
              </span>
            </div>
          </Link>

          <LanguageSwitcher />
        </div>

        {/* Center Form Container */}
        <div className={`w-full max-w-[440px] mx-auto my-auto py-2 sm:py-2.5 ${formAnimationClass}`}>

          {/* Eyebrow badge */}
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200/70 dark:border-emerald-800/60 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 animate-pulse" />
            <span>{language === 'km' ? 'ការចុះឈ្មោះគណនីថ្មី' : 'Clinical Self-Registration'}</span>
          </div>

          <h1
            className="auth-heading text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight"
            style={{ fontFamily: 'var(--font-latin-display)' }}
          >
            {t('auth.signUp', 'Create Account')}
          </h1>
          <p
            className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5 mb-3"
            style={{ fontFamily: 'var(--font-latin-sans)' }}
          >
            {t('auth.regSubTitle', 'Join to access diagnostic tools, patient records, and follow-up care.')}
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-2.5" style={{ fontFamily: 'var(--font-latin-sans)' }}>
            {/* Full Name */}
            <div className="space-y-1">
              <label htmlFor="name" className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {t('auth.fullNameLabel', 'Full Name')}
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none">
                  <User size={16} />
                </span>
                <input
                  id="name"
                  name="name"
                  type="text"
                  required
                  maxLength={NAME_MAX_LENGTH + 20}
                  autoComplete="name"
                  value={formData.name}
                  onChange={(e) => updateField('name', e.target.value)}
                  onBlur={markTouched('name')}
                  aria-invalid={Boolean(visibleError('name')) || undefined}
                  aria-describedby={visibleError('name') ? 'name-error' : undefined}
                  className={inputClass('name', 'w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all')}
                  placeholder={t('auth.namePlaceholder', 'Dr. John Doe')}
                />
              </div>
              <FieldError id="name-error" message={visibleError('name')} />
            </div>

            {/* Email Address */}
            <div className="space-y-1">
              <label htmlFor="email" className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                {t('auth.emailLabel', 'Email Address')}
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none">
                  <Mail size={16} />
                </span>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  maxLength={EMAIL_MAX_LENGTH}
                  value={formData.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  onBlur={markTouched('email')}
                  aria-invalid={Boolean(visibleError('email')) || undefined}
                  aria-describedby={visibleError('email') ? 'email-error' : undefined}
                  className={inputClass('email', 'w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all')}
                  placeholder="doctor@example.com"
                  autoComplete="username"
                />
              </div>
              <FieldError id="email-error" message={visibleError('email')} />
            </div>

            {/* Password & Confirm Password (Responsive 2-col on sm+) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* Password */}
              <div className="space-y-1">
                <label htmlFor="password" className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  {t('auth.passwordLabel', 'Password')}
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none">
                    <LockKeyhole size={16} />
                  </span>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                  required
                    maxLength={PASSWORD_MAX_LENGTH}
                    value={formData.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    onBlur={markTouched('password')}
                    aria-invalid={Boolean(visibleError('password')) || undefined}
                    aria-describedby={visibleError('password') ? 'password-error' : undefined}
                    className={inputClass('password', 'w-full pl-9 pr-9 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all')}
                    placeholder={t('auth.passwordMinPlaceholder', 'At least {{min}} characters', { min: PASSWORD_MIN_LENGTH })}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                    aria-label={showPassword ? t('auth.hidePassword', 'Hide password') : t('auth.showPassword', 'Show password')}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <FieldError id="password-error" message={visibleError('password')} />
              </div>

              {/* Confirm Password */}
              <div className="space-y-1">
                <label htmlFor="confirmPassword" className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  {t('auth.confirmPasswordLabel', 'Confirm')}
                </label>
                <div className="relative flex items-center">
                  <span className="absolute left-3 text-slate-400 dark:text-slate-500 pointer-events-none">
                    <LockKeyhole size={16} />
                  </span>
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                  required
                    maxLength={PASSWORD_MAX_LENGTH}
                    value={formData.confirmPassword}
                    onChange={(e) => updateField('confirmPassword', e.target.value)}
                    onBlur={markTouched('confirmPassword')}
                    aria-invalid={Boolean(visibleError('confirmPassword')) || undefined}
                    aria-describedby={visibleError('confirmPassword') ? 'confirmPassword-error' : undefined}
                    className={inputClass('confirmPassword', 'w-full pl-9 pr-3.5 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all')}
                    placeholder={t('auth.confirmPlaceholder', 'Repeat password')}
                    autoComplete="new-password"
                  />
                </div>
                <FieldError id="confirmPassword-error" message={visibleError('confirmPassword')} />
              </div>
            </div>

            {/* Terms checkbox */}
            <div className="pt-0.5">
              <label htmlFor="terms" className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-slate-600 dark:text-slate-400">
                <input
                  id="terms"
                  type="checkbox"
                  checked={formData.agreeToTerms}
                  onChange={(e) => updateField('agreeToTerms', e.target.checked)}
                  aria-invalid={Boolean(visibleError('terms')) || undefined}
                  aria-describedby={visibleError('terms') ? 'terms-error' : undefined}
                  className="w-3.5 h-3.5 rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>
                  {t('auth.agreeTerms', 'I agree to the')}{' '}
                  <span className="font-semibold text-blue-600 dark:text-blue-400">
                    {t('auth.termsAndConditions', 'Terms and Conditions')}
                  </span>
                </span>
              </label>
              <FieldError id="terms-error" message={visibleError('terms')} />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-semibold text-xs sm:text-sm shadow-md shadow-blue-500/20 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
              style={{ fontFamily: 'var(--font-latin-display)' }}
            >
              {loading ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t('auth.creatingAccount', 'Creating account...')}</span>
                </>
              ) : (
                <span>{t('auth.createAccount', 'Create Account')}</span>
              )}
            </button>

            {/* Google OAuth Login Button */}
            {googleClientId ? (
              <>
                <div className="relative my-2 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200/80 dark:border-slate-800" />
                  </div>
                  <div className="relative rounded-full border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {t('auth.orDivider', 'OR')}
                  </div>
                </div>

                <GoogleAuthButton
                  mode="signup"
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  disabled={loading}
                />
              </>
            ) : null}

            {/* Error Display */}
            {error ? (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-xs font-medium leading-relaxed flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            ) : null}

            {/* Bottom Link to Sign In */}
            <p className="pt-1 text-center text-xs text-slate-500 dark:text-slate-400">
              {t('auth.alreadyHaveAccount', 'Already have an account?')}{' '}
              <Link
                to="/login"
                state={{ authTransition: 'to-login' }}
                className="font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 hover:underline ml-1"
              >
                {t('auth.signIn', 'Sign In')}
              </Link>
            </p>
          </form>
        </div>

        {/* Footer: Disclaimer / Status */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 gap-1.5 shrink-0">
          <span>© 2026 Diabetes Decision Support System</span>
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{language === 'km' ? 'ប្រព័ន្ធដំណើរការធម្មតា' : 'System Operational'}</span>
          </span>
        </div>
      </div>

      {/* ── RIGHT HALF: High-Impact Showcase of System ── */}
      <AuthShowcasePanel />
    </div>
  )
}
