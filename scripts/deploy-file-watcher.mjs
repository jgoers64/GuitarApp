import { scheduleDeploy } from './schedule-deploy.mjs'
import { watch } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

console.log('Auto-deploy watch started')
console.log('  Waits 12s after last change, then: npm run build && vercel --prod')
console.log('  Logs: .cursor/deploy.log')
console.log('  Press Ctrl+C to stop\n')

watch(join(root, 'src'), { recursive: true }, (_event, filename) => {
  if (filename) {
    scheduleDeploy('watch', join('src', filename))
  }
})

for (const file of ['vite.config.ts', 'index.html', 'package.json']) {
  watch(join(root, file), () => {
    scheduleDeploy('watch', file)
  })
}
