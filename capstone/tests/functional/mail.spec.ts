import { test } from '@japa/runner'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Secret } from '@adonisjs/core/helpers'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import AccountService, { MailConfigurationError, tokenHash } from '#services/account_service'

test('Resend configuration, accepted requests and rejected requests are handled correctly', async () => {
  assert.match(env.get('DB_DATABASE') || '', /_test$/)
  const previous = {
    driver: env.get('MAIL_DRIVER'),
    key: env.get('RESEND_API_KEY'),
    from: env.get('MAIL_FROM'),
    test: env.get('MAIL_TEST_MODE'),
    recipient: env.get('MAIL_TEST_RECIPIENT'),
  }
  const originalFetch = globalThis.fetch
  const user = await User.create({
    fullName: 'Mail test',
    email: `mail-${randomUUID()}@example.com`,
    password: 'Mail-test-password-2026!',
  })
  try {
    env.set('MAIL_DRIVER', 'resend')
    env.set('RESEND_API_KEY', new Secret(''))
    env.set('MAIL_FROM', '')
    await assert.rejects(() => AccountService.send(user, 'verify'), MailConfigurationError)
    assert.equal((await db.from('account_tokens').where('user_id', user.id)).length, 0)
    env.set('RESEND_API_KEY', new Secret('re_mock_key_not_a_real_secret'))
    env.set('MAIL_FROM', 'Kadea Chat <chat@example.com>')
    env.set('MAIL_TEST_MODE', false)
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), 'https://api.resend.com/emails')
      const body = JSON.parse(String(options?.body))
      assert.deepEqual(body.to, [user.email])
      const token = body.text.match(/\/verify-email\/([a-f0-9]{64})/)[1]
      const saved = await db.from('account_tokens').where('user_id', user.id).first()
      assert.equal(saved.token_hash, tokenHash(token))
      return new Response(JSON.stringify({ id: 'mock-delivery-id' }), { status: 200 })
    }
    await AccountService.send(user, 'verify')
    env.set('MAIL_TEST_MODE', true)
    env.set('MAIL_TEST_RECIPIENT', 'owner@example.com')
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body))
      assert.deepEqual(body.to, ['owner@example.com'])
      assert.ok(body.text.includes(user.email))
      assert.ok(body.text.includes(`#${user.id}`))
      const token = body.text.match(/\/verify-email\/([a-f0-9]{64})/)[1]
      assert.equal(
        (await db.from('account_tokens').where('token_hash', tokenHash(token)).first()).user_id,
        user.id
      )
      return new Response(JSON.stringify({ id: 'mock-forward-id' }), { status: 200 })
    }
    await AccountService.send(user, 'verify')
    assert.equal((await User.findOrFail(user.id)).email, user.email)
    globalThis.fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body))
      assert.deepEqual(body.to, [user.email])
      assert.ok(!body.text.includes('MODE TEST'))
      return new Response(JSON.stringify({ id: 'mock-reset-id' }), { status: 200 })
    }
    await AccountService.send(user, 'reset')
    await db.from('account_tokens').where('user_id', user.id).delete()
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { name: 'validation_error' } }), { status: 200 })
    await assert.rejects(() => AccountService.send(user, 'verify'), /HTTP 200/)
    assert.equal((await db.from('account_tokens').where('user_id', user.id)).length, 0)
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ name: 'validation_error' }), { status: 403 })
    await assert.rejects(() => AccountService.send(user, 'verify'), /HTTP 403 \(validation_error\)/)
    assert.equal((await db.from('account_tokens').where('user_id', user.id)).length, 0)
  } finally {
    globalThis.fetch = originalFetch
    env.set('MAIL_DRIVER', previous.driver)
    env.set('RESEND_API_KEY', previous.key)
    env.set('MAIL_FROM', previous.from)
    env.set('MAIL_TEST_MODE', previous.test)
    env.set('MAIL_TEST_RECIPIENT', previous.recipient)
    await user.delete()
  }
})
