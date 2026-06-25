import { useEffect, useState } from 'react'
import type { GuitarStringLabel } from '../utils/noteUtils'
import { isValidGuitarFrequency } from '../utils/noteUtils'
import {
  AUDIO_CONFIG,
  calculateRms,
  detectGuitarPitch,
  DisplayHold,
  PitchStabilityFilter,
} from '../../../lib/audio'

interface UsePitchDetectionOptions {
  stream: MediaStream | null
  enabled: boolean
}

export type TunerDetectionStatus =
  | 'idle'
  | 'listening'
  | 'too-quiet'
  | 'unstable'
  | 'stable'
  | 'holding'

interface PitchFrame {
  rawFrequency: number | null
  detectedString: GuitarStringLabel | null
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
  liveFrequency: null,
  stableFrequency: null,
  heldFrequency: null,
  rms: 0,
  status: 'idle',
}

const STRING_LOCK_FRAMES = 3
const STRING_UNLOCK_SILENCE_MS = 180

function resolveStatus(
  rms: number,
  liveFrequency: number | null,
  stableFrequency: number | null,
  isHolding: boolean,
): TunerDetectionStatus {
  if (isHolding) {
    return 'holding'
  }
  if (rms < AUDIO_CONFIG.RMS_GATE_THRESHOLD) {
    return 'too-quiet'
  }
  if (stableFrequency !== null) {
    return 'stable'
  }
  if (liveFrequency !== null) {
    return 'unstable'
  }
  return 'listening'
}

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

    let lockedString: GuitarStringLabel | null = null
    let candidateString: GuitarStringLabel | null = null
    let candidateFrames = 0
    let quietStartedAt: number | null = null

    const stabilityFilter = new PitchStabilityFilter(
      AUDIO_CONFIG.STABILITY_WINDOW_SIZE,
      AUDIO_CONFIG.STABILITY_MIN_COUNT,
      AUDIO_CONFIG.STABILITY_MAX_CENTS,
    )
    const displayHold = new DisplayHold(AUDIO_CONFIG.HOLD_DURATION_MS)

    const resetStringLock = () => {
      lockedString = null
      candidateString = null
      candidateFrames = 0
    }

    const updateStringLock = (label: GuitarStringLabel) => {
      if (lockedString !== null) {
        return
      }

      if (candidateString === label) {
        candidateFrames += 1
      } else {
        candidateString = label
        candidateFrames = 1
      }

      if (candidateFrames >= STRING_LOCK_FRAMES) {
        lockedString = label
      }
    }

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
        const now = performance.now()

        let rawFrequency: number | null = null
        let detectedString: GuitarStringLabel | null = lockedString
        let liveFrequency: number | null = null
        let stableFrequency: number | null = null

        if (gateOpen) {
          quietStartedAt = null
          const result = detectGuitarPitch(buffer, sampleRate)

          if (
            result.frequency !== null &&
            result.stringLabel !== null &&
            result.confidence >= AUDIO_CONFIG.MIN_PITCH_CONFIDENCE &&
            isValidGuitarFrequency(result.frequency)
          ) {
            updateStringLock(result.stringLabel)
            rawFrequency = result.frequency
            detectedString = lockedString ?? result.stringLabel
            liveFrequency = result.frequency
            stableFrequency = stabilityFilter.add(result.frequency)
          } else {
            stabilityFilter.clear()
          }
        } else {
          stabilityFilter.clear()

          if (quietStartedAt === null) {
            quietStartedAt = now
          } else if (now - quietStartedAt >= STRING_UNLOCK_SILENCE_MS) {
            resetStringLock()
            detectedString = null
          }
        }

        const hold = displayHold.update(stableFrequency, now)
        const status = resolveStatus(
          rms,
          liveFrequency,
          stableFrequency,
          hold.isHolding,
        )

        setFrame({
          rawFrequency,
          detectedString,
          liveFrequency,
          stableFrequency,
          heldFrequency: hold.frequency,
          rms,
          status,
        })

        animationFrameId = requestAnimationFrame(analyze)
      }

      animationFrameId = requestAnimationFrame(analyze)
    }

    void startDetection()

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrameId)
      stabilityFilter.clear()
      displayHold.reset()
      resetStringLock()
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
