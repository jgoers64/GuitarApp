import type { GuitarStringLabel } from '../../features/tuner/utils/noteUtils'
import { getStringByLabel } from '../../features/tuner/utils/noteUtils'
import { getSharedAudioContext } from './audioContext'
import {
  createGuitarPluckBuffer,
  createGuitarToneChain,
  getPluckDurationSec,
} from './guitarPluck'

let stopActiveTone: (() => void) | null = null

const TONE_VOLUME = 0.62

function stopTone() {
  stopActiveTone?.()
  stopActiveTone = null
}

function schedulePluck(context: AudioContext, frequency: number): void {
  stopTone()

  const buffer = createGuitarPluckBuffer(context, frequency)
  const source = context.createBufferSource()
  source.buffer = buffer

  const toneChain = createGuitarToneChain(context, frequency)
  const masterGain = context.createGain()

  const start = context.currentTime + 0.02
  const duration = getPluckDurationSec()

  masterGain.gain.setValueAtTime(0, start)
  masterGain.gain.linearRampToValueAtTime(TONE_VOLUME, start + 0.008)
  masterGain.gain.setValueAtTime(TONE_VOLUME, start + duration - 0.08)
  masterGain.gain.linearRampToValueAtTime(0, start + duration)

  source.connect(toneChain.input)
  toneChain.output.connect(masterGain)
  masterGain.connect(context.destination)
  source.start(start)
  source.stop(start + duration)

  stopActiveTone = () => {
    try {
      source.stop()
    } catch {
      // already stopped
    }
    source.disconnect()
    for (const node of toneChain.nodes) {
      node.disconnect()
    }
    masterGain.disconnect()
  }
}

export function playReferenceTone(frequency: number): Promise<void> {
  const context = getSharedAudioContext()
  void context.resume()

  return context.resume().then(() => {
    schedulePluck(context, frequency)
  })
}

export function playStringReference(label: GuitarStringLabel): Promise<void> {
  const { frequency } = getStringByLabel(label)
  return playReferenceTone(frequency)
}

export function stopReferenceTone(): void {
  stopTone()
}
