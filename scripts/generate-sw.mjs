import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const DIST_DIR = path.resolve('dist')
const APP_BASE = '/GuitarApp/'

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await walk(fullPath)))
    } else {
      files.push(fullPath)
    }
  }

  return files
}

const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const cacheName = `guitar-app-${pkg.version}-${Date.now()}`

const files = (await walk(DIST_DIR))
  .filter((file) => path.basename(file) !== 'sw.js')
  .map((file) => {
    const relativePath = path.relative(DIST_DIR, file).split(path.sep).join('/')
    return `${APP_BASE}${relativePath}`
  })

const precacheUrls = [...new Set([APP_BASE, ...files])]

const serviceWorker = `const CACHE_PREFIX = 'guitar-app-'
const CACHE_NAME = '${cacheName}'
const APP_BASE = '${APP_BASE}'
const PRECACHE_URLS = ${JSON.stringify(precacheUrls, null, 2)}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event

  if (request.method !== 'GET') {
    return
  }

  const url = new URL(request.url)

  if (url.origin !== self.location.origin || !url.pathname.startsWith(APP_BASE)) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            void caches.open(CACHE_NAME).then((cache) => cache.put(APP_BASE, copy))
          }

          return response
        })
        .catch(async () => {
          return (
            (await caches.match(request)) ||
            (await caches.match(APP_BASE)) ||
            caches.match(APP_BASE + 'index.html')
          )
        }),
    )

    return
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }

        return response
      })
    }),
  )
})
`

await writeFile(path.join(DIST_DIR, 'sw.js'), serviceWorker, 'utf8')
console.log(`Generated offline service worker with ${precacheUrls.length} files.`)
