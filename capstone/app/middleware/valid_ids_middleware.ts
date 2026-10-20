import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class ValidIdsMiddleware {
  async handle({ params, response }: HttpContext, next: NextFn) {
    for (const name of ['id', 'messageId', 'userId']) {
      if (
        params[name] !== undefined &&
        (!/^[1-9]\d*$/.test(params[name]) || Number(params[name]) > 2147483647)
      ) {
        return response.notFound()
      }
    }
    return next()
  }
}
