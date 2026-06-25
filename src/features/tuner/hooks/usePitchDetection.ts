import { useEffect, useState } from 'react'
import { ChordNoteTracker } from '../core/ChordNoteTracker'
import {
  TunerPitchTracker,
  type TunerDetectionStatus,
} from '../core/TunerPitchTracker'
import {
  AUDIO_CONFIG,
  calculateRms,
  detectChordNote,
  detectGuitarPitch,
  type ChromaticNoteName,
} from '../../../lib/audio'
import type { GuitarStringLabel } from '../utils/noteUtils'

export type { TunerDetectionStatus } from '../core/TunerPitchTracker'

interface UsePitchDetectionOptions {
  stream: MediaStream | null
  enabled: boolean
}

interface PitchFrame {
  rawFrequency: number | null
  detectedString: GuitarStringLabel | null
  responsiveFrequency: number | null
  liveFrequency: number | null
  stableFrequency: number | null
  heldFrequency: number | null
  chordNote: ChromaticNoteName | null
  isChord: boolean
  rms: number
  status: TunerDetectionStatus
}

interface UsePitchDetectionResult extends PitchFrame {
  isListening: boolean
}

const EMPTY_FRAME: PitchFrame = {
  rawFrequency: null,
  detectedString: null,
  responsiveFrequency: null,
  liveFrequency: null,
  stableFrequency: null,
  heldFrequency: null,
  chordNote: null,
  isChord: false,
  rms: 0,
  status: 'idle',
}

const CHORD_SCAN_INTERVAL_FRAMES = 3

export function usePitchDetection({
  stream,
  enabled,
}: UsePitchDetectionOptions): UsePitchDetectionResult {
  const [frame, setFrame] = useState<PitchFrame>(EMPTY_FRAME)
  const [isListening, setIsListening] = useState(false)

  const isActive = enabled && stream !== null

  useEffect(() => {
    if (!isActive) {
      return
    }

    let animationFrameId = 0
    let audioContext: AudioContext | null = null
    let cancelled = false
    let chordScanFrame = 0
    let chordActiveLastFrame = false
    const tracker = new TunerPitchTracker()
    const chordTracker = new ChordNoteTracker()
    let chordSnapshot = chordTracker.process({
      note: null,
      frequency: null,
      confidence: 0,
      strongNoteCount: 0,
      isChordLike: false,
    })

    const startDetection = async () => {
      audioContext = new AudioContext()
      await audioContext.resume()

      if (cancelled) {
        await audioContext.close()
        return
      }

      const source = audioContext.createMediaStreamSource(stream)
      const highPass = audioContext.createBiquadFilter()
      highPass.type = 'highpass'
      highPass.frequency.value = AUDIO_CONFIG.HIGH_PASS_HZ
      highPass.Q.value = 0.707

      const lowPass = audioContext.createBiquadFilter()
      lowPass.type = 'lowpass'
      lowPass.frequency.value = AUDIO_CONFIG.LOW_PASS_HZ
      lowPass.Q.value = 0.707

      const gain = audioContext.createGain()
      gain.gain.value = AUDIO_CONFIG.INPUT_GAIN

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = AUDIO_CONFIG.FFT_SIZE
      analyser.smoothingTimeConstant = 0.15
      analyser.minDecibels = -110
      analyser.maxDecibels = -20

      source.connect(highPass)
      highPass.connect(lowPass)
      lowPass.connect(gain)
      gain.connect(analyser)

      const buffer = new Float32Array(analyser.fftSize)
      const spectrum = new Float32Array(analyser.frequencyBinCount)
      const sampleRate = audioContext.sampleRate
      setIsListening(true)

      const analyze = () => {
        analyser.getFloatTimeDomainData(buffer)
        const rms = calculateRms(buffer)
        const gateOpen = rms >= AUDIO_CONFIG.RMS_GATE_THRESHOLD
        const result = gateOpen
          ? detectGuitarPitch(buffer, sampleRate)
          : { frequency: null, confidence: 0, stringLabel: null }

        chordScanFrame += 1
        if (gateOpen && chordScanFrame >= CHORD_SCAN_INTERVAL_FRAMES) {
          chordScanFrame = 0
          analyser.getFloatFrequencyData(spectrum)
          chordSnapshot = chordTracker.process(
            detectChordNote(
              spectrum,
              sampleRate,
              analyser.fftSize,
            ),
          )
        } else if (!gateOpen) {
          chordSnapshot = chordTracker.process({
            note: null,
            frequency: null,
            confidence: 0,
            strongNoteCount: 0,
            isChordLike: false,
          })
        }

        if (chordSnapshot.active && !chordActiveLastFrame) {
          tracker.reset()
        }

        const snapshot = chordSnapshot.active
          ? {
              detectedString: null,
              frequency: null,
              status: 'stable' as const,
              isFrozen: false,
            }
          : tracker.process({
              now: performance.now(),
              rms,
              frequency: result.frequency,
              confidence: result.confidence,
            })

        chordActiveLastFrame = chordSnapshot.active

        setFrame({
          rawFrequency: chordSnapshot.active ? null : result.frequency,
          detectedString: snapshot.detectedString,
          responsiveFrequency: snapshot.frequency,
          liveFrequency: chordSnapshot.active ? null : result.frequency,
          stableFrequency: snapshot.frequency,
          heldFrequency: snapshot.frequency,
          chordNote: chordSnapshot.note,
          isChord: chordSnapshot.active,
          rms,
          status: snapshot.status,
        })

        animationFrameId = requestAnimationFrame(analyze)
      }

      animationFrameId = requestAnimationFrame(analyze)
    }

    void startDetection()

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrameId)
      tracker.reset()
      chordTracker.reset()
      setIsListening(false)
      setFrame(EMPTY_FRAME)
      void audioContext?.close()
    }
  }, [isActive, stream])

  if (!isActive) {
    return { ...EMPTY_FRAME, isListening: false }
  }

  return { ...frame, isListening }
}
