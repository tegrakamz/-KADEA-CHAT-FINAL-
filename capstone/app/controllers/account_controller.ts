import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import User from '#models/user'
import AccountService, { tokenHash } from '#services/account_service'
import {
  emailValidator,
  resetValidator,
  profileValidator,
  changePasswordValidator,
} from '#validators/user'
import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

export default class AccountController {
  async verification({ view, session, request }: HttpContext) {
    if (request.input('change') === '1') session.forget('pendingVerificationId')
    const pending = await db
      .from('users')
      .where('id', Number(session.get('pendingVerificationId')) || 0)
      .whereNull('email_verified_at')
      .select('id', 'full_name', 'email')
      .first()
    if (!pending) session.forget('pendingVerificationId')
    return view.render('pages/auth/email_action', {
      reset: false,
      localMail: AccountService.localDelivery,
      pending,
      testMail: AccountService.testDelivery,
    })
  }

  async forgot({ view }: HttpContext) {
    return view.render('pages/auth/email_action', {
      reset: true,
      localMail: AccountService.localDelivery,
      pending: null,
      testMail: false,
    })
  }

  async send({ request, response, session, logger }: HttpContext) {
    const purpose = request.url() === '/forgot-password' ? 'reset' : 'verify'
    const pendingId = purpose === 'verify' ? Number(session.get('pendingVerificationId')) : 0
    let user
    if (pendingId) {
      user = await db.from('users').where('id', pendingId).whereNull('email_verified_at').first()
      if (!user) {
        session.forget('pendingVerificationId')
        session.flash(
          'error',
          'Ce compte est déjà confirmé ou indisponible. Choisissez un autre compte ou connectez-vous.'
        )
        return response.redirect('/verify-email')
      }
    } else {
      const { email } = await request.validateUsing(emailValidator)
      user = await db.from('users').whereRaw('LOWER(email) = ?', [email]).first()
      if (purpose === 'verify' && user && !user.email_verified_at)
        session.put('pendingVerificationId', user.id)
    }
    try {
      if (user && (purpose === 'verify' ? !user.email_verified_at : !!user.email_verified_at)) {
        await AccountService.send(user, purpose)
      }
      session.flash(
        'success',
        AccountService.localDelivery
          ? 'Mode local : si le compte correspond, le message a été enregistré dans capstone/tmp/mail. Aucun e-mail n’est envoyé dans votre boîte de réception.'
          : purpose === 'verify' && AccountService.testDelivery
            ? 'Mode test : si un compte non confirmé correspond, la confirmation a été acceptée par Resend pour la boîte de test configurée.'
            : 'Demande prise en compte. Si un compte correspond, vérifiez votre boîte de réception et vos courriers indésirables.'
      )
    } catch (error) {
      logger.error({ err: error }, 'Account email failed')
      session.flash(
        'error',
        'Le service e-mail est momentanément indisponible. Réessayez plus tard.'
      )
    }
    return response.redirect(purpose === 'verify' ? '/verify-email' : '/forgot-password')
  }

  async verify({ params, response, session }: HttpContext) {
    const verified = await db.transaction(async (trx) => {
      const token = await trx
        .from('account_tokens')
        .where('token_hash', tokenHash(String(params.token)))
        .where('purpose', 'verify')
        .where('expires_at', '>', new Date())
        .forUpdate()
        .first()
      if (!token) return false
      await trx.from('users').where('id', token.user_id).update({ email_verified_at: new Date() })
      await trx
        .from('account_tokens')
        .where('user_id', token.user_id)
        .where('purpose', 'verify')
        .delete()
      return token.user_id
    })
    if (verified && Number(session.get('pendingVerificationId')) === Number(verified))
      session.forget('pendingVerificationId')
    session.flash(
      verified ? 'success' : 'error',
      verified
        ? 'Adresse confirmée. Vous pouvez vous connecter.'
        : 'Lien invalide ou expiré. Demandez un nouveau lien.'
    )
    return response.redirect(verified ? '/login' : '/verify-email')
  }

  async resetForm({ params, view }: HttpContext) {
    return view.render('pages/auth/reset', { token: params.token })
  }

