import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import type { Authenticators } from '@adonisjs/auth/types'
import { tokenHash } from '#services/account_service'

/**
 * Guest middleware is used to deny access to routes that should
 * be accessed by unauthenticated users.
 *
 * Authentication forms remain visible from the landing page, even when
 * a session is open. Submissions still require an unauthenticated user.
 */
export default class GuestMiddleware {
  async handle(
    ctx: HttpContext,
    next: NextFn,
    options: { guards?: (keyof Authenticators)[] } = {}
  ) {
    for (let guard of options.guards || [ctx.auth.defaultGuard]) {
      if (await ctx.auth.use(guard).check()) {
        const user = ctx.auth.getUserOrFail()
        if (ctx.session.get('credentialVersion') !== tokenHash(user.password)) {
          await ctx.auth.use('web').logout()
          continue
        }
        if (ctx.request.method() === 'GET') return next()
        ctx.session.flash(
          'error',
          'Un compte est déjà connecté dans ce navigateur. Déconnectez-vous pour utiliser un autre compte.'
        )
        return ctx.response.redirect(ctx.request.url())
      }
    }

    return next()
  }
}
