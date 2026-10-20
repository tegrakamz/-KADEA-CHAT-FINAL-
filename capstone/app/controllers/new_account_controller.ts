import User from '#models/user'
import { signupValidator } from '#validators/user'
import type { HttpContext } from '@adonisjs/core/http'
import AccountService from '#services/account_service'

/**
 * NewAccountController handles user registration.
 * It provides methods for displaying the signup page and creating
 * new user accounts.
 */
export default class NewAccountController {
  /**
   * Display the signup page
   */
  async create({ view }: HttpContext) {
    return view.render('pages/auth/signup')
  }

  /**
   * Create a new user account and authenticate the user
   */
  async store({ request, response, session, logger }: HttpContext) {
    const { fullName, email, password } = await request.validateUsing(signupValidator)
    const user = await User.create({ fullName, email, password })
    session.put('pendingVerificationId', user.id)

    try {
      await AccountService.send(user, 'verify')
      session.flash(
        'success',
        AccountService.localDelivery
          ? 'Compte créé en mode local. Le lien de confirmation est enregistré dans capstone/tmp/mail ; aucun e-mail réel n’est envoyé.'
          : AccountService.testDelivery
            ? 'Compte créé. Resend a accepté la confirmation envoyée à la boîte de test configurée. Le compte reste non confirmé jusqu’au clic sur le lien.'
            : 'Compte créé. Resend a accepté l’envoi de confirmation. Consultez votre boîte e-mail et vos courriers indésirables.'
      )
    } catch (error) {
      logger.error({ err: error }, 'Confirmation email failed')
      session.flash(
        'error',
        'Compte créé, mais l’envoi a échoué. Vous pouvez renvoyer le lien de confirmation.'
      )
    }
    response.redirect('/verify-email')
  }
}
