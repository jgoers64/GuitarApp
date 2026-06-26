import { useEffect, useState } from 'react'
import {
  TunerPitchTracker,
  type TunerDetectionStatus,
} from '../core/TunerPitchTracker'
import {
  AUDIO_CONFIG,
  calculateRms,
  detectGuitarPitch,
} from '../../../lib/audio'
import type { TuningStringTarget } from '../tunings'
import type { GuitarStringLabel } from '../utils/noteUtils'

export type { TunerDetectionStatus } from '../core/TunerPitchTracker'

interface UsePitchDetectionOptions {
  stream: MediaStream | null
  enabled: boolean
  tuningStrings: readonly TuningStringTarget[]
}

interface PitchFrame {
  rawFrequency: number | null
  detectedString: GuitarStringLabel | null
  responsiveFrequency: number | null
  liveFrequency: number | null
  stableFrequency: number | null
  heldFrequency: number | null
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
  rms: 0,
  status: 'idle',
}

export function usePitchDetection({
  stream,
  enabled,
  tuningStrings,
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
    const tracker = new TunerPitchTracker(tuningStrings)

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

      source.connect(highPass)
      highPass.connect(lowPass)
      lowPass.connect(gain)
      gain.connect(analyser)

      const buffer = new Float32Array(analyser.fftSize)
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

        setFrame({
          rawFrequency: result.frequency,
          detectedString: snapshot.detectedString,
          responsiveFrequency: snapshot.frequency,
          liveFrequency: result.frequency,
          stableFrequency: snapshot.frequency,
          heldFrequency: snapshot.frequency,
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
      setIsListening(false)
      setFrame(EMPTY_FRAME)
      void audioContext?.close()
    }
  }, [isActive, stream, tuningStrings])

  if (!isActive) {
    return { ...EMPTY_FRAME, isListening: false }
  }

  return { ...frame, isListening }
}
