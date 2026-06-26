import { centsDifference } from '../../lib/music/frequency'
import type { GuitarStringLabel } from './utils/noteUtils'

export interface TuningStringTarget {
  /** Stable physical-string identifier, ordered low to high. */
  label: GuitarStringLabel
  /** Scientific pitch notation, for example D2 or B♭3 as Bb3. */
  note: string
  frequency: number
}

export interface TuningPreset {
  id: string
  name: string
  description: string
  strings: readonly TuningStringTarget[]
  isCustom?: boolean
}

export interface ResolvedTuningPitch {
  label: GuitarStringLabel
  note: string
  targetFrequency: number
  fundamentalHz: number
  centsOff: number
}

const PHYSICAL_STRING_LABELS: readonly GuitarStringLabel[] = [
  'E',
  'A',
  'D',
  'G',
  'B',
  'e',
]

const NOTE_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
}

const SELECTED_TUNING_STORAGE_KEY = 'guitar-app:selected-tuning:v1'
const CUSTOM_TUNING_STORAGE_KEY = 'guitar-app:custom-tuning:v1'

function roundFrequency(frequency: number): number {
  return Math.round(frequency * 100) / 100
}

export function noteToFrequency(note: string): number {
  const match = /^([A-G])([b#]?)(-?\d+)$/.exec(note)
  if (match === null) {
    throw new Error(`Invalid note: ${note}`)
  }

  const [, letter, accidental, octaveText] = match
  let semitone = NOTE_SEMITONES[letter]
  if (accidental === 'b') semitone -= 1
  if (accidental === '#') semitone += 1

  const octave = Number(octaveText)
  const midi = (octave + 1) * 12 + semitone
  return roundFrequency(440 * 2 ** ((midi - 69) / 12))
}

function createTuningStrings(
  notes: readonly string[],
): readonly TuningStringTarget[] {
  if (notes.length !== PHYSICAL_STRING_LABELS.length) {
    throw new Error('A guitar tuning must contain exactly six notes.')
  }

  return PHYSICAL_STRING_LABELS.map((label, index) => {
    const note = notes[index]
    return {
      label,
      note,
      frequency: noteToFrequency(note),
    }
  })
}

function createPreset(
  id: string,
  name: string,
  description: string,
  notes: readonly string[],
): TuningPreset {
  return {
    id,
    name,
    description,
    strings: createTuningStrings(notes),
  }
}

export const BUILT_IN_TUNINGS: readonly TuningPreset[] = [
  createPreset(
    'standard',
    'Standard',
    'E A D G B E',
    ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  ),
  createPreset(
    'drop-d',
    'Drop D',
    'D A D G B E',
    ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  ),
  createPreset(
    'half-step-down',
    'Half Step Down',
    'E♭ A♭ D♭ G♭ B♭ E♭',
    ['Eb2', 'Ab2', 'Db3', 'Gb3', 'Bb3', 'Eb4'],
  ),
  createPreset(
    'dadgad',
    'DADGAD',
    'D A D G A D',
    ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'],
  ),
  createPreset(
    'open-g',
    'Open G',
    'D G D G B D',
    ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'],
  ),
]

export const STANDARD_TUNING = BUILT_IN_TUNINGS[0]
export const ALTERNATE_TUNINGS = BUILT_IN_TUNINGS.slice(1)

const CUSTOM_NOTE_NAMES = [
  'C',
  'Db',
  'D',
  'Eb',
  'E',
  'F',
  'Gb',
  'G',
  'Ab',
  'A',
  'Bb',
  'B',
] as const

export const CUSTOM_NOTE_OPTIONS: readonly string[] = Array.from(
  { length: 5 },
  (_, octaveIndex) => octaveIndex + 1,
).flatMap((octave) => CUSTOM_NOTE_NAMES.map((name) => `${name}${octave}`))

export function formatTuningNote(note: string): string {
  return note.replace(/\d+$/, '').replace('b', '♭').replace('#', '♯')
}

export function formatTuningSummary(
  strings: readonly TuningStringTarget[],
): string {
  return strings.map((string) => formatTuningNote(string.note)).join(' ')
}

export function getTuningStringByLabel(
  label: GuitarStringLabel,
  strings: readonly TuningStringTarget[],
): TuningStringTarget {
  return strings.find((string) => string.label === label) ?? strings[0]
}

export function resolveTuningPitch(
  frequency: number,
  strings: readonly TuningStringTarget[],
  preferredLabel?: GuitarStringLabel | null,
): ResolvedTuningPitch {
  const preferred =
    preferredLabel === undefined || preferredLabel === null
      ? null
      : getTuningStringByLabel(preferredLabel, strings)

  let matchedString = preferred ?? strings[0]
  let bestCents = centsDifference(frequency, matchedString.frequency)
  let bestDistance = Math.abs(bestCents)

  if (preferred === null) {
    for (let index = 1; index < strings.length; index++) {
      const candidate = strings[index]
      const centsOff = centsDifference(frequency, candidate.frequency)
      const distance = Math.abs(centsOff)

      if (distance < bestDistance) {
        matchedString = candidate
        bestCents = centsOff
        bestDistance = distance
      }
    }
  }

  return {
    label: matchedString.label,
    note: matchedString.note,
    targetFrequency: matchedString.frequency,
    fundamentalHz: frequency,
    centsOff: bestCents,
  }
}

export function getBuiltInTuning(id: string): TuningPreset | null {
  return BUILT_IN_TUNINGS.find((tuning) => tuning.id === id) ?? null
}

export function createCustomTuning(
  name: string,
  notes: readonly string[],
): TuningPreset {
  const trimmedName = name.trim() || 'Custom'
  return {
    id: 'custom',
    name: trimmedName,
    description: notes.map(formatTuningNote).join(' '),
    strings: createTuningStrings(notes),
    isCustom: true,
  }
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null

  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadStoredCustomTuning(): TuningPreset | null {
  const stored = getStorage()?.getItem(CUSTOM_TUNING_STORAGE_KEY)
  if (stored === null || stored === undefined) return null

  try {
    const parsed = JSON.parse(stored) as { name?: unknown; notes?: unknown }
    if (
      typeof parsed.name !== 'string' ||
      !Array.isArray(parsed.notes) ||
      parsed.notes.length !== 6 ||
      !parsed.notes.every((note) => typeof note === 'string')
    ) {
      return null
    }

    return createCustomTuning(parsed.name, parsed.notes)
  } catch {
    return null
  }
}

export function saveStoredCustomTuning(tuning: TuningPreset): void {
  getStorage()?.setItem(
    CUSTOM_TUNING_STORAGE_KEY,
    JSON.stringify({
      name: tuning.name,
      notes: tuning.strings.map((string) => string.note),
    }),
  )
}

export function loadStoredTuningId(): string {
  return getStorage()?.getItem(SELECTED_TUNING_STORAGE_KEY) ?? 'standard'
}

export function saveStoredTuningId(id: string): void {
  getStorage()?.setItem(SELECTED_TUNING_STORAGE_KEY, id)
}

export function resolveStoredTuning(
  id: string,
  customTuning: TuningPreset | null,
): TuningPreset {
  if (id === 'custom' && customTuning !== null) {
    return customTuning
  }

  return getBuiltInTuning(id) ?? STANDARD_TUNING
}
