import { test } from '@japa/runner'
import assert from 'node:assert/strict'
import { readdir, readFile, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import User from '#models/user'
import env from '#start/env'
import { tokenHash } from '#services/account_service'
import { Secret } from '@adonisjs/core/helpers'

const password = 'Kadea-Testing-2026!'
const ids: number[] = []
const mailbox: string[] = []

class Client {
  cookies = new Map<string, string>()
  csrf = ''
  async request(path: string, method = 'GET', data?: Record<string, unknown> | FormData) {
    const headers: Record<string, string> = {
      Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
      Accept: 'text/html',
    }
    if (method !== 'GET') headers['X-CSRF-TOKEN'] = this.csrf
    const multipart = data instanceof FormData
    if (data && !multipart) headers['Content-Type'] = 'application/json'
    const response = await fetch(`${env.get('APP_URL')}${path}`, {
      method,
      redirect: 'manual',
      headers,
      body: data ? (multipart ? data : JSON.stringify(data)) : undefined,
    })
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(';')
      const index = pair.indexOf('=')
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1))
    }
    const text = await response.text()
    this.csrf = text.match(/name=['"]_csrf['"][^>]*value=['"]([^'"]+)['"]/)?.[1] || this.csrf
    if (response.status >= 500) {
      const detail = await fetch(`${env.get('APP_URL')}${path}`, {
        headers: { ...headers, Accept: 'application/json' },
        redirect: 'manual',
      }).then((result) => result.text())
      throw new Error(`HTTP ${response.status} ${path}: ${detail.slice(0, 1800)}`)
    }
    return { response, text }
  }
  async login(email: string, secret = password) {
    await this.request('/login')
    const result = await this.request('/login', 'POST', { email, password: secret })
    assert.equal(result.response.status, 302)
    assert.equal(result.response.headers.get('location'), '/dashboard')
    await this.request('/dashboard')
  }
  async events(conversationId: number) {
    const controller = new AbortController()
    const response = await fetch(`${env.get('APP_URL')}/events?conversation=${conversationId}`, {
      headers: { Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ') },
      signal: controller.signal,
    })
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') || '', /text\/event-stream/)
    const reader = response.body!.getReader()
    let buffer = ''
    return {
      close: () => controller.abort(),
      next: async (predicate: (snapshot: Record<string, any>) => boolean) => {
        const timeout = setTimeout(() => controller.abort(), 10000)
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) throw new Error('SSE stream closed before expected event')
            buffer += new TextDecoder().decode(value)
            let end
            while ((end = buffer.indexOf('\n\n')) >= 0) {
              const event = buffer.slice(0, end)
              buffer = buffer.slice(end + 2)
              if (!event.startsWith('event: snapshot\n')) continue
              const snapshot = JSON.parse(event.split('\ndata: ')[1])
              if (predicate(snapshot)) return snapshot
            }
          }
        } finally {
          clearTimeout(timeout)
        }
      },
    }
  }
}

async function account() {
  const email = `test-${randomUUID()}@example.com`
  const user = await User.create({ fullName: 'Test Kadea', email, password })
  ids.push(user.id)
  await db.from('users').where('id', user.id).update({ email_verified_at: new Date() })
  const client = new Client()
  await client.login(email)
  return { user, client }
}

async function mailToken(email: string, purpose: string) {
  const directory = app.tmpPath('mail')
  for (const file of await readdir(directory)) {
    const path = `${directory}/${file}`
    const contents = await readFile(path, 'utf8')
    if (contents.includes(`To: ${email}\n`) && contents.includes(`/${purpose}/`)) {
      mailbox.push(path)
      return contents.match(new RegExp(`/${purpose}/([a-f0-9]{64})`))![1]
    }
  }
  throw new Error('Expected local email was not found')
}

