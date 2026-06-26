import type { GuitarOpenStringLabel } from '../music/guitarStrings'

export type ChromaticNoteName =
  | 'C'
  | 'C♯'
  | 'D'
  | 'D♯'
  | 'E'
  | 'F'
  | 'F♯'
  | 'G'
  | 'G♯'
  | 'A'
  | 'A♯'
  | 'B'

export interface ChordNoteResult {
  note: ChromaticNoteName | null
  frequency: number | null
  targetString: GuitarOpenStringLabel | null
  confidence: number
  strongNoteCount: number
  isChordLike: boolean
}

interface CandidateScore {
  midi: number
  note: ChromaticNoteName
  frequency: number
  score: number
  fundamentalPower: number
}

const NOTE_NAMES: readonly ChromaticNoteName[] = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
]

const TUNER_TARGETS: ReadonlyArray<{
  label: Exclude<GuitarOpenStringLabel, 'e'>
  pitchClass: number
}> = [
  { label: 'E', pitchClass: 4 },
  { label: 'A', pitchClass: 9 },
  { label: 'D', pitchClass: 2 },
  { label: 'G', pitchClass: 7 },
  { label: 'B', pitchClass: 11 },
]

const MIN_MIDI = 40
const MAX_MIDI = 83
const MAX_ANALYSIS_HZ = 1200
const HIGH_E_SPLIT_HZ = Math.sqrt(82.41 * 329.63)
const HARMONIC_WEIGHTS = [1, 0.55, 0.32, 0.2, 0.12] as const
const SUBHARMONIC_PENALTY = 0.8
const STRONG_NOTE_RATIO = 0.3
const SECOND_NOTE_CHORD_RATIO = 0.48
const MIN_FLOOR_MULTIPLIER = 4
const LOCAL_PEAK_RATIO = 1.15
const SPECTRAL_RADIUS_BINS = 2
const SPECTRAL_SIGMA_BINS = 0.55

function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}

function noteForMidi(midi: number): ChromaticNoteName {
  return NOTE_NAMES[((midi % 12) + 12) % 12]
}

function circularPitchDistance(first: number, second: number): number {
  const direct = Math.abs(first - second)
  return Math.min(direct, 12 - direct)
}

function targetForCandidate(candidate: CandidateScore): GuitarOpenStringLabel {
  if (candidate.note === 'E') {
    return candidate.frequency >= HIGH_E_SPLIT_HZ ? 'e' : 'E'
  }

  if (
    candidate.note === 'A' ||
    candidate.note === 'D' ||
    candidate.note === 'G' ||
    candidate.note === 'B'
  ) {
    return candidate.note
  }

  const pitchClass = ((candidate.midi % 12) + 12) % 12
  let closest = TUNER_TARGETS[0]
  let closestDistance = circularPitchDistance(
    pitchClass,
    closest.pitchClass,
  )

  for (const target of TUNER_TARGETS.slice(1)) {
    const distance = circularPitchDistance(pitchClass, target.pitchClass)
    if (distance < closestDistance) {
      closest = target
      closestDistance = distance
    }
  }

  return closest.label
}

function chooseTargetString(
  strongNotes: CandidateScore[],
  strongest: CandidateScore,
): GuitarOpenStringLabel {
  const exactTargetNotes = strongNotes.filter(
    (candidate) =>
      candidate.note === 'E' ||
      candidate.note === 'A' ||
      candidate.note === 'D' ||
      candidate.note === 'G' ||
      candidate.note === 'B',
  )

  return targetForCandidate(exactTargetNotes[0] ?? strongest)
}

function dbToPower(db: number): number {
  if (!Number.isFinite(db)) {
    return 0
  }
  return 10 ** (db / 10)
}

