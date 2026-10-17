import { deflateSync } from 'node:zlib'
import { test, expect } from '@playwright/test'

const routes = {
  admin: ['/dashboard', '/users', '/roles-permissions', '/audit-logs', '/patients', '/patients/1', '/review', '/rules', '/profile', '/diagnosis'],
  doctor: ['/dashboard', '/patients', '/patients/1', '/review', '/rules', '/profile', '/diagnosis'],
  patient: ['/dashboard', '/my-results', '/diagnosis/result?diagnosis_result_id=1', '/care-plan', '/guide', '/profile', '/diagnosis'],
  observer: ['/dashboard', '/patients', '/patients/1', '/guide', '/profile'],
}

async function login(page, role) {
  await page.goto('/login')
  await page.locator('#email').fill(`${role}@example.com`)
  await page.locator('#password').fill(`${role}123`)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard$/)
}

for (const role of Object.keys(routes)) {
  for (const mode of ['desktop-en-light', 'mobile-km-dark']) {
    test(`${role}: ${mode} routes render without console or API errors`, async ({ page }) => {
      const errors = []
      const failures = []
      page.on('pageerror', (error) => errors.push(error.message))
      page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
      page.on('response', (response) => {
        if (response.url().includes('/api/') && response.status() >= 400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`)
      })
      await page.setViewportSize(mode.startsWith('mobile') ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
      await page.addInitScript((mode) => {
        localStorage.setItem('app-language', mode.includes('-km-') ? 'km' : 'en')
        localStorage.setItem('theme', mode.endsWith('-dark') ? 'dark' : 'light')
      }, mode)
      await login(page, role)
      for (const route of routes[role]) {
        await page.goto(route)
        await expect(page.locator('main')).toBeVisible()
        await expect(page.locator('html')).toHaveAttribute('lang', mode.includes('-km-') ? 'km' : 'en')
        await expect(page.locator('html')).toHaveClass(mode.endsWith('-dark') ? /dark/ : /^(?!.*dark)/)
        await expect(page.locator('main')).not.toContainText('Something went wrong')
        await page.waitForLoadState('networkidle')
        expect(await page.locator('main').innerText()).not.toBe('')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      }
      expect(failures).toEqual([])
      expect(errors).toEqual([])
    })
  }
}

test('patient cannot enter administration or knowledge-base routes', async ({ page }) => {
  await login(page, 'patient')
  for (const route of ['/users', '/roles-permissions', '/audit-logs', '/rules', '/review']) {
    await page.goto(route)
    await expect(page).toHaveURL(/\/unauthorized$/)
  }
})

test('clinician cannot enter patient-only care plan', async ({ page }) => {
  await login(page, 'doctor')
  await page.goto('/care-plan')
  await expect(page).toHaveURL(/\/unauthorized$/)
})

test('patient can open and refresh the saved care plan and appointment views', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
  await login(page, 'patient')
  await page.goto('/care-plan')
  await page.getByRole('button', { name: 'Care Plan', exact: true }).click()
  const refreshed = page.waitForResponse((response) =>
    response.url().includes('/diagnosis/1/care-plan') && response.request().method() === 'POST'
  )
  await page.getByRole('button', { name: 'Refresh Plan', exact: true }).click()
  expect((await refreshed).status()).toBe(200)
  await page.getByRole('button', { name: 'Appointments', exact: true }).click()
  await expect(page.locator('main')).not.toContainText('Something went wrong')
})

test('registration, health-profile setup, and logout complete on mobile', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/sign-up')
  await page.locator('#name').fill('Browser Registration')
  await page.locator('#email').fill('browser-registration@example.com')
  await page.locator('#password').fill('registration-test-password')
  await page.locator('#confirmPassword').fill('registration-test-password')
  await page.locator('#terms').check()
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/profile-setup$/)
  await page.getByRole('button', { name: 'Male', exact: true }).click()
  await page.locator('input[type="date"]').fill('1990-01-01')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByPlaceholder('170', { exact: true }).fill('170')
  await page.getByPlaceholder('65', { exact: true }).fill('65')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.getByRole('button', { name: 'User menu', exact: true }).last().click()
  await page.getByText('Log out', { exact: true }).last().click()
  await expect(page).toHaveURL(/\/login$/)
})

test('admin creates a custom role and user, then grants and revokes individual access', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
  await login(page, 'admin')
  await page.goto('/roles-permissions')
  await page.getByRole('button', { name: 'New Role', exact: true }).click()
  const form = page.locator('#role-permissions-form')
  await form.locator('input').nth(0).fill('browser_reader')
  await form.locator('input').nth(1).fill('Browser regression role')
  await page.getByRole('checkbox', { name: 'View diabetes education guide', exact: true }).check()
  const roleCreated = page.waitForResponse((r) => r.url().endsWith('/admin/roles') && r.request().method() === 'POST')
  await page.locator('button[form="role-permissions-form"]').click()
  expect((await roleCreated).status()).toBe(201)
  await page.goto('/users')
  await page.getByRole('button', { name: 'Add User', exact: true }).click()
  await page.getByPlaceholder('e.g. Sokha Chan or Dr. Sarah Connor').fill('Browser Managed User')
  await page.getByPlaceholder('user@example.com', { exact: true }).fill('browser-managed@example.com')
  await page.getByPlaceholder('At least 6 chars').fill('managed-test-password')
  await page.getByLabel('Assigned Role', { exact: false }).selectOption('browser_reader')
  const userCreated = page.waitForResponse((r) => r.url().endsWith('/admin/users') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Create User', exact: true }).click()
  const response = await userCreated
  expect(response.status()).toBe(201)
  const created = (await response.json()).data
  const loginResponse = await page.request.post('http://127.0.0.1:5002/api/auth/login', { data: { email: 'browser-managed@example.com', password: 'managed-test-password' } })
  const auth = (await loginResponse.json()).data
  const headers = { Authorization: `Bearer ${auth.access_token}` }
  await page.goto(`/users/${created.id}/edit`)
  await page.getByRole('checkbox', { name: 'View rules', exact: true }).check()
  let saved = page.waitForResponse((r) => r.url().endsWith('/access-profile') && r.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).first().click()
  let updated = (await (await saved).json()).data
  expect(updated.direct_permissions).toEqual(['rule.view'])
  expect(updated.role_permissions).toEqual(['guide.view'])
  expect((await page.request.get('http://127.0.0.1:5002/api/rules', { headers })).status()).toBe(200)
  await page.goto(`/users/${created.id}/edit`)
  await page.getByRole('checkbox', { name: 'View rules', exact: true }).uncheck()
  saved = page.waitForResponse((r) => r.url().endsWith('/access-profile') && r.request().method() === 'PATCH')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).first().click()
  updated = (await (await saved).json()).data
  expect(updated.direct_permissions).toEqual([])
  expect(updated.role_permissions).toEqual(['guide.view'])
  expect((await page.request.get('http://127.0.0.1:5002/api/rules', { headers })).status()).toBe(403)
})

test('clinician signs a review with treatment guidance and the patient is notified', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
  await login(page, 'doctor')
  await page.goto('/review?diagnosis_result_id=1')

  const note = 'Continue monitoring glucose and schedule a follow-up appointment in two weeks.'
  await page.getByPlaceholder(/Write your clinical evaluation/).fill(note)
  const saved = page.waitForResponse((response) =>
    response.url().endsWith('/diagnosis/1/review') && response.request().method() === 'PATCH'
  )
  await page.getByRole('button', { name: 'Sign & Submit Review', exact: true }).click()
  const response = await saved
  expect(response.status()).toBe(200)
  expect((await response.json()).data.review_note).toBe(note)

  const patientLogin = await page.request.post('http://127.0.0.1:5002/api/auth/login', {
    data: { email: 'patient@example.com', password: 'patient123' },
  })
  const patientAuth = (await patientLogin.json()).data
  const notifications = await page.request.get('http://127.0.0.1:5002/api/notifications', {
    headers: { Authorization: `Bearer ${patientAuth.access_token}` },
  })
  expect(notifications.status()).toBe(200)
  const rows = (await notifications.json()).data.notifications
  expect(rows).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'review', message: expect.stringContaining('Dr. Lina') }),
  ]))
})

test('a user changes their password and email from the profile page', async ({ page }) => {
  const apiBase = 'http://127.0.0.1:5002/api'
  const registered = await page.request.post(`${apiBase}/auth/register`, {
    data: { name: 'Credential Tester', email: 'credentials@example.com', password: 'original-pass-1' },
  })
  expect(registered.ok()).toBeTruthy()
  const { access_token: token } = (await registered.json()).data
  await page.request.patch(`${apiBase}/patients/mine`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { gender: 'female', date_of_birth: '1992-02-02', profile_complete: true },
  })

  await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
  await page.goto('/login')
  await page.locator('#email').fill('credentials@example.com')
  await page.locator('#password').fill('original-pass-1')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await page.goto('/profile')

  // A wrong current password is a form error; the session survives it.
  await page.locator('#security-current-password').fill('wrong-password-9')
  await page.locator('#security-new-password').fill('changed-pass-22')
  await page.locator('#security-confirm-password').fill('changed-pass-22')
  await page.getByRole('button', { name: 'Update password', exact: true }).click()
  await expect(page.getByText('Current password is incorrect.')).toBeVisible()
  await expect(page).toHaveURL(/\/profile$/)

  await page.locator('#security-current-password').fill('original-pass-1')
  await page.getByRole('button', { name: 'Update password', exact: true }).click()
  await expect(page.getByText('Password updated. Other devices have been signed out.')).toBeVisible()

  await page.locator('#security-new-email').fill('credentials-new@example.com')
  await page.locator('#security-email-current').fill('changed-pass-22')
  await page.getByRole('button', { name: 'Update email', exact: true }).click()
  await expect(page.getByText('Email updated. Use it the next time you sign in.')).toBeVisible()

  // This tab keeps its session across both changes.
  await page.reload()
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.locator('main')).toContainText('credentials-new@example.com')

  await page.getByRole('button', { name: 'User menu', exact: true }).last().click()
  await page.getByText('Log out', { exact: true }).last().click()
  await expect(page).toHaveURL(/\/login$/)
  await page.locator('#email').fill('credentials-new@example.com')
  await page.locator('#password').fill('changed-pass-22')
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/dashboard$/)

  // The old registration token was issued before the changes and is now rejected.
  const stale = await page.request.get(`${apiBase}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  expect(stale.status()).toBe(401)
})

/** A width x height PNG, blue on the left half and orange on the right. */
function makeTwoTonePng(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc32 = (buffer) => {
    let c = 0xffffffff
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  const rows = []
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3)
    for (let x = 0; x < width; x++) row.set(x < width / 2 ? [37, 99, 235] : [249, 115, 22], 1 + x * 3)
    rows.push(row)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

test('a profile photo is positioned and cropped before it is uploaded', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
  await login(page, 'doctor')
  await page.goto('/profile')

  const uploads = []
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/api/auth/avatar')) uploads.push(request)
  })
  const photo = { name: 'wide-photo.png', mimeType: 'image/png', buffer: makeTwoTonePng(640, 400) }
  const fileInput = page.locator('input[type="file"]')
  const dialog = page.getByRole('dialog', { name: 'Adjust your photo' })

  // Cancelling uploads nothing.
  await fileInput.setInputFiles(photo)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).toBeHidden()
  expect(uploads).toHaveLength(0)

  // Choosing the same file again reopens the cropper.
  await fileInput.setInputFiles(photo)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await dialog.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(dialog.getByRole('slider', { name: 'Zoom' })).toHaveValue('1.4')
  await dialog.getByRole('button', { name: 'Rotate right', exact: true }).click()

  const uploaded = page.waitForResponse((response) => response.url().endsWith('/api/auth/avatar') && response.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Save photo', exact: true }).click()
  const response = await uploaded
  expect(response.status()).toBe(200)
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Profile picture updated successfully.')).toBeVisible()

  // The stored photo is the square crop, not the 640x400 original.
  expect(uploads).toHaveLength(1)
  const { avatar_url: avatarUrl } = (await response.json()).data
  const size = await page.evaluate(async (src) => {
    const image = new Image()
    image.src = src
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  }, `http://127.0.0.1:5002${avatarUrl}`)
  expect(size.width).toBe(size.height)
  expect(size.width).toBeLessThanOrEqual(512)
})

test('sign-up explains every problem before it submits', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
  await page.goto('/sign-up')
  await expect(page.locator('#terms')).not.toBeChecked()

  const submit = page.locator('button[type="submit"]')
  await submit.click()
  for (const text of ['Enter your full name.', 'Enter your email address.', 'Use at least 8 characters.', 'Type the same password again.', 'Please agree to the terms and conditions.']) {
    await expect(page.getByText(text, { exact: true })).toBeVisible()
  }
  await expect(page.locator('#name')).toBeFocused()

  await page.locator('#name').fill('Form Check')
  await page.locator('#email').fill('doctor@')
  await page.locator('#password').fill('        ')
  await page.locator('#confirmPassword').fill('different-1')
  await expect(page.getByText('Enter a valid email address, like name@example.com.')).toBeVisible()
  await expect(page.getByText('A password cannot be only spaces.')).toBeVisible()
  await expect(page.getByText('Password and confirm password must match.')).toBeVisible()

  // A taken email is reported by the server under the email field.
  await page.locator('#email').fill('Doctor@Example.com')
  await page.locator('#password').fill('valid-pass-1')
  await page.locator('#confirmPassword').fill('valid-pass-1')
  await page.locator('#terms').check()
  await submit.click()
  await expect(page.locator('#email-error')).toHaveText('An account with this email already exists. Try signing in instead.')
  await expect(page).toHaveURL(/\/sign-up$/)
})

test('sign-in checks the email and explains a failed attempt', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
  await page.goto('/login')
  await page.locator('#email').fill('doctor@')
  await page.locator('#password').fill('doctor123')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('#login-error')).toHaveText('Enter a valid email address, like name@example.com.')

  await page.locator('#email').fill('doctor@example.com')
  await page.locator('#password').fill('wrong-password')
  await page.locator('button[type="submit"]').click()
  await expect(page.locator('#login-error')).toHaveText('Incorrect email or password.')
  await expect(page).toHaveURL(/\/login$/)
})

test('"Remember me" decides whether a new tab is still signed in', async ({ page, context }) => {
  await page.addInitScript(() => localStorage.setItem('app-language', 'en'))
  const signIn = async (remember) => {
    await page.goto('/login')
    await page.locator('#email').fill('patient@example.com')
    await page.locator('#password').fill('patient123')
    await page.locator('#remember-me').setChecked(remember)
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/\/dashboard$/)
  }
  const openInNewTab = async () => {
    const tab = await context.newPage()
    await tab.goto('/dashboard')
    // Let the app settle: a signed-out tab redirects to /login after it loads.
    await tab.waitForURL(/\/(login|dashboard)$/)
    await tab.waitForLoadState('networkidle')
    const url = tab.url()
    await tab.close()
    return url
  }

  // Not remembered: the session belongs to this tab only and ends with the browser session.
  await signIn(false)
  expect(await openInNewTab()).toMatch(/\/login$/)
  await page.reload()
  await expect(page).toHaveURL(/\/dashboard$/)

  // Remembered: other tabs (and later visits) stay signed in.
  await page.evaluate(() => { sessionStorage.clear() })
  await signIn(true)
  expect(await openInNewTab()).toMatch(/\/dashboard$/)
})
