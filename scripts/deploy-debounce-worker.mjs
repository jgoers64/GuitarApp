import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logDeploy } from './schedule-deploy.mjs'

const QUIET_MS = 12_000
const POLL_MS = 2_000

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cursorDir = join(root, '.cursor')
const stateFile = join(cursorDir, 'deploy-state.json')
const lockFile = join(cursorDir, 'deploy-worker.lock')

function readLastEditAt() {
  if (!existsSync(stateFile)) {
    return 0
  }

  try {
    return JSON.parse(readFileSync(stateFile, 'utf8')).lastEditAt ?? 0
  } catch {
    return 0
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForQuietPeriod() {
  while (true) {
    const elapsed = Date.now() - readLastEditAt()
    if (elapsed >= QUIET_MS) {
      return
    }
    await sleep(POLL_MS)
  }
}

writeFileSync(lockFile, String(process.pid))
logDeploy(`Deploy worker started (pid ${process.pid})`)

try {
  await waitForQuietPeriod()
  logDeploy('Quiet period elapsed — deploying')

  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts', 'deploy-prod.mjs')], {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    })

    child.on('error', (error) => reject(error))
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`deploy-prod exited with code ${code}`))
      }
    })
  })
} catch (error) {
  logDeploy(error instanceof Error ? error.message : String(error))
} finally {
  if (existsSync(lockFile)) {
    unlinkSync(lockFile)
  }
}
