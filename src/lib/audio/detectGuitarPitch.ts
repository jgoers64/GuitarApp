import type { GuitarOpenStringLabel } from '../music/guitarStrings'
import { centsDifference } from '../music/frequency'
import { AUDIO_CONFIG } from './config'
import { detectPitch } from './autocorrelate'
import { matchGuitarString } from './matchGuitarString'
import { detectYinPitch } from './yin'

export interface GuitarPitchResult {
  frequency: number | null
  confidence: number
  stringLabel: GuitarOpenStringLabel | null
}

const AGREEMENT_CENTS = 35

function inRange(frequency: number): boolean {
  return (
    Number.isFinite(frequency) &&
    frequency >= AUDIO_CONFIG.MIN_FREQUENCY_HZ &&
    frequency <= AUDIO_CONFIG.MAX_FREQUENCY_HZ
  )
}

export function detectGuitarPitch(
  buffer: Float32Array,
  sampleRate: number,
): GuitarPitchResult {
  const yinHz = detectYinPitch(buffer, sampleRate)
  const autocorrelation = detectPitch(buffer, sampleRate)

  const validYin = yinHz !== null && inRange(yinHz) ? yinHz : null
  const validAutocorrelation =
    autocorrelation.frequency !== null && inRange(autocorrelation.frequency)
      ? autocorrelation.frequency
      : null

  let frequency: number | null = validYin
  let confidence = validYin !== null ? 0.75 : 0

  if (validYin !== null && validAutocorrelation !== null) {
    const difference = Math.abs(
      centsDifference(validYin, validAutocorrelation),
    )

    if (difference <= AGREEMENT_CENTS) {
      frequency = Math.sqrt(validYin * validAutocorrelation)
      confidence = Math.max(0.85, autocorrelation.confidence)
    }
  } else if (
    validAutocorrelation !== null &&
    autocorrelation.confidence >= AUDIO_CONFIG.MIN_PITCH_CONFIDENCE
  ) {
    frequency = validAutocorrelation
    confidence = autocorrelation.confidence
  }

  if (frequency === null) {
    return { frequency: null, confidence: 0, stringLabel: null }
  }

  const match = matchGuitarString(frequency)
  if (match === null) {
    return { frequency: null, confidence: 0, stringLabel: null }
  }

  return {
    frequency,
    confidence,
    stringLabel: match.label,
  }
}
