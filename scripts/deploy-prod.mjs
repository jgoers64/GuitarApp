import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const logFile = join(root, '.cursor', 'deploy.log')

function log(message) {
  mkdirSync(join(root, '.cursor'), { recursive: true })
  appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`)
}

function run(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd: root,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })

    child.stdout.on('data', (chunk) => log(chunk.toString().trimEnd()))
    child.stderr.on('data', (chunk) => log(chunk.toString().trimEnd()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`"${command}" exited with code ${code}`))
      }
    })
  })
}

try {
  log('Running npm run build')
  await run('npm run build')
  log('Running vercel --prod --yes')
  await run('vercel --prod --yes')
  log('Deploy finished successfully')
} catch (error) {
  log(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
