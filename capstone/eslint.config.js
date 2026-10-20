import { configApp } from '@adonisjs/eslint-config'
export default configApp(
  { ignores: ['tmp/**', 'storage/**', 'database/schema.ts'] },
  // Compact assertions keep the HTTP response and expectation together in tests.
  { files: ['tests/**/*.ts'], rules: { '@unicorn/no-await-expression-member': 'off' } }
)
