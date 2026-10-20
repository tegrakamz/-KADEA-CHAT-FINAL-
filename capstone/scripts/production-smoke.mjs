import { readFile, cp, mkdir } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { randomBytes } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

// Install the compiled artifact with production dependencies in an ignored directory.
const directory = resolve('tmp/production-smoke')
await mkdir(directory, { recursive: true })
await cp('build', directory, { recursive: true })
assert.ok(process.env.npm_execpath, 'Run this check using npm run test:production')
const install = spawnSync(
  process.execPath,
  [process.env.npm_execpath, 'ci', '--omit=dev', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'],
  {
    cwd: directory,
    stdio: 'inherit',
  }
)
if (install.status !== 0) process.exit(install.status || 1)
const local = await readFile('.env', 'utf8')
  .then(parseEnv)
  .catch(() => ({}))
const test = parseEnv(await readFile('.env.test', 'utf8'))
assert.match(test.DB_DATABASE, /_test$/)
const server = spawn(process.execPath, ['scripts/start-production.mjs'], {
  cwd: directory,
  stdio: 'inherit',
  env: {
    ...local,
    ...process.env,
    ...test,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '3340',
    APP_URL: 'https://production-smoke.example',
    APP_KEY: randomBytes(32).toString('hex'),
    MAIL_DRIVER: 'resend',
    MAIL_TEST_MODE: 'false',
    MAIL_FROM: 'smoke@example.com',
    RESEND_API_KEY: 'smoke-placeholder-never-sends',
  },
})
try {
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error('Production server exited during startup')
    const health = await fetch('http://127.0.0.1:3340/health', {
      signal: AbortSignal.timeout(1000),
    }).catch(() => null)
    if (health?.ok) {
      ready = true
      break
    }
    await new Promise((done) => setTimeout(done, 250))
  }
  assert.ok(ready, 'Production server should become healthy')
  assert.equal((await fetch('http://127.0.0.1:3340/theme-init.js')).status, 200)
  const missing = await fetch('http://127.0.0.1:3340/page-inconnue', { headers: { Accept: 'text/html' } })
  assert.equal(missing.status, 404)
  assert.ok((await missing.text()).includes('Page introuvable'))
  for (const path of ['/', '/login', '/signup', '/verify-email', '/forgot-password']) {
    const response = await fetch(`http://127.0.0.1:3340${path}`)
    assert.equal(response.status, 200, path)
    const html = await response.text()
    assert.ok(html.includes('Kadea Chat'))
    for (const asset of html.matchAll(/(?:src|href)="(\/assets\/[^"?]+)[^"]*"/g)) {
      assert.equal((await fetch(`http://127.0.0.1:3340${asset[1]}`)).status, 200, asset[1])
    }
  }
  console.log(
    'Production smoke passed: compiled artifact, production dependencies, migrations, health, pages and assets.'
  )
} finally {
  server.kill('SIGTERM')
}
