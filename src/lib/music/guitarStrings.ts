/** Shared open-string targets for tuning (12-TET, A4 = 440 Hz). */
export const GUITAR_OPEN_STRINGS = [
  { label: 'E', note: 'E2', frequency: 82.41 },
  { label: 'A', note: 'A2', frequency: 110.0 },
  { label: 'D', note: 'D3', frequency: 146.83 },
  { label: 'G', note: 'G3', frequency: 196.0 },
  { label: 'B', note: 'B3', frequency: 246.94 },
  { label: 'e', note: 'E4', frequency: 329.63 },
] as const

export type GuitarOpenStringLabel =
  (typeof GUITAR_OPEN_STRINGS)[number]['label']

export const GUITAR_OPEN_FREQUENCIES = GUITAR_OPEN_STRINGS.map(
  (string) => string.frequency,
)

/** Expected mic Hz range per string (fundamental + typical harmonics). */
export const STRING_DETECT_BANDS: Record<
  GuitarOpenStringLabel,
  { min: number; max: number }
> = {
  E: { min: 68, max: 175 },
  A: { min: 93, max: 230 },
  D: { min: 125, max: 300 },
  G: { min: 168, max: 400 },
  B: { min: 215, max: 500 },
  e: { min: 280, max: 700 },
}

/** Low E and high e must never share a band — gap prevents octave confusion. */
export const LOW_E_MAX_HZ = 240
export const HIGH_E_MIN_HZ = 270