function bandPower(
  spectrum: Float32Array,
  frequency: number,
  sampleRate: number,
  fftSize: number,
): number {
  if (frequency <= 0 || frequency >= sampleRate / 2) {
    return 0
  }

  const exactBin = (frequency * fftSize) / sampleRate
  const center = Math.floor(exactBin)
  let weightedPower = 0
  let totalWeight = 0

  for (
    let index = center - SPECTRAL_RADIUS_BINS;
    index <= center + SPECTRAL_RADIUS_BINS;
    index++
  ) {
    if (index < 0 || index >= spectrum.length) {
      continue
    }

    const distance = index - exactBin
    const weight = Math.exp(
      -(distance * distance) /
        (2 * SPECTRAL_SIGMA_BINS * SPECTRAL_SIGMA_BINS),
    )
    weightedPower += dbToPower(spectrum[index]) * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedPower / totalWeight : 0
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length === 0) {
    return 0
  }
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function scoreCandidate(
  frequency: number,
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
): { score: number; fundamentalPower: number } {
  const fundamentalPower = bandPower(
    spectrum,
    frequency,
    sampleRate,
    fftSize,
  )

  let harmonicScore = 0
  for (let harmonic = 1; harmonic <= HARMONIC_WEIGHTS.length; harmonic++) {
    const harmonicFrequency = frequency * harmonic
    if (harmonicFrequency > MAX_ANALYSIS_HZ) {
      break
    }
    harmonicScore +=
      bandPower(spectrum, harmonicFrequency, sampleRate, fftSize) *
      HARMONIC_WEIGHTS[harmonic - 1]
  }

  let strongestSubharmonic = 0
  for (let divisor = 2; divisor <= 4; divisor++) {
    const subharmonicFrequency = frequency / divisor
    if (subharmonicFrequency >= midiToFrequency(MIN_MIDI)) {
      strongestSubharmonic = Math.max(
        strongestSubharmonic,
        bandPower(spectrum, subharmonicFrequency, sampleRate, fftSize),
      )
    }
  }

  return {
    fundamentalPower,
    score: Math.max(
      0,
      harmonicScore - strongestSubharmonic * SUBHARMONIC_PENALTY,
    ),
  }
}

function isLocalFundamentalPeak(
  candidates: CandidateScore[],
  index: number,
): boolean {
  const candidate = candidates[index]
  const previousPower = candidates[index - 1]?.fundamentalPower ?? 0
  const nextPower = candidates[index + 1]?.fundamentalPower ?? 0

  return (
    candidate.fundamentalPower >= previousPower * LOCAL_PEAK_RATIO &&
    candidate.fundamentalPower >= nextPower * LOCAL_PEAK_RATIO
  )
}

export function detectChordNote(
  spectrum: Float32Array,
  sampleRate: number,
  fftSize: number,
): ChordNoteResult {
  const candidates: CandidateScore[] = []
  const fundamentalPowers: number[] = []

  for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
    const frequency = midiToFrequency(midi)
    const { score, fundamentalPower } = scoreCandidate(
      frequency,
      spectrum,
      sampleRate,
      fftSize,
    )

    candidates.push({
      midi,
      note: noteForMidi(midi),
      frequency,
      score,
      fundamentalPower,
    })
    fundamentalPowers.push(fundamentalPower)
  }

  const floor = median(fundamentalPowers)
  const strongestByNote = new Map<ChromaticNoteName, CandidateScore>()

  for (let index = 0; index < candidates.length; index++) {
    const candidate = candidates[index]
    if (!isLocalFundamentalPeak(candidates, index)) {
      continue
    }

    const current = strongestByNote.get(candidate.note)
    if (current === undefined || candidate.score > current.score) {
      strongestByNote.set(candidate.note, candidate)
    }
  }

  const ranked = [...strongestByNote.values()].sort((a, b) => {
    const scoreDifference = b.score - a.score
    if (Math.abs(scoreDifference) > Math.max(a.score, b.score) * 0.08) {
      return scoreDifference
    }
    return a.frequency - b.frequency
  })

  const strongest = ranked[0]
  if (strongest === undefined || strongest.score <= 0) {
    return {
      note: null,
      frequency: null,
      targetString: null,
      confidence: 0,
      strongNoteCount: 0,
      isChordLike: false,
    }
  }

  const minimumStrongScore = Math.max(
    strongest.score * STRONG_NOTE_RATIO,
    floor * MIN_FLOOR_MULTIPLIER,
  )
  const strongNotes = ranked.filter(
    (candidate) =>
      candidate.score >= minimumStrongScore &&
      candidate.fundamentalPower >= floor * 2,
  )
  const second = strongNotes[1]
  const secondRatio =
    second === undefined || strongest.score === 0
      ? 0
      : second.score / strongest.score
  const isChordLike =
    strongNotes.length >= 3 ||
    (strongNotes.length >= 2 && secondRatio >= SECOND_NOTE_CHORD_RATIO)

  return {
    note: strongest.note,
    frequency: strongest.frequency,
    targetString: chooseTargetString(strongNotes, strongest),
    confidence: Math.min(1, strongest.score / Math.max(floor * 12, 1e-12)),
    strongNoteCount: strongNotes.length,
    isChordLike,
  }
}
