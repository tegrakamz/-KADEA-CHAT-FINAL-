import app from '@adonisjs/core/services/app'
import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const dbConfig = defineConfig({
  connection: 'pg',
  prettyPrintDebugQueries: true,

  connections: {
    pg: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST') || '127.0.0.1',
        port: env.get('DB_PORT') || 5432,
        user: env.get('DB_USER') || 'postgres',
        password: env.get('DB_PASSWORD').release(),
        database: env.get('DB_DATABASE') || 'kadea_chat',
        ssl:
          env.get('DB_SSL') === 'true'
            ? { rejectUnauthorized: true, ca: env.get('DB_SSL_CA')?.replaceAll('\\n', '\n') }
            : false,
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
      schemaGeneration: {
        enabled: app.inDev,
        rulesPaths: ['./database/schema_rules.js'],
      },
      debug: app.inDev,
    },
  },
})

export default dbConfig
