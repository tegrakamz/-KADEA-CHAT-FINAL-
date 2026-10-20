import { test } from '@japa/runner'
import { chromium, type Page } from 'playwright'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import app from '@adonisjs/core/services/app'

test('desktop and mobile exchange messages without navigation, delete and create a group', async () => {
  assert.match(env.get('DB_DATABASE') || '', /_test$/)
  await db.from('rate_limits').delete()
  const password = 'Browser-Kadea-2026!'
  const users: User[] = []
  const browser = await chromium.launch()
  try {
    for (const name of ['Alice', 'Bruno', 'Charlie']) {
      const user = await User.create({
        fullName: `${name} Kadea`,
        email: `browser-${randomUUID()}@example.com`,
        password,
      })
      users.push(user)
      await db.from('users').where('id', user.id).update({ email_verified_at: new Date() })
    }
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    })
    const a = await desktop.newPage()
    const b = await mobile.newPage()
    const errors: string[] = []
    for (const page of [a, b]) page.on('pageerror', (error) => errors.push(error.message))
    const login = async (page: Page, email: string) => {
      await page.goto(`${env.get('APP_URL')}/login`)
      await page.locator('[name="email"]').fill(email)
      await page.locator('[name="password"]').fill(password)
      await page.locator('button[type="submit"]').click()
      await page.waitForURL('**/dashboard')
    }
    await login(a, users[0].email)
    await login(b, users[1].email)
    await a.locator('.new-chat-button').click()
    const modal = await a.locator('#private-dialog').boundingBox()
    assert.ok(
      modal && Math.abs(modal.x + modal.width / 2 - 720) < 1,
      'Private dialog should be centered'
    )
    await a.locator('#user-search').fill(users[1].email)
    await a.locator('.user-result').first().click()
    assert.equal(await a.locator('#new-chat-email').inputValue(), users[1].email)
    await a.locator('.dialog-form button[type="submit"]').filter({ hasText: 'Démarrer' }).click()
    await a.waitForURL('**/conversations/*')
    const sidebar = await a.locator('.conversation-sidebar').boundingBox()
    const chat = await a.locator('.chat-panel').boundingBox()
    assert.ok(
      sidebar && chat && sidebar.x < chat.x && sidebar.y === chat.y && chat.height === 900,
      'Desktop must show two full-height columns'
    )
    const path = new URL(a.url()).pathname
    await b.locator(`.conversation-row[href="${path}"]`).waitFor()
    await b.locator(`.conversation-row[href="${path}"]`).click()
    await b.waitForURL(`**${path}`)
    await a.locator('#message-body').waitFor()
    let navigations = 0
    for (const page of [a, b])
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) navigations++
      })
    const first = `Interface A ${randomUUID()}`
    await a.locator('#message-body').fill(first)
    await a.locator('#message-form button[type="submit"]').click()
    await b.locator('.message p').filter({ hasText: first }).waitFor()
    await a.locator('.message--mine .message-actions summary').first().click()
    await a.locator('.message-edit').first().click()
    await a.locator('.message-edit-dialog textarea').fill(`${first} edited`)
    await a.locator('.message-edit-dialog button[type="submit"]').click()
    await b
      .locator('.message p')
      .filter({ hasText: `${first} edited` })
      .waitFor()
    const sent = await db.from('messages').where('body', `${first} edited`).first()
    const patch = async (page: Page, replacement: string) => {
      const csrfToken = await page.locator('input[name="_csrf"]').first().inputValue()
      return page.evaluate(
        async ({ url, body, token }) => {
          const result = await fetch(url, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'X-CSRF-TOKEN': token,
            },
            body: JSON.stringify({ body }),
          })
          return result.status
        },
        { url: `${path}/messages/${sent.id}`, body: replacement, token: csrfToken }
      )
    }
    assert.equal(await patch(b, 'Forbidden edit'), 403)
    await db
      .from('messages')
      .where('id', sent.id)
      .update({ created_at: new Date(Date.now() - 301000) })
    assert.equal(await patch(a, 'Expired edit'), 403)
    await b.locator('.message--received .message-actions summary').first().click()
    await b.locator('.message--received .message-delete').first().click()
    await b.locator('#action-confirmation [data-confirm-yes]').click()
    await b.locator(`#message-${sent.id}`).waitFor({ state: 'detached' })
    assert.equal(await a.locator(`#message-${sent.id}`).isVisible(), true)
    await b.reload()
    navigations = 0
    assert.equal(await b.locator(`#message-${sent.id}`).count(), 0)
    await b.bringToFront()
    const second = `Interface B ${randomUUID()}`
    await b.locator('#message-body').fill(second)
    await b.locator('#message-form button[type="submit"]').click()
    await a.locator('.message p').filter({ hasText: second }).waitFor()
    assert.equal(navigations, 0, 'Sending and receiving must not navigate the page')
    assert.ok(
      await b.evaluate<boolean>('document.documentElement.scrollWidth <= window.innerWidth'),
      'Mobile should not overflow horizontally'
    )
    assert.equal(await b.locator('.conversation-sidebar').isVisible(), false)
    await a.screenshot({ path: app.tmpPath('desktop-chat.png'), fullPage: true })
    await b.screenshot({ path: app.tmpPath('mobile-chat.png'), fullPage: true })
    assert.equal(await a.locator('.chat-header__status').count(), 0)
    await a.locator('[data-theme-toggle]').click()
    assert.equal(await a.locator('html').getAttribute('data-theme'), 'dark')
    await a.reload()
    assert.equal(await a.locator('html').getAttribute('data-theme'), 'dark')
    await a.screenshot({ path: app.tmpPath('chat-dark.png'), fullPage: true })
    await a.locator('[data-theme-toggle]').click()
    await a.locator('#message-body').fill('Draft with emoji ')
    await a.getByRole('button', { name: 'Émojis et stickers', exact: true }).click()
    await a.getByRole('button', { name: 'Insérer l’émoji 😀', exact: true }).click()
    assert.ok((await a.locator('#message-body').inputValue()).includes('😀'))
    const preserved = await a.locator('#message-body').inputValue()
    await a.getByRole('button', { name: 'Émojis et stickers', exact: true }).click()
    await a.getByRole('button', { name: 'Envoyer le sticker 🦊', exact: true }).click()
    await b.locator('.message--sticker p').filter({ hasText: '🦊' }).waitFor()
    assert.equal(await a.locator('#message-body').inputValue(), preserved)
    const draft = 'Brouillon conservé pendant la modification du profil'
    await a.locator('#message-body').fill(draft)
    await a.locator('[data-profile-open]').click()
    const panel = a.frameLocator('#profile-drawer iframe')
    await panel.locator('#edit-profile summary').click()
    await panel.locator('#fullName').fill('Alice mise à jour')
    await panel.getByRole('button', { name: 'Enregistrer le profil' }).click()
    await panel.getByRole('heading', { name: 'Alice mise à jour' }).waitFor()
    await a.waitForFunction(
      "document.querySelector('.profile-copy strong').textContent === 'Alice mise à jour'"
    )
    await a.screenshot({ path: app.tmpPath('profile-drawer.png'), fullPage: true })
    await panel
      .locator('.profile-accordion')
      .filter({ hasText: 'Changer le mot de passe' })
      .locator('summary')
      .click()
    await panel.locator('#currentPassword').fill(password)
    await panel.locator('#password').fill(`${password}new`)
    await panel.locator('#passwordConfirmation').fill(`${password}new`)
    await panel.getByRole('button', { name: 'Changer le mot de passe', exact: true }).click()
    await panel.locator('#action-confirmation [data-confirm-yes]').click()
    await panel.getByText('Mot de passe modifié.', { exact: true }).waitFor()
    await panel.locator('#edit-profile summary').focus()
    await a.keyboard.press('Escape')
    await a.locator('#profile-drawer').waitFor({ state: 'hidden' })
    assert.equal(await a.locator('#message-body').inputValue(), draft)
    assert.equal(new URL(a.url()).pathname, path)
    await a.locator('#message-form button[type="submit"]').click()
    await b.locator('.message p').filter({ hasText: draft }).waitFor()
    const draftMessage = a.locator('.message--mine').filter({ hasText: draft })
    await draftMessage.locator('.message-actions summary').click()
    await draftMessage.locator('.message-delete').click()
    await a.locator('#action-confirmation [data-confirm-yes]').click()
    await b.locator('.message p').filter({ hasText: 'Ce message a été supprimé.' }).waitFor()
    await a.goto(`${env.get('APP_URL')}/search`)
    await a.locator('[name="q"]').fill(second)
    await a.locator('button[type="submit"]').click()
    await a.locator('.search-result').click()
    await a.locator('.message p').filter({ hasText: second }).waitFor()
    await a.goto(`${env.get('APP_URL')}/dashboard`)
    await a.locator('.group-action').click()
    await a.locator('#group-name').fill('Groupe depuis interface')
    for (const email of [users[1].email, users[2].email]) {
      await a.locator('#group-search').fill(email)
      await a.locator(`.picker-row input[value="${email}"]`).check()
    }
    assert.equal(await a.locator('#group-count').textContent(), '2 sélectionnés')
    await a.screenshot({ path: app.tmpPath('group-picker.png'), fullPage: true })
    await a.locator('button[type="submit"]').filter({ hasText: 'Créer le groupe' }).click()
    await a.locator('#action-confirmation [data-confirm-yes]').click()
    await a.waitForURL('**/conversations/*')
    await a.locator('.members-menu').click()
    assert.equal(await a.locator('.chat-header .group-avatar > *').count(), 3)
    const groupPath = new URL(a.url()).pathname
    await b.goto(`${env.get('APP_URL')}${groupPath}`)
    await b.locator('#group-addition-notice').waitFor({ state: 'visible' })
    assert.ok((await b.locator('#group-addition-notice').textContent())?.includes('Alice'))
    const addedBox = await b.locator('#group-addition-notice').boundingBox()
    const messagesBox = await b.locator('.chat-messages').boundingBox()
    assert.ok(addedBox && messagesBox && addedBox.y + addedBox.height <= messagesBox.y + 1)
    assert.equal(await a.locator('#members-dialog .group-avatar > *').count(), 3)
    const mosaic = await a.locator('.chat-header .group-avatar').boundingBox()
    assert.ok(mosaic && mosaic.width > 0 && Math.abs(mosaic.width - mosaic.height) < 1)
    await a
      .locator('.member-row')
      .filter({ hasText: 'Bruno' })
      .getByRole('button', { name: 'Retirer' })
      .click()
    await a.locator('#action-confirmation [data-confirm-no]').click()
    assert.equal(
      await a.locator('#members-dialog .member-row').filter({ hasText: 'Bruno' }).count(),
      1
    )
    await a
      .locator('#members-dialog .member-row')
      .filter({ hasText: 'Bruno' })
      .getByRole('button', { name: 'Retirer' })
      .click()
    await a.locator('#action-confirmation [data-confirm-yes]').click()
    await a.locator('#members-dialog').waitFor({ state: 'hidden' })
    await a.locator('.chat-header h1').filter({ hasText: 'Groupe depuis interface' }).waitFor()
    await a.locator('.chat-header .group-avatar > *').nth(1).waitFor()
    assert.equal(await a.locator('.chat-header .group-avatar > *').count(), 2)
    await b.locator('#group-removal-notice').waitFor({ state: 'visible' })
    assert.equal(await b.locator('#group-addition-notice').isVisible(), false)
    const noticeBox = await b.locator('#group-removal-notice').boundingBox()
    const historyBox = await b.locator('.chat-messages').boundingBox()
    assert.ok(noticeBox && historyBox && noticeBox.y >= historyBox.y + historyBox.height - 1)
    assert.ok((await b.locator('#group-removal-notice').textContent())?.includes('Alice'))
    assert.equal(await b.locator('#message-body').isDisabled(), true)
    assert.equal(new URL(b.url()).pathname, groupPath)
    await b.locator('.members-menu').click()
    assert.equal(await b.locator('#members-dialog .member-row').count(), 2)
    await b.keyboard.press('Escape')
    await a.locator('.members-menu').click()
    await a.locator('#member-email').fill(users[1].email)
    await a.locator('#members-dialog').getByRole('button', { name: 'Ajouter', exact: true }).click()
    await a.locator('#action-confirmation [data-confirm-no]').click()
    assert.equal(
      await a.locator('#members-dialog .member-row').filter({ hasText: 'Bruno' }).count(),
      0
    )
    await a.locator('#members-dialog').getByRole('button', { name: 'Ajouter', exact: true }).click()
    await a.locator('#action-confirmation [data-confirm-yes]').click()
    await a.locator('#members-dialog').waitFor({ state: 'hidden' })
    await a.locator('.chat-header .group-avatar > *').nth(2).waitFor()
    await b.locator('#group-removal-notice').waitFor({ state: 'hidden' })
    await b.locator('#group-addition-notice').waitFor({ state: 'visible' })
    assert.equal(await b.locator('#message-body').isDisabled(), false)
    await a.locator('.members-menu').click()
    const charlieRow = a.locator('#members-dialog .member-row').filter({ hasText: 'Charlie' })
    await charlieRow.getByRole('button', { name: 'Nommer administrateur', exact: true }).click()
    await a.locator('#action-confirmation [data-confirm-no]').click()
    assert.equal(
      (
        await db
          .from('conversation_members')
          .where('conversation_id', Number(groupPath.split('/').at(-1)))
          .where('user_id', users[2].id)
          .first()
      ).is_admin,
      false
    )
    await charlieRow.getByRole('button', { name: 'Nommer administrateur', exact: true }).click()
    await a.locator('#action-confirmation [data-confirm-yes]').click()
    await a.locator('#members-dialog').waitFor({ state: 'hidden' })
    await a
      .locator('.group-system-event')
      .filter({ hasText: 'Vous avez nommé Charlie Kadea administrateur' })
      .waitFor()
    await b
      .locator('.group-system-event')
      .filter({ hasText: 'Alice mise à jour a nommé Charlie Kadea administrateur' })
      .waitFor()
    await a.locator('.members-menu').click()
    await a.locator('.member-profile-link').filter({ hasText: 'Charlie' }).click()
    await a.getByRole('heading', { name: 'Charlie Kadea' }).waitFor()
    assert.equal(await a.locator('input[name="fullName"], input[name="avatar"]').count(), 0)
    await a.getByRole('button', { name: 'Envoyer un message', exact: true }).click()
    await a.waitForURL('**/conversations/*')
    await a.locator('.chat-header h1').filter({ hasText: 'Charlie Kadea' }).waitFor()
    assert.equal(await a.locator('.chat-header__status').count(), 0)
    await a.locator('.members-menu').click()
    await a.getByRole('button', { name: 'Bloquer', exact: true }).click()
    await a.keyboard.press('Escape')
    assert.equal(
      await db
        .from('user_blocks')
        .where('user_id', users[0].id)
        .where('blocked_user_id', users[2].id)
        .first(),
      null
    )
    await a.getByRole('button', { name: 'Bloquer', exact: true }).click()
    await a.locator('#action-confirmation [data-confirm-yes]').click()
    await a.waitForURL('**/profile')
    assert.ok(
      await db
        .from('user_blocks')
        .where('user_id', users[0].id)
        .where('blocked_user_id', users[2].id)
        .first()
    )
    await a.goto(`${env.get('APP_URL')}/dashboard`)
    const beforeLogout = a.url()
    await a.getByRole('button', { name: 'Se déconnecter', exact: true }).click()
    await a.locator('#logout-dialog').waitFor({ state: 'visible' })
    await a.getByRole('button', { name: 'Non', exact: true }).click()
    assert.equal(a.url(), beforeLogout)
    await a.getByRole('button', { name: 'Se déconnecter', exact: true }).click()
    await a.getByRole('button', { name: 'Oui', exact: true }).click()
    await a.waitForURL('**/login')
    assert.deepEqual(errors, [], 'No client-side JavaScript errors')
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
