import {
  GUITAR_OPEN_STRINGS,
  type GuitarOpenStringLabel,
} from '../music/guitarStrings'
import { centsDifference } from '../music/frequency'

const MIN_MATCH_HZ = 45
const MAX_MATCH_HZ = 700

type GuitarOpenString = (typeof GUITAR_OPEN_STRINGS)[number]

export interface GuitarStringMatch {
  label: GuitarOpenStringLabel
  targetFrequency: number
  /** Detected fundamental used for tuning. */
  fundamentalHz: number
  centsOff: number
  /** Kept for API compatibility. Pitch folding is intentionally disabled. */
  harmonicDivisor: 1
}

/**
 * Match a detected fundamental to the nearest standard-tuning open string.
 *
 * Interior strings change at the midpoint between adjacent open-string
 * frequencies. Low E may continue below the lower midpoint, and high E may
 * continue above the upper midpoint because there is no string beyond them.
 */
export function matchGuitarString(
  frequency: number,
): GuitarStringMatch | null {
  if (
    !Number.isFinite(frequency) ||
    frequency < MIN_MATCH_HZ ||
    frequency > MAX_MATCH_HZ
  ) {
    return null
  }

  let bestString: GuitarOpenString = GUITAR_OPEN_STRINGS[0]
  let bestCents = centsDifference(frequency, bestString.frequency)
  let bestDistance = Math.abs(bestCents)

  for (let index = 1; index < GUITAR_OPEN_STRINGS.length; index++) {
    const guitarString = GUITAR_OPEN_STRINGS[index]
    const centsOff = centsDifference(frequency, guitarString.frequency)
    const distance = Math.abs(centsOff)

    if (distance < bestDistance) {
      bestString = guitarString
      bestCents = centsOff
      bestDistance = distance
    }
  }

  return {
    label: bestString.label,
    targetFrequency: bestString.frequency,
    fundamentalHz: frequency,
    centsOff: bestCents,
    harmonicDivisor: 1,
  }
}
