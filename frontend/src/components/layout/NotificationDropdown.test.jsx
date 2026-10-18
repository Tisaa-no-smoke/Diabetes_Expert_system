import { describe, expect, it } from 'vitest'
import { translate } from '@/lib/i18n'
import { localizeNotification } from './NotificationDropdown'

const tFor = (language) => (key, fallback, values) => translate(language, key, fallback, values)

const review = {
  title: 'Doctor completed your assessment review',
  message: 'Dr. Lina reviewed your recent health summary (Diabetes Mellitus (Confirmed)) and updated your care recommendations.',
  metadata: { kind: 'review_completed', params: { clinician: 'Dr. Lina', diagnosis: 'Diabetes Mellitus (Confirmed)' } },
}

describe('localizeNotification', () => {
  it('shows a known kind in Khmer, including the diagnosis name', () => {
    const { title, message } = localizeNotification(review, tFor('km'), 'km')
    expect(title).toBe('វេជ្ជបណ្ឌិតបានពិនិត្យការវាយតម្លៃរបស់អ្នករួចហើយ')
    expect(message).toContain('Dr. Lina')
    expect(message).not.toContain('Diabetes Mellitus (Confirmed)')
  })

  it('keeps English readable', () => {
    const { title, message } = localizeNotification(review, tFor('en'), 'en')
    expect(title).toBe(review.title)
    expect(message).toBe(review.message)
  })

  it('falls back to the stored text for older notifications', () => {
    const legacy = { title: 'Assessment Report Ready', message: 'Your report is ready.', metadata: {} }
    expect(localizeNotification(legacy, tFor('km'), 'km')).toEqual({ title: legacy.title, message: legacy.message })
  })
})
