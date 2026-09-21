import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, ChevronRight, LogOut, Menu, Moon, PanelLeft, Settings, Sun, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { HeaderClock } from './HeaderClock'
import { NotificationDropdown } from './NotificationDropdown'
import { UserAvatar } from '@/components/ui'
import { useLanguage } from '@/contexts/LanguageContext'
import { useNotifications } from '@/contexts/NotificationContext'

export function Topbar({
  page,
  user,
  breadcrumbs = [],
  theme = 'light',
  isSidebarCollapsed = false,
  onToggleDesktopSidebar,
  onToggleTheme,
  onLogout,
  onOpenMobileNav,
}) {
  const { language, setLanguage, t } = useLanguage()
  const { unreadCount } = useNotifications()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    if (menuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [menuOpen])

  const activeRole = user?.roles?.[0] || user?.role || 'user'
  const isDark = theme === 'dark'
  const initials = (user?.name || 'U')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <header
      className={cn(
        'sticky top-0 z-20 px-3 py-3 backdrop-blur sm:px-6',
        isDark
          ? 'border-b border-[#1e2234] bg-[rgba(7,7,18,0.88)] shadow-[0_10px_24px_rgba(0,0,0,0.24)]'
          : 'border-b border-slate-200/80 bg-white/85'
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-2 sm:items-center sm:gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
          <button
            type="button"
            onClick={onToggleDesktopSidebar}
            className="dark-hover-border hidden rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-slate-300 hover:bg-primary-50 hover:text-primary-700 dark:border-[#1e2234] dark:bg-[#101020] dark:text-slate-400 dark:hover:bg-[#181830] dark:hover:text-primary-300 lg:inline-flex"
            aria-label={isSidebarCollapsed ? t('topbar.expandSidebar') : t('topbar.collapseSidebar')}
          >
            <PanelLeft className={cn('h-4 w-4 transition-transform duration-200', isSidebarCollapsed ? 'rotate-180' : 'rotate-0')} />
          </button>

          <button
            type="button"
            onClick={onOpenMobileNav}
            className="dark-hover-border inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:border-slate-300 hover:bg-primary-50 hover:text-primary-700 dark:border-[#1e2234] dark:bg-[#101020] dark:text-slate-400 dark:hover:bg-[#181830] dark:hover:text-primary-300 lg:hidden"
            aria-label={t('topbar.openMenu')}
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <nav aria-label={t('topbar.breadcrumb')} className="mb-0.5 hidden flex-wrap items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 lg:flex">
              {breadcrumbs.map((crumb, index) => (
                <div key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                  {index > 0 ? <ChevronRight className="h-3 w-3 text-slate-400" /> : null}
                  {crumb.to ? (
                    <Link to={crumb.to} className="max-w-[9rem] truncate rounded px-1 py-0.5 hover:bg-slate-100 hover:text-primary-700 dark:hover:bg-[#181830] dark:hover:text-primary-300">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="max-w-[10rem] truncate px-1 py-0.5 font-semibold text-slate-800 dark:text-slate-100">{crumb.label}</span>
                  )}
                </div>
              ))}
            </nav>
            <h2 className="hidden truncate text-xl font-semibold text-slate-900 dark:text-slate-50 lg:block">{page.title}</h2>
            <p className="hidden truncate text-sm text-slate-500 dark:text-slate-400 lg:block">{page.subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2 xl:gap-3">
          <HeaderClock theme={theme} language={language} />

          <div className="hidden h-7 w-px bg-slate-200 dark:bg-[#1e2234] sm:block" />

          <div
            role="group"
            aria-label={t('topbar.languageSwitcher')}
            className="hidden h-11 w-40 shrink-0 rounded-full border border-slate-200 bg-slate-100/80 p-1 shadow-[inset_0_1px_3px_rgba(15,23,42,0.06)] dark:border-[#292940] dark:bg-[#0b0b18] sm:block"
          >
            <div className="relative grid h-full grid-cols-2">
              <span
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-full border border-primary-200/70 bg-white shadow-[0_2px_6px_rgba(15,23,42,0.12)] transition-transform duration-300 ease-out motion-reduce:transition-none dark:border-primary-400/35 dark:bg-[#25253b]',
                  language === 'km' && 'translate-x-full'
                )}
              />
            {[
              { code: 'en', flag: '🇺🇸', shortLabel: 'EN', label: t('common.english', 'English') },
              { code: 'km', flag: '🇰🇭', shortLabel: 'KM', label: t('common.khmer', 'Khmer') },
            ].map((option) => {
              const isActive = language === option.code

              return (
                <button
                  key={option.code}
                  type="button"
                  onClick={() => setLanguage(option.code)}
                  className={cn(
                    'group relative inline-flex h-full w-full items-center justify-center gap-1.5 rounded-full px-2 transition-colors duration-200 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 motion-reduce:transition-none dark:focus-visible:ring-offset-[#0b0b18]',
                    isActive
                      ? 'text-primary-800 dark:text-primary-200'
                      : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                  )}
                  aria-label={option.label}
                  aria-pressed={isActive}
                  title={option.label}
                >
                  <span aria-hidden="true" className="inline-flex h-6 w-7 items-center justify-center text-[22px] leading-none transition-transform duration-200 group-hover:scale-110 motion-reduce:transform-none motion-reduce:transition-none">{option.flag}</span>
                  <span aria-hidden="true" className="text-[11px] font-bold leading-none">{option.shortLabel}</span>
                </button>
              )
            })}
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="dark-hover-border inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-primary-50 hover:text-primary-700 dark:border-[#1e2234] dark:bg-[#101020] dark:text-slate-400 dark:hover:bg-[#181830] dark:hover:text-primary-300"
            aria-label={isDark ? t('topbar.switchToLightTheme') : t('topbar.switchToDarkTheme')}
            title={isDark ? t('topbar.switchToLightTheme') : t('topbar.switchToDarkTheme')}
          >
            {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4 text-amber-500" />}
          </button>

          <NotificationDropdown />

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              className="dark-hover-border flex min-h-11 items-center gap-1 rounded-full border border-slate-200 bg-white px-1.5 py-1.5 text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-primary-50 dark:border-[#1e2234] dark:bg-[#101020] dark:text-slate-200 dark:hover:bg-[#181830] sm:gap-2 sm:px-2"
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              <UserAvatar
                name={user?.name}
                src={user?.avatar_url}
                size="sm"
              />
              <span className="hidden max-w-32 truncate text-sm font-semibold md:inline">{user?.name || t('common.user')}</span>
              <ChevronDown className="h-4 w-4" />
            </button>

            {menuOpen ? (
              <div className="dark-hover-border absolute right-0 z-30 mt-2 w-[min(16rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg dark:border-[#1e2234] dark:bg-[#0d0d1c]">
                <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#1e2234] dark:bg-[#101020]">
                  <UserAvatar
                    name={user?.name}
                    src={user?.avatar_url}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.name || t('common.unknownUser')}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email || t('common.noEmail')}</p>
                    <p className="mt-1 inline-flex rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-700 dark:bg-primary-500/10 dark:text-primary-300">
                      {t(`roles.${activeRole}`)}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-[#181830]"
                  onClick={() => {
                    setMenuOpen(false)
                    navigate('/profile')
                  }}
                >
                  <UserRound className="h-4 w-4" />
                  {t('topbar.profile', 'Profile')}
                </button>
                <div className="flex w-full items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 text-left text-sm font-medium text-slate-700 dark:border-[#1e2234] dark:text-slate-200">
                  <span className="inline-flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    {t('topbar.notifications')}
                  </span>
                  {unreadCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-100 px-1.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                      {unreadCount}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">0</span>
                  )}
                </div>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-rose-700 transition-colors hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/30"
                  onClick={() => {
                    setMenuOpen(false)
                    onLogout()
                  }}
                >
                  <LogOut className="h-4 w-4" />
                  {t('topbar.logOut')}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
