import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'
import pg from 'pg'

const local = await readFile('.env', 'utf8')
  .then(parseEnv)
  .catch(() => ({}))
const test = parseEnv(await readFile('.env.test', 'utf8'))
const config = { ...local, ...process.env, ...test }
const name = config.DB_DATABASE
if (!/^[a-z0-9_]+_test$/.test(name)) throw new Error('Test database name must end with _test')
const client = new pg.Client({
  host: config.DB_HOST || '127.0.0.1',
  port: Number(config.DB_PORT || 5432),
  user: config.DB_USER || 'postgres',
  password: config.DB_PASSWORD,
  database: 'postgres',
  ssl:
    config.DB_SSL === 'true'
      ? { rejectUnauthorized: true, ca: config.DB_SSL_CA?.replaceAll('\\n', '\n') }
      : false,
})
await client.connect()
try {
  if (!(await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount) {
    await client.query(`CREATE DATABASE "${name}"`)
  }
} finally {
  await client.end()
}
const result = spawnSync(process.execPath, ['ace', 'migration:run', '--force'], {
  stdio: 'inherit',
  env: { ...process.env, ...test, NODE_ENV: 'test' },
})
process.exitCode = result.status ?? 1
