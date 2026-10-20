import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'
import { tokenHash } from '#services/account_service'

export default class RateLimitMiddleware {
  async handle({ request, response }: HttpContext, next: NextFn) {
    const key = tokenHash(`${request.ip()}:${request.url()}`)
    const result = await db.rawQuery(
      `INSERT INTO rate_limits (key, attempts, expires_at) VALUES (?, 1, NOW() + INTERVAL '15 minutes')
       ON CONFLICT (key) DO UPDATE SET
       attempts = CASE WHEN rate_limits.expires_at < NOW() THEN 1 ELSE rate_limits.attempts + 1 END,
       expires_at = CASE WHEN rate_limits.expires_at < NOW() THEN NOW() + INTERVAL '15 minutes' ELSE rate_limits.expires_at END
       RETURNING attempts`,
      [key]
    )
    if (result.rows[0].attempts > 15) {
      response.header('Retry-After', '900')
      return response.tooManyRequests('Trop de tentatives. Réessayez dans 15 minutes.')
    }
    return next()
  }
}