test.group('Kadea Chat complete journeys', (group) => {
  group.setup(() => {
    assert.match(
      env.get('DB_DATABASE') || '',
      /_test$/,
      'Run these tests only against a dedicated _test database'
    )
  })
  group.each.setup(async () => {
    await db.from('rate_limits').delete()
  })

  test('test confirmations preserve two accounts and resend the session account without a recipient field', async () => {
    const originalFetch = globalThis.fetch
    const previous = {
      driver: env.get('MAIL_DRIVER'),
      test: env.get('MAIL_TEST_MODE'),
      recipient: env.get('MAIL_TEST_RECIPIENT'),
      key: env.get('RESEND_API_KEY'),
      from: env.get('MAIL_FROM'),
    }
    const deliveries: { to: string[]; from: string; text: string }[] = []
    let reject = false
    try {
      env.set('MAIL_DRIVER', 'resend')
      env.set('MAIL_TEST_MODE', true)
      env.set('MAIL_TEST_RECIPIENT', 'owner@example.com')
      env.set('MAIL_FROM', 'Kadea Chat <onboarding@resend.dev>')
      env.set('RESEND_API_KEY', new Secret('re_simulated_no_real_sends'))
      globalThis.fetch = async (url, options) => {
        if (String(url) !== 'https://api.resend.com/emails') return originalFetch(url, options)
        if (reject)
          return new Response(JSON.stringify({ error: { name: 'rate_limit_exceeded' } }), {
            status: 429,
          })
        deliveries.push(JSON.parse(String(options?.body)))
        return new Response(JSON.stringify({ id: `mock-${deliveries.length}` }), { status: 200 })
      }
      const accounts = []
      for (const name of ['Gloria', 'Christian']) {
        const client = new Client()
        const email = `${name.toLowerCase()}-${randomUUID()}@example.com`
        await client.request('/signup')
        await client.request('/signup', 'POST', {
          fullName: name,
          email,
          password,
          passwordConfirmation: password,
        })
        const user = await User.findByOrFail('email', email)
        ids.push(user.id)
        const page = await client.request('/verify-email')
        assert.ok(page.text.includes(name) && page.text.includes(email))
        assert.ok(!page.text.includes('name="email"'))
        const initial = deliveries.at(-1)!
        assert.deepEqual(initial.to, ['owner@example.com'])
        assert.equal(initial.from, 'Kadea Chat <onboarding@resend.dev>')
        assert.ok(initial.text.includes(name) && initial.text.includes(email))
        await client.request('/verify-email', 'POST', { email: 'owner@example.com' })
        assert.ok(deliveries.at(-1)!.text.includes(email))
        const token = deliveries.at(-1)!.text.match(/\/verify-email\/([a-f0-9]{64})/)![1]
        assert.equal(
          (await db.from('account_tokens').where('token_hash', tokenHash(token)).first()).user_id,
          user.id
        )
        assert.equal((await db.from('users').where('id', user.id).first()).email_verified_at, null)
        accounts.push({ client, user, token, email })
      }
      const [gloria, christian] = accounts
      await gloria.client.request(`/verify-email/${gloria.token}`)
      assert.ok((await db.from('users').where('id', gloria.user.id).first()).email_verified_at)
      assert.equal(
        (await db.from('users').where('id', christian.user.id).first()).email_verified_at,
        null
      )
      assert.equal(
        (await gloria.client.request(`/verify-email/${gloria.token}`)).response.headers.get(
          'location'
        ),
        '/verify-email'
      )
      reject = true
      await christian.client.request('/verify-email', 'POST')
      const failed = await christian.client.request('/verify-email')
      assert.ok(failed.text.includes('momentanément indisponible'))
      assert.equal(
        (await db.from('users').where('id', christian.user.id).first()).email_verified_at,
        null
      )
      reject = false
      const fresh = new Client()
      await fresh.request('/verify-email')
      await fresh.request('/verify-email', 'POST', { email: christian.email })
      const restored = await fresh.request('/verify-email')
      assert.ok(restored.text.includes('Christian') && !restored.text.includes('name="email"'))
      await christian.client.request(`/verify-email/${christian.token}`)
      for (const entry of accounts) {
        const row = await db.from('users').where('id', entry.user.id).first()
        assert.equal(row.email, entry.email)
        assert.ok(row.email_verified_at)
      }
    } finally {
      globalThis.fetch = originalFetch
      env.set('MAIL_DRIVER', previous.driver)
      env.set('MAIL_TEST_MODE', previous.test)
      env.set('MAIL_TEST_RECIPIENT', previous.recipient)
      env.set('RESEND_API_KEY', previous.key)
      env.set('MAIL_FROM', previous.from)
    }
  })
  group.teardown(async () => {
    await db.from('users').whereIn('id', ids).delete()
    await Promise.all([...new Set(mailbox)].map((path) => unlink(path).catch(() => {})))
  })

  test('registration requires email verification, reset is single-use and invalidates sessions', async () => {
    const email = `signup-${randomUUID()}@example.com`
    const client = new Client()
    await client.request('/signup')
    const signup = await client.request('/signup', 'POST', {
      fullName: 'New Kadea',
      email,
      password,
      passwordConfirmation: password,
    })
    assert.equal(signup.response.headers.get('location'), '/verify-email')
    const user = await User.findByOrFail('email', email)
    ids.push(user.id)
    assert.equal((await client.request('/dashboard')).response.headers.get('location'), '/login')
    const login = await client.request('/login', 'POST', { email, password })
    assert.equal(login.response.headers.get('location'), '/verify-email')
    const token = await mailToken(email, 'verify-email')
    const expiredVerification = randomUUID()
    await db.table('account_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash(expiredVerification),
      purpose: 'verify',
      expires_at: new Date(0),
    })
    assert.equal(
      (await client.request(`/verify-email/${expiredVerification}`)).response.headers.get(
        'location'
      ),
      '/verify-email'
    )
    assert.equal((await db.from('users').where('id', user.id).first()).email_verified_at, null)
    await client.request('/verify-email')
    assert.equal(
      (await client.request('/verify-email', 'POST', { email })).response.headers.get('location'),
      '/verify-email'
    )
    assert.equal(
      (await client.request(`/verify-email/${token}`)).response.headers.get('location'),
      '/login'
    )
    assert.equal(
      (await client.request(`/verify-email/${token}`)).response.headers.get('location'),
      '/verify-email'
    )
    await client.login(email)
    const second = new Client()
    await second.login(email)
    await client.request('/forgot-password')
    await client.request('/forgot-password', 'POST', { email })
    const reset = await mailToken(email, 'reset-password')
    await client.request(`/reset-password/${reset}`)
    const changed = await client.request(`/reset-password/${reset}`, 'POST', {
      password: `${password}new`,
      passwordConfirmation: `${password}new`,
    })
    assert.equal(changed.response.headers.get('location'), '/login')
    await client.request('/login')
    assert.equal((await second.request('/dashboard')).response.headers.get('location'), '/login')
    assert.equal(
      (
        await client.request(`/reset-password/${reset}`, 'POST', {
          password,
          passwordConfirmation: password,
        })
      ).response.headers.get('location'),
      '/forgot-password'
    )
    await client.login(email, `${password}new`)
    const expired = randomUUID()
    await db.table('account_tokens').insert({
      user_id: user.id,
      token_hash: tokenHash(expired),
      purpose: 'reset',
      expires_at: new Date(0),
    })
    assert.equal(
      (
        await client.request(`/reset-password/${expired}`, 'POST', {
          password,
          passwordConfirmation: password,
        })
      ).response.headers.get('location'),
      '/forgot-password'
    )
  })

  test('private conversations preserve messages, protect access, search and enforce blocking', async () => {
    const a = await account()
    const b = await account()
    const outsider = await account()
    const starts = await Promise.all([
      a.client.request('/conversations', 'POST', { email: b.user.email }),
      b.client.request('/conversations', 'POST', { email: a.user.email }),
    ])
    const path = starts[0].response.headers.get('location')!
    assert.equal(starts[1].response.headers.get('location'), path)
    const id = Number(path.split('/').at(-1))
    assert.equal((await a.client.request(`${path}?before=Infinity`)).response.status, 400)
    assert.equal((await a.client.request('/conversations/not-a-number')).response.status, 404)
    assert.equal((await a.client.request('/events?conversation=999999999999')).response.status, 400)
    assert.equal((await outsider.client.request(path)).response.status, 404)
    assert.equal(
      (await outsider.client.request(`/users/${a.user.id}/profile`)).response.status,
      404
    )
    const peerProfile = await b.client.request(`/users/${a.user.id}/profile`)
    assert.equal(peerProfile.response.status, 200)
    assert.ok(!peerProfile.text.includes('name="fullName"'))
    assert.equal(
      (await b.client.request(`/users/${a.user.id}/conversation`, 'POST')).response.headers.get(
        'location'
      ),
      path
    )
    assert.equal(
      (await outsider.client.request(`${path}/messages`, 'POST', { body: 'intrusion' })).response
        .status,
      404
    )
    const body = `Unique ${randomUUID()} <script>alert(1)</script>`
    await a.client.request(`${path}/messages`, 'POST', { body })
    const message = await db.from('messages').where('conversation_id', id).first()
    const page = await b.client.request(path)
    assert.ok(page.text.includes('&lt;script&gt;'))
    assert.ok(
      (await b.client.request(`/search?q=${encodeURIComponent(body.slice(0, 20))}`)).text.includes(
        'class="search-result"'
      )
    )
    assert.ok(
      !(
        await outsider.client.request(`/search?q=${encodeURIComponent(body.slice(0, 20))}`)
      ).text.includes('class="search-result"')
    )
    assert.equal(
      (await b.client.request(`${path}/messages/${message.id}`, 'DELETE')).response.status,
      200
    )
    assert.ok(!(await b.client.request(path)).text.includes(`id="message-${message.id}"`))
    assert.ok((await a.client.request(path)).text.includes(`id="message-${message.id}"`))
    assert.ok(
      !(await b.client.request(`/search?q=${encodeURIComponent(body.slice(0, 20))}`)).text.includes(
        'class="search-result"'
      )
    )
    assert.equal(
      (await a.client.request(`${path}/messages/${message.id}`, 'DELETE')).response.status,
      200
    )
    assert.ok((await a.client.request(path)).text.includes('Ce message a été supprimé.'))
    await b.client.request(`/users/${a.user.id}/block`, 'POST')
    assert.equal(
      (await a.client.request(`${path}/messages`, 'POST', { body: 'blocked' })).response.status,
      403
    )
    await b.client.request('/profile')
    await b.client.request(`/users/${a.user.id}/unblock`, 'POST')
    await a.client.request(`${path}/messages`, 'POST', { body: 'after unblock' })
    assert.ok((await b.client.request(path)).text.includes('after unblock'))
  })

  test('removed members retain history and member profiles but cannot send or see later messages', async () => {
    const a = await account()
    const b = await account()
    const c = await account()
    const d = await account()
    const created = await a.client.request('/groups', 'POST', {
      name: 'Groupe de test',
      emails: `${b.user.email}\n${c.user.email}`,
    })
    const path = created.response.headers.get('location')!
    assert.match(path, /\/conversations\/\d+/)
    assert.ok((await b.client.request(path)).text.includes('Groupe de test'))
    assert.equal(
      (await b.client.request(`${path}/members`, 'POST', { email: d.user.email })).response.status,
      403
    )
    assert.equal((await d.client.request(path)).response.status, 404)
    await a.client.request(`${path}/messages`, 'POST', { body: 'Message-before-joining' })
    await a.client.request(`${path}/members`, 'POST', { email: d.user.email })
    assert.equal((await d.client.request(path)).response.status, 200)
    assert.ok(!(await d.client.request(path)).text.includes('Message-before-joining'))
    assert.ok(
      !(await d.client.request('/search?q=Message-before-joining')).text.includes(
        'class="search-result"'
      )
    )
    const groupId = Number(path.split('/').at(-1))
    const firstJoin = await db
      .from('conversation_members')
      .where('conversation_id', groupId)
      .where('user_id', d.user.id)
      .first()
    await a.client.request(`${path}/members`, 'POST', { email: d.user.email })
    const sameJoin = await db
      .from('conversation_members')
      .where('conversation_id', groupId)
      .where('user_id', d.user.id)
      .first()
    assert.equal(new Date(sameJoin.created_at).getTime(), new Date(firstJoin.created_at).getTime())
    await b.client.request(`${path}/messages`, 'POST', { body: 'Message de groupe' })
    assert.ok((await c.client.request(path)).text.includes('Message de groupe'))
    const stream = await b.client.events(Number(path.split('/').at(-1)))
    try {
      await a.client.request(`${path}/members/${b.user.id}/remove`, 'POST')
      const snapshot = await stream.next((data) => !!data.removal)
      assert.ok(snapshot.removal.by)
      assert.ok(snapshot.members.every((member: { id: number }) => member.id !== b.user.id))
    } finally {
      stream.close()
    }
    const readonly = await b.client.request(path)
    assert.equal(readonly.response.status, 200)
    assert.ok(readonly.text.includes('vous a retiré du groupe'))
    assert.ok(readonly.text.includes('Message de groupe'))
    assert.ok((await b.client.request('/dashboard')).text.includes('Groupe de test'))
    assert.equal(
      (await b.client.request(`${path}/messages`, 'POST', { body: 'removed' })).response.status,
      403
    )
    assert.equal((await b.client.request(`/users/${c.user.id}/profile`)).response.status, 200)
    assert.equal(
      (await b.client.request(`${path}/members`, 'POST', { email: d.user.email })).response.status,
      403
    )
    await a.client.request(`${path}/messages`, 'POST', { body: 'Confidential-after-removal' })
    assert.ok(!(await b.client.request(path)).text.includes('Confidential-after-removal'))
    assert.ok(
      !(await b.client.request('/search?q=Confidential-after-removal')).text.includes(
        'class="search-result"'
      )
    )
    await a.client.request(`${path}/members`, 'POST', { email: b.user.email })
    const afterRejoin = await b.client.request(path)
    assert.ok(!afterRejoin.text.includes('Message de groupe'))
    assert.ok(!afterRejoin.text.includes('Confidential-after-removal'))
    const oldMessage = await db
      .from('messages')
      .where('conversation_id', groupId)
      .where('body', 'Message de groupe')
      .first()
    assert.equal(
      (await b.client.request(`${path}/messages/${oldMessage.id}`, 'DELETE')).response.status,
      404
    )
    assert.equal(
      (await b.client.request(`${path}/messages`, 'POST', { body: 'Back in the group' })).response
        .status,
      302
    )
    assert.ok((await b.client.request(path)).text.includes('Back in the group'))
    assert.ok((await a.client.request(path)).text.includes('Vous avez ajouté'))
    assert.ok((await c.client.request(path)).text.includes('Test Kadea a ajouté'))
    assert.ok((await a.client.request(path)).text.includes('Vous avez retiré'))
    assert.equal(
      (await b.client.request(`${path}/members/${c.user.id}/promote`, 'POST')).response.status,
      403
    )
    assert.equal(
      (await a.client.request(`${path}/members/${c.user.id}/promote`, 'POST')).response.status,
      302
    )
    assert.equal(
      (
        await db
          .from('conversation_members')
          .where('conversation_id', groupId)
          .where('user_id', c.user.id)
          .first()
      ).is_admin,
      true
    )
    assert.equal(
      (await c.client.request(`${path}/members/${b.user.id}/promote`, 'POST')).response.status,
      302
    )
    assert.equal(
      (
        await db
          .from('conversation_members')
          .where('conversation_id', groupId)
          .where('user_id', b.user.id)
          .first()
      ).is_admin,
      true
    )
    const eventsBefore = await db
      .from('messages')
      .where('conversation_id', groupId)
      .where('event_kind', 'promoted')
    await a.client.request(`${path}/members/${b.user.id}/promote`, 'POST')
    assert.equal(
      (await db.from('messages').where('conversation_id', groupId).where('event_kind', 'promoted'))
        .length,
      eventsBefore.length
    )
    const systemMessage = eventsBefore[0]
    assert.equal(
      (await a.client.request(`${path}/messages/${systemMessage.id}`, 'DELETE')).response.status,
      403
    )
  })

  test('SSE delivers messages both ways and exposes delivery and read status', async () => {
    const a = await account()
    const b = await account()
    const created = await a.client.request('/conversations', 'POST', { email: b.user.email })
    const path = created.response.headers.get('location')!
    const id = Number(path.split('/').at(-1))
    const stream = await b.client.events(id)
    try {
      await stream.next(() => true)
      await a.client.request(`${path}/messages`, 'POST', { body: 'Realtime A to B' })
      const snapshot = await stream.next((data) =>
        data.messages.some((m: any) => m.body === 'Realtime A to B')
      )
      assert.ok(snapshot.members.find((member: any) => member.id === b.user.id).last_delivered_at)
      await b.client.request(`${path}/read`, 'POST')
      const read = await stream.next(
        (data) => !!data.members.find((member: any) => member.id === b.user.id).last_read_at
      )
      assert.ok(read.messages.length)
    } finally {
      stream.close()
    }
    const reverse = await a.client.events(id)
    try {
      await reverse.next(() => true)
      await b.client.request(`${path}/messages`, 'POST', { body: 'Realtime B to A' })
      await reverse.next((data) => data.messages.some((m: any) => m.body === 'Realtime B to A'))
    } finally {
      reverse.close()
    }
  })

  test('profile accepts a validated photo and rejects a wrong current password', async () => {
    const a = await account()
    await a.client.request('/profile')
    const bad = await a.client.request('/profile/password', 'POST', {
      currentPassword: 'wrong',
      password: `${password}new`,
      passwordConfirmation: `${password}new`,
    })
    assert.equal(bad.response.headers.get('location'), '/profile')
    assert.equal((await a.client.request('/dashboard')).response.status, 200)
    await a.client.request('/login')
    const alreadyConnected = await a.client.request('/login', 'POST', {
      email: a.user.email,
      password,
    })
    assert.equal(alreadyConnected.response.headers.get('location'), '/login')
    assert.equal((await a.client.request('/dashboard')).response.status, 200)
    const form = new FormData()
    form.set('fullName', 'Updated Kadea')
    form.set('avatar', new Blob(['not an image'], { type: 'image/png' }), 'bad.png')
    await a.client.request('/profile', 'POST', form)
    const accountRow = await db.from('users').where('id', a.user.id).first()
    assert.equal(accountRow.avatar, null)
    assert.equal((await a.client.request('/users/0/avatar')).response.status, 404)
    await a.client.request('/profile', 'POST', { fullName: 'Updated Kadea' })
    assert.ok((await a.client.request('/profile')).text.includes('Updated Kadea'))
    const valid = new FormData()
    valid.set('fullName', 'Updated Kadea')
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6X8AAAAASUVORK5CYII=',
      'base64'
    )
    valid.set('avatar', new Blob([png], { type: 'image/png' }), 'photo.png')
    await a.client.request('/profile', 'POST', valid)
    const withPhoto = await db.from('users').where('id', a.user.id).first()
    assert.match(withPhoto.avatar, /^[a-f0-9-]+\.png$/)
    try {
      assert.equal((await a.client.request(`/users/${a.user.id}/avatar`)).response.status, 200)
    } finally {
      await unlink(
        join(env.get('UPLOADS_PATH') || app.makePath('storage/uploads'), withPhoto.avatar)
      )
    }
    const otherSession = new Client()
    await otherSession.login(a.user.email)
    await a.client.request('/profile/password', 'POST', {
      currentPassword: password,
      password: `${password}new`,
      passwordConfirmation: `${password}new`,
    })
    assert.equal((await a.client.request('/profile')).response.status, 200)
    assert.equal(
      (await otherSession.request('/dashboard')).response.headers.get('location'),
      '/login'
    )
  })
})
