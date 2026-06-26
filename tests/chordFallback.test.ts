import { ChordNoteTracker } from '../src/features/tuner/core/ChordNoteTracker'
import { detectChordNote } from '../src/lib/audio/detectChordNote'

const SAMPLE_RATE = 48_000
const FFT_SIZE = 4096
const BIN_COUNT = FFT_SIZE / 2

function assert(value: unknown, message: string): asserts value {
  if (!value) {
    throw new Error(message)
  }
}

function setPeak(
  spectrum: Float32Array,
  frequency: number,
  levelDb: number,
): void {
  const exactBin = (frequency * FFT_SIZE) / SAMPLE_RATE
  const center = Math.round(exactBin)

  for (let offset = -1; offset <= 1; offset++) {
    const index = center + offset
    if (index >= 0 && index < spectrum.length) {
      spectrum[index] = Math.max(spectrum[index], levelDb - Math.abs(offset) * 2)
    }
  }
}

function addNote(
  spectrum: Float32Array,
  fundamental: number,
  levelDb: number,
): void {
  const harmonicDrops = [0, 7, 12, 17, 22]

  for (let harmonic = 1; harmonic <= harmonicDrops.length; harmonic++) {
    setPeak(
      spectrum,
      fundamental * harmonic,
      levelDb - harmonicDrops[harmonic - 1],
    )
  }
}

function spectrumForNotes(
  notes: ReadonlyArray<{ frequency: number; levelDb: number }>,
): Float32Array {
  const spectrum = new Float32Array(BIN_COUNT)
  spectrum.fill(-120)

  for (const note of notes) {
    addNote(spectrum, note.frequency, note.levelDb)
  }

  return spectrum
}

function runChordFallbackTests(): void {
  const singleA = detectChordNote(
    spectrumForNotes([{ frequency: 110, levelDb: -20 }]),
    SAMPLE_RATE,
    FFT_SIZE,
  )
  assert(!singleA.isChordLike, 'A single A note was incorrectly classified as a chord')

  const cMajor = detectChordNote(
    spectrumForNotes([
      { frequency: 130.81, levelDb: -22 },
      { frequency: 164.81, levelDb: -18 },
      { frequency: 196, levelDb: -20 },
    ]),
    SAMPLE_RATE,
    FFT_SIZE,
  )
  assert(cMajor.isChordLike, 'C major was not recognized as chord-like')
  assert(
    cMajor.targetString === 'E' || cMajor.targetString === 'G',
    `C major chose unexpected tuner target ${cMajor.targetString ?? 'none'}`,
  )

  const gMajor = detectChordNote(
    spectrumForNotes([
      { frequency: 98, levelDb: -17 },
      { frequency: 123.47, levelDb: -21 },
      { frequency: 146.83, levelDb: -20 },
    ]),
    SAMPLE_RATE,
    FFT_SIZE,
  )
  assert(gMajor.isChordLike, 'G major was not recognized as chord-like')
  assert(
    gMajor.targetString === 'G' ||
      gMajor.targetString === 'B' ||
      gMajor.targetString === 'D',
    `G major chose a note outside the chord: ${gMajor.targetString ?? 'none'}`,
  )

  const tracker = new ChordNoteTracker()
  let snapshot = tracker.process('E', true)
  assert(!snapshot.active, 'Chord fallback activated after only one scan')

  snapshot = tracker.process('E', true)
  assert(snapshot.active, 'Chord fallback did not activate after confirmation')
  assert(snapshot.targetString === 'E', 'Chord fallback did not retain E target')

  snapshot = tracker.process('G', true)
  assert(snapshot.targetString === 'E', 'Chord target changed after one conflicting scan')
  snapshot = tracker.process('G', true)
  assert(snapshot.targetString === 'G', 'Chord target did not switch after confirmation')

  snapshot = tracker.process(null, false)
  assert(snapshot.active, 'Chord fallback exited after one clean scan')
  snapshot = tracker.process(null, false)
  assert(snapshot.active, 'Chord fallback exited after two clean scans')
  snapshot = tracker.process(null, false)
  assert(!snapshot.active, 'Chord fallback did not exit after three clean scans')

  console.log('✓ chord fallback ignores isolated notes')
  console.log(`✓ C major fallback target: ${cMajor.targetString}`)
  console.log(`✓ G major fallback target: ${gMajor.targetString}`)
  console.log('✓ chord fallback confirmation and release behavior')
}

runChordFallbackTests()
