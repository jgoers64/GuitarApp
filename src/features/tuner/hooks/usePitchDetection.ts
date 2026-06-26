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
} from '../../../lib/audio'
import {
  getStringByLabel,
  getTuningForString,
  type GuitarStringLabel,
} from '../utils/noteUtils'

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
  chordTargetString: GuitarStringLabel | null
  isChordFallback: boolean
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
  chordTargetString: null,
  isChordFallback: false,
  rms: 0,
  status: 'idle',
}

const CHORD_FFT_SIZE = 16384
const CHORD_SCAN_INTERVAL_FRAMES = 4
const SUSPICIOUS_CHORD_CENTS = 60

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
    const tracker = new TunerPitchTracker()
    const chordTracker = new ChordNoteTracker()
    let chordSnapshot = chordTracker.process(null, false)

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

      const chordAnalyser = audioContext.createAnalyser()
      chordAnalyser.fftSize = CHORD_FFT_SIZE
      chordAnalyser.smoothingTimeConstant = 0.12
      chordAnalyser.minDecibels = -110
      chordAnalyser.maxDecibels = -20

      source.connect(highPass)
      highPass.connect(lowPass)
      lowPass.connect(gain)
      gain.connect(analyser)
      gain.connect(chordAnalyser)

      const buffer = new Float32Array(analyser.fftSize)
      const spectrum = new Float32Array(chordAnalyser.frequencyBinCount)
      const sampleRate = audioContext.sampleRate
      setIsListening(true)

      const analyze = () => {
        analyser.getFloatTimeDomainData(buffer)
        const rms = calculateRms(buffer)
        const gateOpen = rms >= AUDIO_CONFIG.RMS_GATE_THRESHOLD
        const result = gateOpen
          ? detectGuitarPitch(buffer, sampleRate)
          : { frequency: null, confidence: 0, stringLabel: null }

        const snapshot = tracker.process({
          now: performance.now(),
          rms,
          frequency: result.frequency,
          confidence: result.confidence,
        })

        chordScanFrame += 1
        if (gateOpen && chordScanFrame >= CHORD_SCAN_INTERVAL_FRAMES) {
          chordScanFrame = 0
          chordAnalyser.getFloatFrequencyData(spectrum)
          const chordResult = detectChordNote(
            spectrum,
            sampleRate,
            chordAnalyser.fftSize,
          )

          const detectedTarget =
            result.stringLabel !== null
              ? getStringByLabel(result.stringLabel)
              : null
          const currentCents =
            result.frequency !== null && detectedTarget !== null
              ? getTuningForString(
                  result.frequency,
                  detectedTarget.frequency,
                ).centsOff
              : null
          const useChordFallback =
            chordResult.isChordLike &&
            chordResult.targetString !== null &&
            currentCents !== null &&
            Math.abs(currentCents) >= SUSPICIOUS_CHORD_CENTS

          chordSnapshot = chordTracker.process(
            chordResult.targetString,
            useChordFallback,
          )
        } else if (!gateOpen) {
          chordSnapshot = chordTracker.process(null, false)
        }

        setFrame({
          rawFrequency: result.frequency,
          detectedString: snapshot.detectedString,
          responsiveFrequency: snapshot.frequency,
          liveFrequency: result.frequency,
          stableFrequency: snapshot.frequency,
          heldFrequency: snapshot.frequency,
          chordTargetString: chordSnapshot.targetString,
          isChordFallback: chordSnapshot.active,
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
