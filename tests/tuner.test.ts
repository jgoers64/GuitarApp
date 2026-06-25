import './rapidNoteDiagnostic'
import { AUDIO_CONFIG, detectGuitarPitch } from '../src/lib/audio'
import { TunerPitchTracker } from '../src/features/tuner/core/TunerPitchTracker'
import { updateInTuneHysteresis } from '../src/features/tuner/utils/tuningHysteresis'
import { GUITAR_OPEN_STRINGS } from '../src/lib/music/guitarStrings'
import { centsDifference } from '../src/lib/music/frequency'

const SAMPLE_RATE = 48_000
const tests: Array<{ name: string; run: () => void }> = []

function test(name: string, run: () => void) {
  tests.push({ name, run })
}

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}

function near(actual: number, expected: number, tolerance: number, message: string) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected.toFixed(1)}, got ${actual.toFixed(1)}`,
  )
}

function atCents(frequency: number, cents: number) {
  return frequency * 2 ** (cents / 1200)
}

function tone(
  frequency: number,
  harmonics = [1, 0.5, 0.24, 0.12],
  noise = 0.001,
) {
  const buffer = new Float32Array(AUDIO_CONFIG.FFT_SIZE)
  let seed = 0x12345678

  for (let index = 0; index < buffer.length; index++) {
    const time = index / SAMPLE_RATE
    const envelope = 1 - (index / buffer.length) * 0.08
    let sample = 0

    for (let harmonic = 0; harmonic < harmonics.length; harmonic++) {
      sample +=
        (harmonics[harmonic] ?? 0) *
        Math.sin(2 * Math.PI * frequency * (harmonic + 1) * time)
    }

    seed = (1664525 * seed + 1013904223) >>> 0
    sample = 0.22 * envelope * sample + (seed / 0xffffffff * 2 - 1) * noise
    buffer[index] = sample
  }

  return buffer
}

class Simulation {
  tracker = new TunerPitchTracker()
  now = 0

  step(frequency: number | null, rms: number, confidence = 0.9) {
    const result = this.tracker.process({
      now: this.now,
      rms,
      frequency,
      confidence,
    })
    this.now += 16
    return result
  }

  run(frames: number, frequency: number | null, rms: number, confidence = 0.9) {
    let result = this.step(frequency, rms, confidence)
    for (let frame = 1; frame < frames; frame++) {
      result = this.step(frequency, rms, confidence)
    }
    return result
  }
}

for (const guitarString of GUITAR_OPEN_STRINGS) {
  test(`detects ${guitarString.note}`, () => {
    const result = detectGuitarPitch(tone(guitarString.frequency), SAMPLE_RATE)
    assert(result.frequency !== null, `${guitarString.note} was not detected`)
    assert(result.stringLabel === guitarString.label, `${guitarString.note} matched ${result.stringLabel}`)
    near(centsDifference(result.frequency, guitarString.frequency), 0, 4, `${guitarString.note} error`)
  })
}

test('detects a D that is 30 cents flat', () => {
  const d = GUITAR_OPEN_STRINGS[2]
  const expected = atCents(d.frequency, -30)
  const result = detectGuitarPitch(tone(expected), SAMPLE_RATE)
  assert(result.frequency !== null, 'Flat D was not detected')
  assert(result.stringLabel === 'D', `Flat D matched ${result.stringLabel}`)
  near(centsDifference(result.frequency, expected), 0, 5, 'Flat D error')
})

test('keeps a harmonic-heavy low E on low E', () => {
  const e = GUITAR_OPEN_STRINGS[0]
  const result = detectGuitarPitch(tone(e.frequency, [0.12, 1, 0.58, 0.28], 0.002), SAMPLE_RATE)
  assert(result.frequency !== null, 'Harmonic-heavy E was not detected')
  assert(result.stringLabel === 'E', `Harmonic-heavy E matched ${result.stringLabel}`)
  near(centsDifference(result.frequency, e.frequency), 0, 15, 'Harmonic-heavy E error')
})

test('follows a tuning peg while the signal is strong', () => {
  const d = GUITAR_OPEN_STRINGS[2]
  const simulation = new Simulation()
  let result = simulation.run(10, atCents(d.frequency, -18), 0.05)

  for (let frame = 0; frame < 14; frame++) {
    result = simulation.step(atCents(d.frequency, -18 + 23 * frame / 13), 0.04)
  }

  assert(result.frequency !== null, 'Tracker lost the D note')
  near(centsDifference(result.frequency, d.frequency), 5, 3, 'Tracker did not follow tuning')
  assert(!result.isFrozen, 'Tracker froze during a strong signal')
})

test('ignores a misleading weak fading tail', () => {
  const d = GUITAR_OPEN_STRINGS[2]
  const simulation = new Simulation()
  simulation.run(10, atCents(d.frequency, -18), 0.05)
  const result = simulation.run(15, atCents(d.frequency, 10), 0.004)

  assert(result.frequency !== null, 'Tracker lost the reliable result')
  near(centsDifference(result.frequency, d.frequency), -18, 2, 'Tail changed the result')
  assert(result.isFrozen, 'Weak tail did not freeze')
})

test('clears a finished pluck after silence', () => {
  const simulation = new Simulation()
  simulation.run(10, GUITAR_OPEN_STRINGS[1].frequency, 0.05)
  const result = simulation.run(16, null, 0, 0)
  assert(result.frequency === null, 'Pitch remained after silence')
  assert(result.detectedString === null, 'String remained after silence')
})

test('uses ±10 cents to enter and ±20 cents to leave in tune', () => {
  let result = updateInTuneHysteresis(null, 'D', 11, true)
  assert(!result.isInTune, 'Entered outside ±10 cents')
  result = updateInTuneHysteresis(result.latchedString, 'D', 9, true)
  assert(result.isInTune, 'Did not enter inside ±10 cents')
  result = updateInTuneHysteresis(result.latchedString, 'D', 19, true)
  assert(result.isInTune, 'Left before ±20 cents')
  result = updateInTuneHysteresis(result.latchedString, 'D', 21, true)
  assert(!result.isInTune, 'Stayed in tune beyond ±20 cents')
  result = updateInTuneHysteresis(result.latchedString, 'D', 15, true)
  assert(!result.isInTune, 'Re-entered without returning inside ±10 cents')
})

let passed = 0
const failures: string[] = []

for (const item of tests) {
  try {
    item.run()
    passed++
    console.log(`✓ ${item.name}`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`${item.name}: ${message}`)
    console.error(`✗ ${item.name}: ${message}`)
  }
}

console.log(`\n${passed}/${tests.length} tuner tests passed`)
if (failures.length) throw new Error(failures.join('\n'))
