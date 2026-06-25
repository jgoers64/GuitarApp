import { matchGuitarString } from '../../../lib/audio/matchGuitarString'
import { GUITAR_OPEN_STRINGS } from '../../../lib/music/guitarStrings'
import { centsDifference } from '../../../lib/music/frequency'
import type { TunerDetectionStatus } from '../hooks/usePitchDetection'

export const GUITAR_STRINGS = GUITAR_OPEN_STRINGS

export type GuitarStringLabel = (typeof GUITAR_STRINGS)[number]['label']

export const MIN_GUITAR_DETECT_HZ = 45
export const MAX_GUITAR_DETECT_HZ = 700

/** Actual cents within this range count as "In tune". */
export const IN_TUNE_CENTS = 10
export const CENTS_DISPLAY_SCALE = 10
/** Displayed midpoint between adjacent strings is at most about ±25. */
export const CENTS_METER_RANGE = 25

export function isValidGuitarFrequency(frequency: number): boolean {
  return frequency >= MIN_GUITAR_DETECT_HZ && frequency <= MAX_GUITAR_DETECT_HZ
}

export function getStringByLabel(
  label: GuitarStringLabel,
): (typeof GUITAR_STRINGS)[number] {
  return GUITAR_STRINGS.find((s) => s.label === label) ?? GUITAR_STRINGS[0]
}

export interface ResolvedGuitarPitch {
  label: GuitarStringLabel
  note: (typeof GUITAR_STRINGS)[number]['note']
  targetFrequency: number
  fundamentalHz: number
  centsOff: number
}

function closestStringByCents(
  frequency: number,
): (typeof GUITAR_STRINGS)[number] {
  const match = matchGuitarString(frequency)
  if (match !== null) {
    return getStringByLabel(match.label)
  }

  let matchedString: (typeof GUITAR_STRINGS)[number] = GUITAR_STRINGS[0]
  let bestAbsCents = Infinity

  for (const guitarString of GUITAR_STRINGS) {
    const absCents = Math.abs(
      centsDifference(frequency, guitarString.frequency),
    )
    if (absCents < bestAbsCents) {
      bestAbsCents = absCents
      matchedString = guitarString
    }
  }

  return matchedString
}

/** Map detected fundamental Hz to one of the six open-string targets. */
export function resolveGuitarPitch(
  frequency: number,
  preferredLabel?: GuitarStringLabel | null,
): ResolvedGuitarPitch {
  if (preferredLabel !== undefined && preferredLabel !== null) {
    const matchedString = getStringByLabel(preferredLabel)
    const tuning = getTuningForString(frequency, matchedString.frequency)

    return {
      label: matchedString.label,
      note: matchedString.note,
      targetFrequency: matchedString.frequency,
      fundamentalHz: frequency,
      centsOff: tuning.centsOff,
    }
  }

  const match = matchGuitarString(frequency)
  if (match !== null) {
    const matchedString = getStringByLabel(match.label)
    return {
      label: matchedString.label,
      note: matchedString.note,
      targetFrequency: matchedString.frequency,
      fundamentalHz: match.fundamentalHz,
      centsOff: match.centsOff,
    }
  }

  const matchedString = closestStringByCents(frequency)
  const centsOff = centsDifference(frequency, matchedString.frequency)

  return {
    label: matchedString.label,
    note: matchedString.note,
    targetFrequency: matchedString.frequency,
    fundamentalHz: frequency,
    centsOff,
  }
}

export interface ClosestGuitarStringResult {
  label: GuitarStringLabel
  note: (typeof GUITAR_STRINGS)[number]['note']
  targetFrequency: number
  centsOff: number
}

export function getClosestGuitarString(
  frequency: number,
): ClosestGuitarStringResult {
  const resolved = resolveGuitarPitch(frequency)
  return {
    label: resolved.label,
    note: resolved.note,
    targetFrequency: resolved.targetFrequency,
    centsOff: resolved.centsOff,
  }
}

