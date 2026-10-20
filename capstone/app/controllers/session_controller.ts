import User from '#models/user'
import { loginValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { tokenHash } from '#services/account_service'
import { errors } from '@adonisjs/auth'

/**
 * SessionController handles user authentication and session management.
 * It provides methods for displaying the login page, authenticating users,
 * and logging out.
 */
export default class SessionController {
  /**
   * Display the login page
   */
  async create({ view }: HttpContext) {
    return view.render('pages/auth/login')
  }

  /**
   * Authenticate user credentials and create a new session
   */
  async store({ request, auth, response, session }: HttpContext) {
    const { email, password } = await request.validateUsing(loginValidator)
    let user: User
    try {
      user = await User.verifyCredentials(email, password)
    } catch (error) {
      if (!(error instanceof errors.E_INVALID_CREDENTIALS)) throw error
      session.flashOnly(['email'])
      session.flash('inputErrorsBag', { email: ['Adresse e-mail ou mot de passe incorrect.'] })
      return response.redirect('/login')
    }

    const account = await db.from('users').where('id', user.id).select('email_verified_at').first()
    if (!account?.email_verified_at) {
      session.put('pendingVerificationId', user.id)
      session.flash('error', 'Confirmez votre adresse e-mail avant de vous connecter.')
      return response.redirect('/verify-email')
    }

    await auth.use('web').login(user)
    session.forget('pendingVerificationId')
    session.put('credentialVersion', tokenHash(user.password))
    response.redirect().toRoute('dashboard')
  }

  /**
   * Log out the current user and destroy their session
   */
  async destroy({ auth, response }: HttpContext) {
    await auth.use('web').logout()
    response.redirect().toRoute('session.create')
  }
}
