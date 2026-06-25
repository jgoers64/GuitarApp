import { AUDIO_CONFIG } from './config'

export interface PitchResult {
  frequency: number | null
  confidence: number
}

export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
): PitchResult {
  const size = buffer.length
  let rms = 0

  for (let i = 0; i < size; i++) {
    rms += buffer[i] * buffer[i]
  }
  rms = Math.sqrt(rms / size)

  let start = 0
  let end = size - 1
  const trimThreshold = Math.max(0.002, rms * 0.25)

  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(buffer[i]) < trimThreshold) {
      start = i
      break
    }
  }

  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(buffer[size - i]) < trimThreshold) {
      end = size - i
      break
    }
  }

  const trimmed = buffer.subarray(start, end)
  const trimmedSize = trimmed.length
  const correlations = new Float32Array(trimmedSize)

  for (let lag = 0; lag < trimmedSize; lag++) {
    let sum = 0
    for (let i = 0; i < trimmedSize - lag; i++) {
      sum += trimmed[i] * trimmed[i + lag]
    }
    correlations[lag] = sum
  }

  const minLag = Math.max(
    2,
    Math.floor(sampleRate / AUDIO_CONFIG.MAX_FREQUENCY_HZ),
  )
  const maxLag = Math.min(
    trimmedSize - 1,
    Math.ceil(sampleRate / AUDIO_CONFIG.MIN_FREQUENCY_HZ),
  )

  if (minLag >= maxLag) {
    return { frequency: null, confidence: 0 }
  }

  let globalMaxLag = minLag
  let globalMaxValue = correlations[minLag] ?? 0

  for (let lag = minLag; lag <= maxLag; lag++) {
    const value = correlations[lag] ?? 0
    if (value > globalMaxValue) {
      globalMaxValue = value
      globalMaxLag = lag
    }
  }

  if (globalMaxValue <= 0) {
    return { frequency: null, confidence: 0 }
  }

  // Prefer the lowest frequency (longest period) with a strong correlation.
  let chosenLag = globalMaxLag
  for (let lag = minLag; lag <= maxLag; lag++) {
    if ((correlations[lag] ?? 0) >= globalMaxValue * 0.82) {
      chosenLag = lag
    }
  }

  let refinedLag = chosenLag
  const peakIndex = Math.round(chosenLag)
  if (peakIndex > 0 && peakIndex < trimmedSize - 1) {
    const prev = correlations[peakIndex - 1]
    const current = correlations[peakIndex]
    const next = correlations[peakIndex + 1]
    const shift = (next - prev) / (2 * (2 * current - next - prev))
    if (Number.isFinite(shift)) {
      refinedLag = chosenLag + shift
    }
  }

  const frequency = sampleRate / refinedLag

  if (
    frequency < AUDIO_CONFIG.MIN_FREQUENCY_HZ ||
    frequency > AUDIO_CONFIG.MAX_FREQUENCY_HZ
  ) {
    return { frequency: null, confidence: 0 }
  }

  const confidence = Math.min(1, globalMaxValue / (correlations[0] || 1))

  return { frequency, confidence }
}
