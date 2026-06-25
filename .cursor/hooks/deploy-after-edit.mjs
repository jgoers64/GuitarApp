import { scheduleDeploy } from '../../scripts/schedule-deploy.mjs'

function readStdinWithTimeout(timeoutMs) {
  return new Promise((resolve) => {
    const chunks = []
    let settled = false

    const finish = (value) => {
      if (settled) {
        return
      }
      settled = true
      resolve(value)
    }

    const timer = setTimeout(() => finish({}), timeoutMs)

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => chunks.push(chunk))
    process.stdin.on('end', () => {
      clearTimeout(timer)
      if (chunks.length === 0) {
        finish({})
        return
      }

      try {
        finish(JSON.parse(chunks.join('')))
      } catch {
        finish({})
      }
    })

    process.stdin.resume()
  })
}

const source = process.argv[2] ?? 'hook'
const input = await readStdinWithTimeout(500)
const filePath =
  input.file_path ?? input.path ?? input.filePath ?? input.file ?? ''

scheduleDeploy(source, filePath)
process.exit(0)
