const PLUCK_DURATION_SEC = 3

const bufferCache = new Map<string, AudioBuffer>()
let roomImpulse: AudioBuffer | null = null

function getDamping(frequency: number): number {
  if (frequency < 120) return 0.9968
  if (frequency < 200) return 0.9955
  return 0.994
}

function getLoopLowpass(frequency: number): number {
  if (frequency < 120) return 0.62
  if (frequency < 200) return 0.58
  return 0.54
}

function cacheKey(frequency: number, sampleRate: number): string {
  return `${frequency.toFixed(2)}@${sampleRate}`
}

function softClipCurve(): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(256)
  for (let i = 0; i < 256; i++) {
    const x = (i * 2) / 255 - 1
    curve[i] = Math.tanh(x * 1.4) * 0.92
  }
  return curve
}

function createRoomImpulse(context: AudioContext): AudioBuffer {
  if (roomImpulse !== null) {
    return roomImpulse
  }

  const sampleRate = context.sampleRate
  const length = Math.floor(sampleRate * 1.1)
  const buffer = context.createBuffer(2, length, sampleRate)

  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel)
    const channelOffset = channel === 0 ? 0 : 11

    for (let i = 0; i < length; i++) {
      const time = i / sampleRate
      let sample = 0

      if (time < 0.025) {
        const reflection = Math.floor(time * sampleRate + channelOffset) % 97
        sample += (reflection / 97 - 0.5) * 0.35 * (1 - time / 0.025)
      }

      sample += (Math.random() * 2 - 1) * Math.exp(-time * 4.2) * 0.18
      data[i] = sample
    }
  }

  roomImpulse = buffer
  return buffer
}

/**
 * Filtered Karplus-Strong with a soft pick excitation and fractional delay.
 */
export function createGuitarPluckBuffer(
  context: AudioContext,
  frequency: number,
): AudioBuffer {
  const key = cacheKey(frequency, context.sampleRate)
  const cached = bufferCache.get(key)
  if (cached !== undefined) {
    return cached
  }

  const sampleRate = context.sampleRate
  const exactPeriod = sampleRate / frequency
  const period = Math.floor(exactPeriod)
  const fraction = exactPeriod - period
  const length = Math.floor(sampleRate * PLUCK_DURATION_SEC)
  const buffer = context.createBuffer(1, length, sampleRate)
  const data = buffer.getChannelData(0)
  const damping = getDamping(frequency)
  const loopLowpass = getLoopLowpass(frequency)

  let pink = 0
  for (let i = 0; i < period; i++) {
    const white = Math.random() * 2 - 1
    pink = pink * 0.9 + white * 0.1
    const phase = i / period
    const envelope = Math.sin(Math.PI * phase) ** 1.35
    data[i] = pink * envelope * 0.42
  }

  let filtered = 0
  for (let i = period; i < length; i++) {
    const index = i - period
    const delayed =
      data[index] * (1 - fraction) + data[index + 1] * fraction
    filtered = loopLowpass * filtered + (1 - loopLowpass) * delayed
    data[i] = filtered * damping
  }

  bufferCache.set(key, buffer)
  return buffer
}

export function createGuitarToneChain(
  context: AudioContext,
  frequency: number,
): { input: AudioNode; output: AudioNode; nodes: AudioNode[] } {
  const nodes: AudioNode[] = []
  const input = context.createGain()

  const highPass = context.createBiquadFilter()
  highPass.type = 'highpass'
  highPass.frequency.value = 82
  highPass.Q.value = 0.55

  const soundHole = context.createBiquadFilter()
  soundHole.type = 'peaking'
  soundHole.frequency.value = 105
  soundHole.Q.value = 1.4
  soundHole.gain.value = 3.5

  const body = context.createBiquadFilter()
  body.type = 'peaking'
  body.frequency.value = Math.min(240, 120 + frequency * 0.55)
  body.Q.value = 0.75
  body.gain.value = 2.5

  const presence = context.createBiquadFilter()
  presence.type = 'peaking'
  presence.frequency.value = Math.min(680, 320 + frequency * 0.8)
  presence.Q.value = 0.65
  presence.gain.value = 1.2

  const air = context.createBiquadFilter()
  air.type = 'lowpass'
  air.frequency.value = Math.min(3400, 2200 + frequency * 2.5)
  air.Q.value = 0.45

  const warmth = context.createWaveShaper()
  warmth.curve = softClipCurve()
  warmth.oversample = '2x'

  const dryGain = context.createGain()
  dryGain.gain.value = 0.8

  const wetGain = context.createGain()
  wetGain.gain.value = 0.28

  const reverb = context.createConvolver()
  reverb.buffer = createRoomImpulse(context)
  reverb.normalize = false

  const output = context.createGain()
  output.gain.value = 1

  input.connect(highPass)
  highPass.connect(soundHole)
  soundHole.connect(body)
  body.connect(presence)
  presence.connect(air)
  air.connect(warmth)

  warmth.connect(dryGain)
  warmth.connect(wetGain)
  wetGain.connect(reverb)

  dryGain.connect(output)
  reverb.connect(output)

  nodes.push(
    input,
    highPass,
    soundHole,
    body,
    presence,
    air,
    warmth,
    dryGain,
    wetGain,
    reverb,
    output,
  )

  return { input, output, nodes }
}

export function getPluckDurationSec(): number {
  return PLUCK_DURATION_SEC
}

export function clearGuitarAudioCache(): void {
  bufferCache.clear()
  roomImpulse = null
}
