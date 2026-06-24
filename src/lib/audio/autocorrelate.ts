export interface PitchResult {
  frequency: number | null
  confidence: number
}

const MIN_FREQUENCY = 70
const MAX_FREQUENCY = 500
const MIN_RMS = 0.0008

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

  if (rms < MIN_RMS) {
    return { frequency: null, confidence: 0 }
  }

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

  let dip = 0
  while (dip + 1 < trimmedSize && correlations[dip] > correlations[dip + 1]) {
    dip++
  }

  let peakLag = dip
  let peakValue = correlations[dip]

  for (let lag = dip; lag < trimmedSize; lag++) {
    if (correlations[lag] > peakValue) {
      peakValue = correlations[lag]
      peakLag = lag
    }
  }

  if (peakLag === 0) {
    return { frequency: null, confidence: 0 }
  }

  let refinedLag = peakLag
  if (peakLag > 0 && peakLag < trimmedSize - 1) {
    const prev = correlations[peakLag - 1]
    const current = correlations[peakLag]
    const next = correlations[peakLag + 1]
    const shift = (next - prev) / (2 * (2 * current - next - prev))
    if (Number.isFinite(shift)) {
      refinedLag = peakLag + shift
    }
  }

  const frequency = sampleRate / refinedLag

  if (frequency < MIN_FREQUENCY || frequency > MAX_FREQUENCY) {
    return { frequency: null, confidence: 0 }
  }

  const confidence = Math.min(1, peakValue / correlations[0])

  return { frequency, confidence }
}
