import { AUDIO_CONFIG } from './config'

/** YIN pitch estimator — better than raw autocorrelation for low fundamentals. */
export function detectYinPitch(
  buffer: Float32Array,
  sampleRate: number,
): number | null {
  const threshold = 0.12
  const minHz = AUDIO_CONFIG.MIN_FREQUENCY_HZ
  const maxHz = 420
  const halfSize = Math.floor(buffer.length / 2)

  if (halfSize < 4) {
    return null
  }

  const yinBuffer = new Float32Array(halfSize)

  for (let tau = 0; tau < halfSize; tau++) {
    let sum = 0
    for (let i = 0; i < halfSize; i++) {
      const delta = buffer[i] - buffer[i + tau]
      sum += delta * delta
    }
    yinBuffer[tau] = sum
  }

  yinBuffer[0] = 1
  let runningSum = 0
  for (let tau = 1; tau < halfSize; tau++) {
    runningSum += yinBuffer[tau] ?? 0
    yinBuffer[tau] =
      runningSum === 0 ? 1 : (yinBuffer[tau] ?? 0) * tau / runningSum
  }

  const minTau = Math.max(2, Math.floor(sampleRate / maxHz))
  const maxTau = Math.min(halfSize - 2, Math.ceil(sampleRate / minHz))

  if (minTau >= maxTau) {
    return null
  }

  let bestTau = -1

  for (let tau = minTau; tau < maxTau; tau++) {
    if ((yinBuffer[tau] ?? 1) < threshold) {
      while (
        tau + 1 < maxTau &&
        (yinBuffer[tau + 1] ?? 1) < (yinBuffer[tau] ?? 1)
      ) {
        tau++
      }
      bestTau = tau
      break
    }
  }

  if (bestTau === -1) {
    let minVal = Infinity
    for (let tau = minTau; tau < maxTau; tau++) {
      const value = yinBuffer[tau] ?? 1
      if (value < minVal) {
        minVal = value
        bestTau = tau
      }
    }
    if (bestTau === -1 || minVal >= 0.45) {
      return null
    }
  }

  const prev = yinBuffer[bestTau - 1] ?? 0
  const current = yinBuffer[bestTau] ?? 0
  const next = yinBuffer[bestTau + 1] ?? 0
  const shift = (next - prev) / (2 * (2 * current - next - prev))
  const refinedTau = Number.isFinite(shift) ? bestTau + shift : bestTau
  const frequency = sampleRate / refinedTau

  if (
    frequency < AUDIO_CONFIG.MIN_FREQUENCY_HZ ||
    frequency > AUDIO_CONFIG.MAX_FREQUENCY_HZ
  ) {
    return null
  }

  return frequency
}