export type TuningForStringStatus = 'Flat' | 'Sharp' | 'In tune'

export interface TuningForStringResult {
  centsOff: number
  status: TuningForStringStatus
}

export function getTuningForString(
  frequency: number,
  targetFrequency: number,
): TuningForStringResult {
  const centsOff = centsDifference(frequency, targetFrequency)

  if (Math.abs(centsOff) <= IN_TUNE_CENTS) {
    return { centsOff, status: 'In tune' }
  }
  if (centsOff < 0) {
    return { centsOff, status: 'Flat' }
  }
  return { centsOff, status: 'Sharp' }
}

export function getCentsOffForString(
  frequency: number,
  label: GuitarStringLabel,
): number {
  return getTuningForString(frequency, getStringByLabel(label).frequency)
    .centsOff
}

export interface NearestStringResult {
  label: GuitarStringLabel
  targetFrequency: number
  centsOff: number
}

/** @deprecated Use resolveGuitarPitch */
export function frequencyToNearestString(
  frequency: number,
): NearestStringResult {
  const match = getClosestGuitarString(frequency)
  return {
    label: match.label,
    targetFrequency: match.targetFrequency,
    centsOff: match.centsOff,
  }
}

export function formatFrequency(hz: number | null): string {
  if (hz === null) return '—'
  return `${hz.toFixed(1)} Hz`
}

export function formatNote(note: string | null): string {
  return note ?? '—'
}

export function formatCents(cents: number | null): string {
  if (cents === null) return '—'
  const sign = cents > 0 ? '+' : ''
  return `${sign}${Math.round(cents)}`
}

export function actualToDisplayCents(actualCents: number): number {
  return Math.round(actualCents / CENTS_DISPLAY_SCALE)
}

export function formatIndicatorCents(displayCents: number): string {
  const rounded = Math.round(displayCents)
  if (rounded === 0) return '0'
  return rounded > 0 ? `+${rounded}` : `${rounded}`
}

export function formatRms(rms: number): string {
  return rms.toFixed(4)
}

const STATUS_LABELS: Record<TunerDetectionStatus, string> = {
  idle: 'Idle',
  listening: '',
  'too-quiet': 'Too quiet',
  unstable: 'Unstable',
  stable: 'Stable',
  holding: 'Holding — waiting for string',
}

export function formatStatus(status: TunerDetectionStatus): string {
  return STATUS_LABELS[status]
}

export type TuneStatus = 'in-tune' | 'flat' | 'sharp' | 'listening' | 'idle'

export function tuningStatusToTuneStatus(
  status: TuningForStringStatus,
): Exclude<TuneStatus, 'listening' | 'idle'> {
  switch (status) {
    case 'In tune':
      return 'in-tune'
    case 'Flat':
      return 'flat'
    case 'Sharp':
      return 'sharp'
  }
}

export function clampCents(cents: number, range = CENTS_METER_RANGE): number {
  return Math.max(-range, Math.min(range, cents))
}

export function getTuneStatus(actualCentsOff: number | null): TuneStatus {
  if (actualCentsOff === null) {
    return 'listening'
  }
  if (Math.abs(actualCentsOff) <= IN_TUNE_CENTS) {
    return 'in-tune'
  }
  return actualCentsOff < 0 ? 'flat' : 'sharp'
}

export function formatTuneStatus(status: TuneStatus): string {
  switch (status) {
    case 'in-tune':
      return 'In tune'
    case 'flat':
      return 'Tune up'
    case 'sharp':
      return 'Tune down'
    case 'listening':
      return ''
    case 'idle':
      return '—'
  }
}

export function centsToMeterPercent(displayCents: number | null): number {
  if (displayCents === null) {
    return 50
  }
  return (
    ((displayCents + CENTS_METER_RANGE) / (CENTS_METER_RANGE * 2)) * 100
  )
}
