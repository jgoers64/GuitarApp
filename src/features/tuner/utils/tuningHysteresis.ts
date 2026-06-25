import { IN_TUNE_CENTS, type GuitarStringLabel } from './noteUtils'

export const IN_TUNE_EXIT_CENTS = 20

export interface InTuneHysteresisResult {
  latchedString: GuitarStringLabel | null
  isInTune: boolean
}

export function updateInTuneHysteresis(
  latchedString: GuitarStringLabel | null,
  targetString: GuitarStringLabel | null,
  centsOff: number | null,
  hasValidPitch: boolean,
): InTuneHysteresisResult {
  if (!hasValidPitch || targetString === null || centsOff === null) {
    return { latchedString: null, isInTune: false }
  }

  const threshold =
    latchedString === targetString ? IN_TUNE_EXIT_CENTS : IN_TUNE_CENTS
  const isInTune = Math.abs(centsOff) <= threshold

  return {
    latchedString: isInTune ? targetString : null,
    isInTune,
  }
}
