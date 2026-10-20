import { spawn } from 'node:child_process'

const migration = spawn(process.execPath, ['ace', 'migration:run', '--force'], { stdio: 'inherit' })
const status = await new Promise((resolve) => {
  migration.once('error', () => resolve(1))
  migration.once('exit', resolve)
})
if (status !== 0) process.exit(typeof status === 'number' ? status : 1)
const server = spawn(process.execPath, ['bin/server.js'], { stdio: 'inherit' })
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.kill(signal))
server.once('error', () => {
  process.exitCode = 1
})
server.once('exit', (code) => {
  process.exitCode = code ?? 1
})
