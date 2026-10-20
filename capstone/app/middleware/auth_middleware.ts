import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import db from '@adonisjs/lucid/services/db'
import { tokenHash } from '#services/account_service'

/**
 * Auth middleware is used authenticate HTTP requests and deny
 * access to unauthenticated users.
 */
export default class AuthMiddleware {
  /**
   * The URL to redirect to, when authentication fails
   */
  redirectTo = '/login'

  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: {
      guards?: (keyof Authenticators)[]
    } = {}
  ) {
    await ctx.auth.authenticateUsing(options.guards, { loginRoute: this.redirectTo })
    const user = ctx.auth.getUserOrFail()
    const account = await db.from('users').where('id', user.id).select('email_verified_at').first()
    if (
      !account?.email_verified_at ||
      ctx.session.get('credentialVersion') !== tokenHash(user.password)
    ) {
      await ctx.auth.use('web').logout()
      return ctx.response.redirect('/login')
    }
    return next()
  }
}
