/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

const env = await Env.create(new URL('../', import.meta.url), {
  // Node
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.string(),

  // App
  APP_KEY: Env.schema.secret(),
  APP_URL: Env.schema.string({ format: 'url', tld: false }),

  // Session
  SESSION_DRIVER: Env.schema.enum(['cookie', 'database'] as const),

  // PostgreSQL
  DB_HOST: Env.schema.string.optional(),
  DB_PORT: Env.schema.number.optional(),
  DB_USER: Env.schema.string.optional(),
  DB_PASSWORD: Env.schema.secret(),
  DB_DATABASE: Env.schema.string.optional(),
  DB_SSL: Env.schema.string.optional(),
  MAIL_DRIVER: Env.schema.enum.optional(['log', 'resend'] as const),
  MAIL_FROM: Env.schema.string.optional(),
  MAIL_TEST_MODE: Env.schema.boolean.optional(),
  MAIL_TEST_RECIPIENT: Env.schema.string.optional({ format: 'email' }),
  RESEND_API_KEY: Env.schema.secret.optional(),
  UPLOADS_PATH: Env.schema.string.optional(),
  DB_SSL_CA: Env.schema.string.optional(),
})

if (env.get('NODE_ENV') === 'production') {
  if (env.get('MAIL_TEST_MODE')) throw new Error('MAIL_TEST_MODE is forbidden in production')
  if (!env.get('APP_URL').startsWith('https://'))
    throw new Error('APP_URL must use HTTPS in production')
  if (
    env.get('MAIL_DRIVER') !== 'resend' ||
    !env.get('RESEND_API_KEY')?.release() ||
    !env.get('MAIL_FROM')
  ) {
    throw new Error('Production requires MAIL_DRIVER=resend, MAIL_FROM and RESEND_API_KEY')
  }
}

if (env.get('MAIL_TEST_MODE') && !env.get('MAIL_TEST_RECIPIENT')) {
  throw new Error('MAIL_TEST_RECIPIENT is required when MAIL_TEST_MODE=true')
}

export default env
