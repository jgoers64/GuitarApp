import { rm } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import { build } from 'vite'

const root = process.cwd()
const outDir = path.join(root, '.tuner-test-build')
const entry = path.join(root, 'tests', 'tuner.test.ts')
const output = path.join(outDir, 'runner.mjs')

try {
  await build({
    configFile: false,
    logLevel: 'error',
    build: {
      ssr: entry,
      outDir,
      emptyOutDir: true,
      minify: false,
      target: 'node22',
      rollupOptions: {
        output: {
          entryFileNames: 'runner.mjs',
        },
      },
    },
  })

  await import(`${pathToFileURL(output).href}?run=${Date.now()}`)
} finally {
  await rm(outDir, { recursive: true, force: true })
}
