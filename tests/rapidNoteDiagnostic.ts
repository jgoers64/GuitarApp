import { TunerPitchTracker } from '../src/features/tuner/core/TunerPitchTracker'
import {
  GUITAR_OPEN_STRINGS,
  type GuitarOpenStringLabel,
} from '../src/lib/music/guitarStrings'
import { centsDifference } from '../src/lib/music/frequency'

interface NoteTarget {
  label: GuitarOpenStringLabel
  frequency: number
}

interface SegmentResult {
  target: GuitarOpenStringLabel
  firstCorrectMs: number | null
  correctFrames: number
  staleFrames: number
  blankFrames: number
  outputs: string
}

class RapidSimulation {
  readonly tracker = new TunerPitchTracker()
  now = 0

  step(frequency: number, rms: number) {
    const snapshot = this.tracker.process({
      now: this.now,
      rms,
      frequency,
      confidence: 0.9,
    })
    this.now += 16
    return snapshot
  }
}

function runSequence(
  title: string,
  notes: readonly NoteTarget[],
  framesPerNote: number,
  distinctPlucks: boolean,
): SegmentResult[] {
  const simulation = new RapidSimulation()
  const results: SegmentResult[] = []

  for (const note of notes) {
    let firstCorrectMs: number | null = null
    let correctFrames = 0
    let staleFrames = 0
    let blankFrames = 0
    const outputs: string[] = []

    for (let frame = 0; frame < framesPerNote; frame++) {
      const rms = distinctPlucks && frame === 0 ? 0.065 : 0.028
      const snapshot = simulation.step(note.frequency, rms)
      const output = snapshot.detectedString
      outputs.push(output ?? '·')

      if (output === note.label) {
        correctFrames++
        firstCorrectMs ??= frame * 16
      } else if (output === null) {
        blankFrames++
      } else {
        staleFrames++
      }
    }

    results.push({
      target: note.label,
      firstCorrectMs,
      correctFrames,
      staleFrames,
      blankFrames,
      outputs: outputs.join(' '),
    })
  }

  console.log(`\n[rapid-note diagnostic] ${title}`)
  for (const result of results) {
    const latency =
      result.firstCorrectMs === null ? 'missed' : `${result.firstCorrectMs} ms`
    console.log(
      `${result.target}: first=${latency}; correct=${result.correctFrames}/${framesPerNote}; stale=${result.staleFrames}; blank=${result.blankFrames}; ${result.outputs}`,
    )
  }

  return results
}

function runAlternatingInterference(): void {
  const simulation = new RapidSimulation()
  const d = GUITAR_OPEN_STRINGS[2]
  const g = GUITAR_OPEN_STRINGS[3]

  for (let frame = 0; frame < 10; frame++) {
    simulation.step(d.frequency, frame === 0 ? 0.065 : 0.028)
  }

  const overlapOutputs: string[] = []
  for (let frame = 0; frame < 12; frame++) {
    const frequency = frame % 2 === 0 ? d.frequency : g.frequency
    const snapshot = simulation.step(frequency, 0.028)
    overlapOutputs.push(snapshot.detectedString ?? '·')
  }

  const settledOutputs: string[] = []
  for (let frame = 0; frame < 10; frame++) {
    const snapshot = simulation.step(g.frequency, 0.028)
    settledOutputs.push(snapshot.detectedString ?? '·')
  }

  console.log('\n[rapid-note diagnostic] alternating D/G interference')
  console.log(`overlap: ${overlapOutputs.join(' ')}`)
  console.log(`after G settles: ${settledOutputs.join(' ')}`)
}

function runRapidRetuning(): void {
  const simulation = new RapidSimulation()
  const d = GUITAR_OPEN_STRINGS[2]
  const offsets = [-25, -12, 0, 14]

  console.log('\n[rapid-note diagnostic] repeated D plucks while retuning')
  for (const offset of offsets) {
    const frequency = d.frequency * 2 ** (offset / 1200)
    const values: string[] = []

    for (let frame = 0; frame < 10; frame++) {
      const snapshot = simulation.step(
        frequency,
        frame === 0 ? 0.065 : 0.028,
      )
      if (snapshot.frequency === null) {
        values.push('·')
      } else {
        values.push(
          Math.round(centsDifference(snapshot.frequency, d.frequency)).toString(),
        )
      }
    }

    console.log(`${offset >= 0 ? '+' : ''}${offset}¢ target: ${values.join(' ')}`)
  }
}

const ascending = GUITAR_OPEN_STRINGS.map(({ label, frequency }) => ({
  label,
  frequency,
}))
const jumping = [
  GUITAR_OPEN_STRINGS[0],
  GUITAR_OPEN_STRINGS[3],
  GUITAR_OPEN_STRINGS[1],
  GUITAR_OPEN_STRINGS[5],
  GUITAR_OPEN_STRINGS[2],
  GUITAR_OPEN_STRINGS[4],
]

runSequence('six distinct plucks, 160 ms each', ascending, 10, true)
runSequence('six distinct plucks, 96 ms each', ascending, 6, true)
runSequence('large jumps, steady volume, 160 ms each', jumping, 10, false)
runAlternatingInterference()
runRapidRetuning()
