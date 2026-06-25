import {
  appendFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cursorDir = join(root, '.cursor')
const stateFile = join(cursorDir, 'deploy-state.json')
const lockFile = join(cursorDir, 'deploy-worker.lock')
const logFile = join(cursorDir, 'deploy.log')

export function logDeploy(message) {
  mkdirSync(cursorDir, { recursive: true })
  appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`)
}

export function shouldDeployFile(filePath) {
  if (!filePath) {
    return true
  }

  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  return (
    /(^|[\\/])src[\\/]/.test(normalized) ||
    /(^|[\\/])(vite\.config\.ts|index\.html|package\.json)$/.test(normalized)
  )
}

function isWorkerRunning() {
  if (!existsSync(lockFile)) {
    return false
  }

  try {
    process.kill(Number(readFileSync(lockFile, 'utf8').trim()), 0)
    return true
  } catch {
    try {
      unlinkSync(lockFile)
    } catch {
      // ignore
    }
    return false
  }
}

export function scheduleDeploy(source, filePath = '') {
  if (filePath && !shouldDeployFile(filePath)) {
    logDeploy(`Skip deploy (${source}): ${filePath}`)
    return
  }

  mkdirSync(cursorDir, { recursive: true })
  writeFileSync(stateFile, JSON.stringify({ lastEditAt: Date.now() }))
  logDeploy(`Queued deploy (${source})${filePath ? `: ${filePath}` : ''}`)

  if (isWorkerRunning()) {
    logDeploy('Deploy worker already running — will redeploy after quiet period')
    return
  }

  const workerScript = join(root, 'scripts', 'deploy-debounce-worker.mjs')
  const out = join(cursorDir, 'deploy-worker.out.log')
  const err = join(cursorDir, 'deploy-worker.err.log')
  const outFd = openSync(out, 'a')
  const errFd = openSync(err, 'a')

  const worker = spawn(process.execPath, [workerScript], {
    cwd: root,
    detached: true,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
    env: process.env,
  })

  worker.unref()
  logDeploy(`Started deploy worker (pid ${worker.pid ?? 'unknown'})`)
}
