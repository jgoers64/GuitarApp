type AudioContextConstructor = typeof AudioContext

function getAudioContextClass(): AudioContextConstructor {
  if (typeof AudioContext !== 'undefined') {
    return AudioContext
  }
  const win = window as Window & {
    webkitAudioContext?: AudioContextConstructor
  }
  if (win.webkitAudioContext !== undefined) {
    return win.webkitAudioContext
  }
  throw new Error('Web Audio API is not supported in this browser.')
}

let sharedContext: AudioContext | null = null

export function getSharedAudioContext(): AudioContext {
  sharedContext ??= new (getAudioContextClass())()
  return sharedContext
}

export async function ensureAudioRunning(): Promise<AudioContext> {
  const context = getSharedAudioContext()
  if (context.state !== 'running') {
    await context.resume()
  }
  return context
}

export async function closeSharedAudioContext(): Promise<void> {
  if (sharedContext === null) {
    return
  }
  await sharedContext.close()
  sharedContext = null
}
