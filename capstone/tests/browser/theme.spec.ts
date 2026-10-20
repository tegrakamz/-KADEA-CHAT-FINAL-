import { test } from '@japa/runner'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import app from '@adonisjs/core/services/app'

test('dark theme covers public pages, empty dashboard, search, profile and dialogs', async () => {
  assert.match(env.get('DB_DATABASE') || '', /_test$/)
  await db.from('rate_limits').delete()
  const browser = await chromium.launch()
  let user: User | undefined
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await context.addInitScript("localStorage.setItem('kadea-theme', 'dark')")
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    for (const [path, surface] of [
      ['/', '.landing-chat-card'],
      ['/login', '.auth-card'],
      ['/signup', '.auth-card'],
      ['/verify-email', '.auth-card'],
      ['/forgot-password', '.auth-card'],
      ['/reset-password/not-a-real-token', '.auth-card'],
    ]) {
      await page.goto(`${env.get('APP_URL')}${path}`)
      await page.locator(surface).waitFor()
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
      assert.equal(
        await page.evaluate<string>(
          `getComputedStyle(document.querySelector(${JSON.stringify(surface)})).backgroundColor`
        ),
        'rgb(34, 37, 43)'
      )
      assert.equal(await page.locator('[data-theme-toggle]').isVisible(), true)
    }
    const checkLandingLinks = async () => {
      await page.goto(`${env.get('APP_URL')}/`)
      await page.locator('.landing-secondary').click()
      await page.waitForURL('**/login')
      await page.locator('[name="password"]').waitFor()
      await page.goto(`${env.get('APP_URL')}/`)
      await page.locator('.landing-actions .gold-button').click()
      await page.waitForURL('**/signup')
      await page.locator('[name="fullName"]').waitFor()
    }
    await checkLandingLinks()
    user = await User.create({
      fullName: 'Theme test',
      email: `theme-${randomUUID()}@example.com`,
      password: 'Theme-Kadea-2026!',
    })
    await db.from('users').where('id', user.id).update({ email_verified_at: new Date() })
    await page.goto(`${env.get('APP_URL')}/login`)
    await page.locator('[name="email"]').fill(user.email)
    await page.locator('[name="password"]').fill('Theme-Kadea-2026!')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await page.waitForURL('**/dashboard')
    await checkLandingLinks()
    await page.goto(`${env.get('APP_URL')}/dashboard`)
    await page.goto(`${env.get('APP_URL')}/login`)
    await page.getByRole('button', { name: 'Se déconnecter pour changer de compte' }).click()
    await page.locator('#action-confirmation [data-confirm-no]').click()
    await page.goto(`${env.get('APP_URL')}/dashboard`)
    assert.equal(new URL(page.url()).pathname, '/dashboard')
    assert.equal(
      await page.evaluate<string>(
        "getComputedStyle(document.querySelector('.chat-empty-pane')).backgroundColor"
      ),
      'rgb(34, 37, 43)'
    )
    await page.screenshot({ path: app.tmpPath('dashboard-dark.png'), fullPage: true })
    assert.equal(
      await page.evaluate<string>(
        "getComputedStyle(document.querySelector('.empty-illustration__back'), '::after').backgroundColor"
      ),
      'rgb(41, 45, 52)'
    )
    assert.equal(
      await page.evaluate<string>(
        "getComputedStyle(document.querySelector('.empty-pane-hint')).backgroundColor"
      ),
      'rgb(41, 45, 52)'
    )
    await page.locator('.new-chat-button').click()
    assert.equal(
      await page.evaluate<string>(
        "getComputedStyle(document.querySelector('#private-dialog .dialog-card')).backgroundColor"
      ),
      'rgb(34, 37, 43)'
    )
    await page.keyboard.press('Escape')
    for (const [path, surface] of [
      ['/profile', '.profile-accordion'],
      ['/search', '.search-empty'],
    ]) {
      await page.goto(`${env.get('APP_URL')}${path}`)
      await page.locator(surface).first().waitFor()
      const color = await page.evaluate<string>(
        `getComputedStyle(document.querySelector(${JSON.stringify(surface)})).backgroundColor`
      )
      assert.ok(['rgb(34, 37, 43)', 'rgb(41, 45, 52)'].includes(color))
      assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark')
    }
    await page.getByRole('button', { name: 'Activer le mode clair', exact: true }).click()
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'light')
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
    if (user) await user.delete()
  }
})
