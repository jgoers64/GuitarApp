import type { GuitarOpenStringLabel } from '../music/guitarStrings'
import { GUITAR_OPEN_STRINGS } from '../music/guitarStrings'
import { AUDIO_CONFIG } from './config'
import { matchGuitarString } from './matchGuitarString'
import { detectYinPitch } from './yin'

export interface GuitarPitchResult {
  frequency: number | null
  confidence: number
  stringLabel: GuitarOpenStringLabel | null
}

function readCorrelation(correlations: Float32Array, lag: number): number {
  const index = Math.round(lag)
  if (index <= 0 || index >= correlations.length) {
    return 0
  }
  return correlations[index] ?? 0
}

function buildAutocorrelation(buffer: Float32Array): Float32Array {
  const size = buffer.length
  const correlations = new Float32Array(size)

  for (let lag = 0; lag < size; lag++) {
    let sum = 0
    for (let i = 0; i < size - lag; i++) {
      sum += buffer[i] * buffer[i + lag]
    }
    correlations[lag] = sum
  }

  const norm = correlations[0] ?? 1
  if (norm > 0) {
    for (let lag = 0; lag < size; lag++) {
      correlations[lag] = (correlations[lag] ?? 0) / norm
    }
  }

  return correlations
}

function refineLagAtPeak(
  correlations: Float32Array,
  centerLag: number,
  size: number,
): number {
  const peakIndex = Math.round(centerLag)
  if (peakIndex <= 0 || peakIndex >= size - 1) {
    return centerLag
  }

  const prev = correlations[peakIndex - 1]
  const current = correlations[peakIndex]
  const next = correlations[peakIndex + 1]
  const shift = (next - prev) / (2 * (2 * current - next - prev))

  return Number.isFinite(shift) ? centerLag + shift : centerLag
}

function findPeakLagNearTarget(
  correlations: Float32Array,
  sampleRate: number,
  targetHz: number,
  size: number,
): number {
  const expectedLag = sampleRate / targetHz
  const searchMin = Math.max(2, Math.floor(expectedLag * 0.88))
  const searchMax = Math.min(size - 1, Math.ceil(expectedLag * 1.12))

  let peakLag = expectedLag
  let peakValue = 0

  for (let lag = searchMin; lag <= searchMax; lag++) {
    const value = correlations[lag] ?? 0
    if (value > peakValue) {
      peakValue = value
      peakLag = lag
    }
  }

  return refineLagAtPeak(correlations, peakLag, size)
}

/** Comb-filter score: strong fundamental + 2nd + 3rd harmonics = real note. */
function combScoreAtFundamental(
  correlations: Float32Array,
  lag: number,
): number {
  const fund = readCorrelation(correlations, lag)
  if (fund <= 0) {
    return 0
  }

  const h2 = readCorrelation(correlations, lag / 2)
  const h3 = readCorrelation(correlations, lag / 3)

  return fund * (0.55 + 0.3 * h2 + 0.15 * h3)
}

function detectFromCombFilter(
  buffer: Float32Array,
  sampleRate: number,
): { frequency: number; label: GuitarOpenStringLabel } | null {
  const correlations = buildAutocorrelation(buffer)
  const size = correlations.length

  if ((correlations[0] ?? 0) <= 0) {
    return null
  }

  let bestLabel: GuitarOpenStringLabel = GUITAR_OPEN_STRINGS[0].label
  let bestScore = -1
  let bestLag = sampleRate / GUITAR_OPEN_STRINGS[0].frequency

  for (let index = 0; index < GUITAR_OPEN_STRINGS.length; index++) {
    const guitarString = GUITAR_OPEN_STRINGS[index]
    const lag = findPeakLagNearTarget(
      correlations,
      sampleRate,
      guitarString.frequency,
      size,
    )
    const score =
      combScoreAtFundamental(correlations, lag) *
      (1 + (GUITAR_OPEN_STRINGS.length - 1 - index) * 0.35)

    if (score > bestScore) {
      bestScore = score
      bestLabel = guitarString.label
      bestLag = lag
    }
  }

  if (bestScore <= 0.05) {
    return null
  }

  return {
    frequency: sampleRate / bestLag,
    label: bestLabel,
  }
}

/**
 * Guitar pitch: comb-filter per open string + YIN, with harmonic-aware string match.
 */
export function detectGuitarPitch(
  buffer: Float32Array,
  sampleRate: number,
): GuitarPitchResult {
  const comb = detectFromCombFilter(buffer, sampleRate)
  const yinHz = detectYinPitch(buffer, sampleRate)

  const combMatch = comb !== null ? matchGuitarString(comb.frequency) : null
  const yinMatch = yinHz !== null ? matchGuitarString(yinHz) : null

  let chosenLabel: GuitarOpenStringLabel | null = null
  let chosenHz: number | null = null

  if (comb !== null && combMatch !== null) {
    chosenLabel = comb.label
    chosenHz = combMatch.fundamentalHz
  }

  if (yinMatch !== null) {
    if (chosenLabel === null) {
      chosenLabel = yinMatch.label
      chosenHz = yinMatch.fundamentalHz
    } else if (yinMatch.label === comb?.label) {
      chosenHz = yinMatch.fundamentalHz
    } else {
      const combIndex = GUITAR_OPEN_STRINGS.findIndex(
        (s) => s.label === chosenLabel,
      )
      const yinIndex = GUITAR_OPEN_STRINGS.findIndex(
        (s) => s.label === yinMatch.label,
      )
      if (yinIndex < combIndex) {
        chosenLabel = yinMatch.label
        chosenHz = yinMatch.fundamentalHz
      }
    }
  }

  if (chosenLabel === null || chosenHz === null) {
    return { frequency: null, confidence: 0, stringLabel: null }
  }

  if (
    chosenHz < AUDIO_CONFIG.MIN_FREQUENCY_HZ ||
    chosenHz > AUDIO_CONFIG.MAX_FREQUENCY_HZ
  ) {
    return { frequency: null, confidence: 0, stringLabel: null }
  }

  const match = matchGuitarString(chosenHz)

  return {
    frequency: match?.fundamentalHz ?? chosenHz,
    confidence: 0.7,
    stringLabel: match?.label ?? chosenLabel,
  }
}
