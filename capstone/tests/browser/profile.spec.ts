import { test } from '@japa/runner'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import app from '@adonisjs/core/services/app'

test('profile is centered on desktop and mobile, disclosures toggle and existing actions work', async () => {
  assert.match(env.get('DB_DATABASE') || '', /_test$/)
  const users: User[] = []
  const browser = await chromium.launch()
  let photo: string | undefined
  try {
    for (const fullName of ['Profil Kadea', 'Contact bloqué']) {
      const user = await User.create({
        fullName,
        email: `profile-${randomUUID()}@example.com`,
        password: 'Profile-Kadea-2026!',
      })
      users.push(user)
      await db.from('users').where('id', user.id).update({ email_verified_at: new Date() })
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.goto(`${env.get('APP_URL')}/login`)
    await page.locator('[name="email"]').fill(users[0].email)
    await page.locator('[name="password"]').fill('Profile-Kadea-2026!')
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.waitForURL('**/dashboard')
    await page.goto(`${env.get('APP_URL')}/profile`)
    const password = page
      .locator('.profile-accordion')
      .filter({ hasText: 'Changer le mot de passe' })
    const blocked = page.locator('.profile-accordion').filter({ hasText: 'Contacts bloqués' })
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport)
      const header = await page.locator('.profile-identity').boundingBox()
      for (const selector of ['.profile-photo', '.profile-identity h1']) {
        const box = await page.locator(selector).boundingBox()
        assert.ok(header && box)
        assert.ok(Math.abs(box.x + box.width / 2 - (header.x + header.width / 2)) < 1)
      }
      assert.equal(await password.getAttribute('open'), null)
      assert.equal(await blocked.getAttribute('open'), null)
      assert.equal(await page.locator('#currentPassword').isVisible(), false)
      await password.locator('summary').click()
      assert.equal(await page.locator('#currentPassword').isVisible(), true)
      await password.locator('summary').click()
      assert.equal(await page.locator('#currentPassword').isVisible(), false)
      await blocked.locator('summary').focus()
      await page.keyboard.press('Enter')
      assert.equal(await page.getByText('Aucun contact bloqué', { exact: true }).isVisible(), true)
      await page.keyboard.press('Enter')
      assert.equal(await page.getByText('Aucun contact bloqué', { exact: true }).isVisible(), false)
      assert.ok(
        await page.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth')
      )
    }
    assert.equal(await page.locator('#fullName').isVisible(), false)
    await page.locator('#edit-profile summary').click()
    await page.locator('#fullName').fill('Profil mis à jour')
    await page.locator('#avatar').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII=',
        'base64'
      ),
    })
    await page.getByRole('button', { name: 'Enregistrer le profil' }).click()
    await page.getByRole('heading', { name: 'Profil mis à jour' }).waitFor()
    await page.locator('img.profile-photo').waitFor()
    const row = await db.from('users').where('id', users[0].id).first()
    photo = row.avatar
    const chooserEvent = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Changer ma photo de profil' }).click()
    const chooser = await chooserEvent
    await chooser.setFiles({
      name: 'quick-photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII=',
        'base64'
      ),
    })
    await page.getByText('Photo de profil mise à jour.', { exact: true }).waitFor()
    const updated = await db.from('users').where('id', users[0].id).first()
    assert.notEqual(updated.avatar, photo)
    assert.equal(updated.full_name, row.full_name)
    if (photo) await unlink(join(env.get('UPLOADS_PATH') || app.makePath('storage/uploads'), photo))
    photo = updated.avatar
    await db.table('user_blocks').insert({ user_id: users[0].id, blocked_user_id: users[1].id })
    await page.reload()
    await blocked.locator('summary').click()
    await page.getByRole('button', { name: 'Débloquer' }).click()
    await page.locator('#action-confirmation [data-confirm-no]').click()
    assert.ok(
      await db
        .from('user_blocks')
        .where('user_id', users[0].id)
        .where('blocked_user_id', users[1].id)
        .first()
    )
    await page.getByRole('button', { name: 'Débloquer' }).click()
    await page.locator('#action-confirmation [data-confirm-yes]').click()
    await page.waitForURL('**/profile')
    await blocked.locator('summary').click()
    assert.equal(await page.getByText('Aucun contact bloqué', { exact: true }).isVisible(), true)
    await page.screenshot({ path: app.tmpPath('profile-mobile.png'), fullPage: true })
  } finally {
    await browser.close()
    await db
      .from('users')
      .whereIn(
        'id',
        users.map((user) => user.id)
      )
      .delete()
    if (photo) await unlink(join(env.get('UPLOADS_PATH') || app.makePath('storage/uploads'), photo))
  }
})
