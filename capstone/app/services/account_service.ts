import { createHash, randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

export class MailConfigurationError extends Error {
  constructor() {
    super(
      'Resend requires RESEND_API_KEY and MAIL_FROM. Configure them in .env and restart the server.'
    )
  }
}

export default class AccountService {
  static get testDelivery() {
    return !this.localDelivery && !!env.get('MAIL_TEST_MODE')
  }
  static get localDelivery() {
    return !app.inProduction && env.get('MAIL_DRIVER') !== 'resend'
  }

  static async send(
    user: { id: number; email: string; fullName?: string | null; full_name?: string | null },
    purpose: 'verify' | 'reset'
  ) {
    if (env.get('MAIL_TEST_MODE') && (app.inProduction || !env.get('MAIL_TEST_RECIPIENT'))) {
      throw new Error('Mail test forwarding requires a recipient and is forbidden in production')
    }
    if (!this.localDelivery && (!env.get('RESEND_API_KEY')?.release() || !env.get('MAIL_FROM'))) {
      throw new MailConfigurationError()
    }
    const token = randomBytes(32).toString('hex')
    await db.table('account_tokens').insert({
      user_id: user.id,
      purpose,
      token_hash: tokenHash(token),
      expires_at: new Date(Date.now() + (purpose === 'verify' ? 86400000 : 3600000)),
    })
    const link = `${env.get('APP_URL').replace(/\/$/, '')}/${purpose === 'verify' ? 'verify-email' : 'reset-password'}/${token}`
    const subject =
      purpose === 'verify'
        ? 'Confirmez votre adresse — Kadea Chat'
        : 'Réinitialisez votre mot de passe — Kadea Chat'
    const forwarded = this.testDelivery && purpose === 'verify'
    const recipient = forwarded ? env.get('MAIL_TEST_RECIPIENT')! : user.email
    const context = forwarded
      ? `MODE TEST — Confirmation transférée.\nCompte concerné : ${user.fullName || user.full_name || 'Sans nom'} (#${user.id})\nAdresse saisie à l’inscription : ${user.email}\nCe lien confirme uniquement ce compte. Ce test ne prouve pas la possession de cette adresse.\n\n`
      : ''
    const text = `${context}${subject}\n\n${link}\n\nCe lien expire dans ${purpose === 'verify' ? '24 heures' : 'une heure'}. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.`
    try {
      if (this.localDelivery) {
        const directory = app.tmpPath('mail')
        await mkdir(directory, { recursive: true })
        await writeFile(
          `${directory}/${Date.now()}-${randomBytes(4).toString('hex')}.txt`,
          `To: ${user.email}\n${text}`,
          { mode: 0o600 }
        )
      } else {
        const result = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.get('RESEND_API_KEY')?.release() || ''}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: this.testDelivery ? 'Kadea Chat <onboarding@resend.dev>' : env.get('MAIL_FROM'),
            to: [recipient],
            subject,
            text,
          }),
          signal: AbortSignal.timeout(15000),
        })
        const payload = (await result.json().catch(() => null)) as {
          id?: unknown
          name?: unknown
          error?: { name?: unknown }
        } | null
        if (!result.ok || payload?.error || typeof payload?.id !== 'string' || !payload.id) {
          const failure = payload?.error || payload || {}
          const code =
            typeof failure.name === 'string' && /^[a-z_]+$/.test(failure.name)
              ? failure.name
              : 'unknown_error'
          throw new Error(
            `Resend rejected the email: HTTP ${result.status} (${code}). Check API key, verified sender, test-recipient restrictions and account quota in Resend.`
          )
        }
      }
    } catch (error) {
      await db.from('account_tokens').where('token_hash', tokenHash(token)).delete()
      throw error
    }
  }
}
