import { test } from '@japa/runner'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import app from '@adonisjs/core/services/app'

test('auth renders the logo, toggles passwords and preserves values after validation', async () => {
  assert.match(env.get('DB_DATABASE') || '', /_test$/)
  await db.from('rate_limits').delete()
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(`${env.get('APP_URL')}/login`)
    assert.equal(await page.locator('.auth-card__brand .brand').count(), 1)
    assert.ok(!(await page.locator('body').textContent())?.includes('@!logo'))
    await page.locator('[name="password"]').fill('mot-de-passe')
    assert.equal(await page.locator('[data-password-hidden]').isVisible(), true)
    await page.getByRole('button', { name: 'Afficher ou masquer le mot de passe' }).click()
    await page.locator('[data-password-visible]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[name="password"]').getAttribute('type'), 'text')
    assert.equal(await page.locator('[data-password-visible]').isVisible(), true)
    assert.equal(await page.locator('[data-password-hidden]').isVisible(), false)
    await page.getByRole('button', { name: 'Afficher ou masquer le mot de passe' }).click()
    await page.locator('[data-password-hidden]').waitFor({ state: 'visible' })
    assert.equal(await page.locator('[name="password"]').getAttribute('type'), 'password')
    assert.equal(await page.locator('[data-password-hidden]').isVisible(), true)
    await page.screenshot({ path: app.tmpPath('login-redesign.png'), fullPage: true })
    const email = `invalid-${randomUUID()}@example.com`
    await page.locator('[name="email"]').fill(email)
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await page
      .locator('.field__error')
      .filter({ hasText: 'Adresse e-mail ou mot de passe incorrect.' })
      .waitFor()
    assert.equal(await page.locator('[name="email"]').inputValue(), email)
    await page.goto(`${env.get('APP_URL')}/signup`)
    await page.locator('[name="fullName"]').fill('Nom conservé')
    await page.locator('[name="email"]').fill(email)
    await page.locator('[name="password"]').fill('Correct-password-2026!')
    await page.locator('[name="passwordConfirmation"]').fill('Different-password-2026!')
    await page.getByRole('button', { name: 'Créer mon compte', exact: true }).click()
    await page.locator('.field__error').waitFor()
    assert.equal(await page.locator('[name="fullName"]').inputValue(), 'Nom conservé')
    assert.equal(await page.locator('[name="email"]').inputValue(), email)
    await page.setViewportSize({ width: 390, height: 844 })
    assert.ok(
      await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')
    )
    await page.screenshot({ path: app.tmpPath('signup-mobile-redesign.png'), fullPage: true })
    assert.deepEqual(errors, [])
  } finally {
    await browser.close()
  }
})

test('incoming messages preserve scroll position and mobile panels fit the viewport', async () => {
  assert.match(env.get('DB_DATABASE') || '', /_test$/)
  await db.from('rate_limits').delete()
  const browser = await chromium.launch()
  const users: User[] = []
  try {
    for (const name of ['Lecteur', 'Auteur']) {
      const user = await User.create({
        fullName: name,
        email: `scroll-${randomUUID()}@example.com`,
        password: 'Scroll-password-2026!',
      })
      users.push(user)
      await db.from('users').where('id', user.id).update({ email_verified_at: new Date() })
    }
    const now = new Date()
    const [conversation] = await db
      .table('conversations')
      .insert({ type: 'private', created_by: users[0].id, created_at: now, updated_at: now })
      .returning('id')
    await db.table('conversation_members').insert(
      users.map((user) => ({
        user_id: user.id,
        conversation_id: conversation.id,
        is_admin: user.id === users[0].id,
        created_at: now,
      }))
    )
    await db.table('messages').insert(
      Array.from({ length: 50 }, (_, index) => ({
        conversation_id: conversation.id,
        user_id: users[1].id,
        body: `Historique ${index}\n${'Un long message pour vérifier la lecture et les retours à la ligne. '.repeat(8)}`,
        created_at: new Date(now.getTime() - (50 - index) * 1000),
      }))
    )
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(`${env.get('APP_URL')}/login`)
    await page.locator('[name="email"]').fill(users[0].email)
    await page.locator('[name="password"]').fill('Scroll-password-2026!')
    await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
    await page.waitForURL('**/dashboard')
    await page.goto(`${env.get('APP_URL')}/conversations/${conversation.id}`)
    await page.locator('.date-divider').waitFor()
    await page.evaluate('document.querySelector(".chat-messages").scrollTop = 40')
    await db.table('messages').insert({
      conversation_id: conversation.id,
      user_id: users[1].id,
      body: 'Nouveau message sans déplacement de la lecture',
      created_at: new Date(),
    })
    await page
      .locator('.message p')
      .filter({ hasText: 'Nouveau message sans déplacement de la lecture' })
      .waitFor({ state: 'attached' })
    assert.ok(
      await page.evaluate<boolean>(
        'Math.abs(document.querySelector(".chat-messages").scrollTop - 40) < 2'
      )
    )
    assert.equal(await page.evaluate<number>('window.scrollY'), 0)
    const composer = await page.locator('.chat-compose').boundingBox()
    assert.ok(composer && composer.y + composer.height <= 900)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('.chat-back').click()
    await page.waitForURL('**/dashboard')
    await page.locator('[data-profile-open]').click()
    const panel = page.frameLocator('#profile-drawer iframe')
    await panel.locator('#fullName').waitFor({ state: 'attached' })
    assert.equal(await panel.locator('#fullName').isVisible(), false)
    const drawer = await page.locator('#profile-drawer').boundingBox()
    assert.ok(drawer && drawer.width <= 390 && drawer.x >= 0)
    await page.screenshot({ path: app.tmpPath('profile-drawer-mobile.png'), fullPage: true })
    await page.getByRole('button', { name: 'Fermer mon profil' }).click()
    await page.locator('.group-action').click()
    const group = await page.locator('#group-dialog').boundingBox()
    assert.ok(group && group.width <= 390 && group.x >= 0 && group.y >= 0)
    await page.keyboard.press('Escape')
    await page.locator('#group-dialog').waitFor({ state: 'hidden' })
  } finally {
    await browser.close()
    await db
      .from('users')
      .whereIn(
        'id',
        users.map((user) => user.id)
      )
      .delete()
  }
})
