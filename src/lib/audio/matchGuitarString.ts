import {
  GUITAR_OPEN_STRINGS,
  HIGH_E_MIN_HZ,
  LOW_E_MAX_HZ,
  STRING_DETECT_BANDS,
  type GuitarOpenStringLabel,
} from '../music/guitarStrings'
import { centsDifference } from '../music/frequency'

const MAX_HARMONIC = 4
const MIN_MATCH_HZ = 60
const MAX_MATCH_HZ = 700

export interface GuitarStringMatch {
  label: GuitarOpenStringLabel
  targetFrequency: number
  /** Folded fundamental used for tuning (≤ raw detected Hz). */
  fundamentalHz: number
  centsOff: number
  harmonicDivisor: number
}

function isInBand(frequency: number, label: GuitarOpenStringLabel): boolean {
  const band = STRING_DETECT_BANDS[label]
  return frequency >= band.min && frequency <= band.max
}

function passesLowHighESplit(
  impliedFundamental: number,
  label: GuitarOpenStringLabel,
): boolean {
  if (label === 'e' && impliedFundamental < HIGH_E_MIN_HZ) {
    return false
  }
  if (label === 'E' && impliedFundamental > LOW_E_MAX_HZ) {
    return false
  }
  return true
}

/**
 * Match mic Hz to the nearest open string.
 * Tries both "detected Hz is a harmonic of the string" (÷1..4) and
 * "detected Hz is near n× the string fundamental" (×1..4).
 */
export function matchGuitarString(
  frequency: number,
): GuitarStringMatch | null {
  let bestMatch: GuitarStringMatch | null = null
  let bestScore = Infinity

  for (const guitarString of GUITAR_OPEN_STRINGS) {
    for (let harmonic = 1; harmonic <= MAX_HARMONIC; harmonic++) {
      // Case A: mic picked up the fundamental (or a lower harmonic fold).
      const impliedFromDivisor = frequency / harmonic
      if (
        impliedFromDivisor >= MIN_MATCH_HZ &&
        impliedFromDivisor <= MAX_MATCH_HZ &&
        passesLowHighESplit(impliedFromDivisor, guitarString.label)
      ) {
        const centsOff = centsDifference(
          impliedFromDivisor,
          guitarString.frequency,
        )
        const score = scoreMatch(
          Math.abs(centsOff),
          impliedFromDivisor,
          guitarString.label,
          harmonic,
        )
        if (score < bestScore) {
          bestScore = score
          bestMatch = {
            label: guitarString.label,
            targetFrequency: guitarString.frequency,
            fundamentalHz: impliedFromDivisor,
            centsOff,
            harmonicDivisor: harmonic,
          }
        }
      }

      // Case B: mic picked up an upper harmonic of this string's fundamental.
      const harmonicHz = guitarString.frequency * harmonic
      const centsToHarmonic = centsDifference(frequency, harmonicHz)
      const impliedFromHarmonic = frequency / harmonic
      if (
        impliedFromHarmonic >= MIN_MATCH_HZ &&
        impliedFromHarmonic <= MAX_MATCH_HZ &&
        passesLowHighESplit(impliedFromHarmonic, guitarString.label)
      ) {
        const centsOff = centsDifference(
          impliedFromHarmonic,
          guitarString.frequency,
        )
        const score = scoreMatch(
          Math.abs(centsToHarmonic),
          impliedFromHarmonic,
          guitarString.label,
          harmonic,
        )
        if (score < bestScore) {
          bestScore = score
          bestMatch = {
            label: guitarString.label,
            targetFrequency: guitarString.frequency,
            fundamentalHz: impliedFromHarmonic,
            centsOff,
            harmonicDivisor: harmonic,
          }
        }
      }
    }
  }

  return bestMatch
}

function scoreMatch(
  absCents: number,
  impliedFundamental: number,
  label: GuitarOpenStringLabel,
  harmonic: number,
): number {
  const inBand = isInBand(impliedFundamental, label) ? 0 : 180
  const lowStringBonus =
    (GUITAR_OPEN_STRINGS.findIndex((s) => s.label === label) ?? 0) * -12
  const harmonicPenalty = harmonic > 1 ? (harmonic - 1) * 8 : 0

  return absCents + inBand + lowStringBonus + harmonicPenalty
}