  async reset({ params, request, response, session }: HttpContext) {
    const { password } = await request.validateUsing(resetValidator)
    const passwordHash = await hash.make(password)
    const changed = await db.transaction(async (trx) => {
      const token = await trx
        .from('account_tokens')
        .where('token_hash', tokenHash(String(params.token)))
        .where('purpose', 'reset')
        .where('expires_at', '>', new Date())
        .forUpdate()
        .first()
      if (!token) return false
      await trx
        .from('users')
        .where('id', token.user_id)
        .update({ password: passwordHash, updated_at: new Date() })
      await trx
        .from('account_tokens')
        .where('user_id', token.user_id)
        .where('purpose', 'reset')
        .delete()
      return true
    })
    session.flash(
      changed ? 'success' : 'error',
      changed
        ? 'Mot de passe modifié. Connectez-vous.'
        : 'Lien invalide ou expiré. Demandez un nouveau lien.'
    )
    return response.redirect(changed ? '/login' : '/forgot-password')
  }

  async profile({ auth, view, response }: HttpContext) {
    // Reuse this page inside the chat's same-origin profile panel.
    response.header('X-Frame-Options', 'SAMEORIGIN')
    const user = auth.getUserOrFail()
    const profile = await db.from('users').where('id', user.id).select('avatar').first()
    const blocked = await db
      .from('user_blocks as b')
      .join('users as u', 'u.id', 'b.blocked_user_id')
      .where('b.user_id', user.id)
      .select('u.id', 'u.full_name')
    return view.render('pages/profile', { user, profile, blocked })
  }

  async update({ auth, request, response, session }: HttpContext) {
    const { fullName } = await request.validateUsing(profileValidator)
    const avatar = request.file('avatar', { size: '2mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] })
    if (avatar && (!avatar.isValid || !avatar.extname)) {
      session.flash('error', 'Photo invalide : JPG, PNG ou WebP, maximum 2 Mo.')
      return response.redirect('/profile')
    }
    const updates: { full_name: string; avatar?: string; updated_at: Date } = {
      full_name: fullName,
      updated_at: new Date(),
    }
    if (avatar) {
      const directory = env.get('UPLOADS_PATH') || app.makePath('storage/uploads')
      await mkdir(directory, { recursive: true })
      updates.avatar = `${randomUUID()}.${avatar.extname}`
      await avatar.move(directory, { name: updates.avatar })
    }
    await db.from('users').where('id', auth.getUserOrFail().id).update(updates)
    session.flash('success', 'Profil mis à jour.')
    return response.redirect('/profile')
  }

  async password({ auth, request, response, session }: HttpContext) {
    const { currentPassword, password } = await request.validateUsing(changePasswordValidator)
    const user = await User.findOrFail(auth.getUserOrFail().id)
    if (!(await hash.verify(user.password, currentPassword))) {
      session.flash('inputErrorsBag', {
        currentPassword: ['Le mot de passe actuel est incorrect.'],
      })
      session.flash('error', 'Le mot de passe actuel est incorrect.')
      return response.redirect('/profile')
    }
    user.password = password
    await user.save()
    session.put('credentialVersion', tokenHash(user.password))
    session.flash('success', 'Mot de passe modifié.')
    return response.redirect('/profile')
  }

  async updateAvatar({ auth, request, response, session }: HttpContext) {
    const avatar = request.file('avatar', { size: '2mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] })
    if (!avatar || !avatar.isValid || !avatar.extname) {
      session.flash('error', 'Photo invalide : JPG, PNG ou WebP, maximum 2 Mo.')
      return response.redirect('/profile')
    }
    const directory = env.get('UPLOADS_PATH') || app.makePath('storage/uploads')
    await mkdir(directory, { recursive: true })
    const filename = `${randomUUID()}.${avatar.extname}`
    await avatar.move(directory, { name: filename })
    if (!avatar.isValid) {
      session.flash('error', 'Impossible d’enregistrer cette photo. Réessayez.')
      return response.redirect('/profile')
    }
    await db
      .from('users')
      .where('id', auth.getUserOrFail().id)
      .update({ avatar: filename, updated_at: new Date() })
    session.flash('success', 'Photo de profil mise à jour.')
    return response.redirect('/profile')
  }

  async avatar({ params, response }: HttpContext) {
    const user = await db.from('users').where('id', params.id).select('avatar').first()
    if (!user?.avatar || !/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/.test(user.avatar))
      return response.notFound()
    response.header('Cache-Control', 'private, max-age=300')
    return response.download(
      join(env.get('UPLOADS_PATH') || app.makePath('storage/uploads'), user.avatar)
    )
  }

  async unblock({ auth, params, response, session }: HttpContext) {
    await db
      .from('user_blocks')
      .where('user_id', auth.getUserOrFail().id)
      .where('blocked_user_id', params.id)
      .delete()
    session.flash('success', 'Utilisateur débloqué.')
    return response.redirect('/profile')
  }
}
