import { useEffect, useState } from 'react'
import {
  GUITAR_STRINGS,
  isValidGuitarFrequency,
  resolveGuitarPitch,
  type GuitarStringLabel,
} from '../utils/noteUtils'
import {
  AUDIO_CONFIG,
  calculateRms,
  detectGuitarPitch,
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

const RESPONSIVE_WINDOW_SIZE = 3
const ATTACK_IGNORE_MS = 60
const INITIAL_STRING_CONFIRM_FRAMES = 3
const ADJACENT_STRING_CONFIRM_FRAMES = 3
const SKIPPED_STRING_CONFIRM_FRAMES = 7
const PLUCK_END_SILENCE_MS = 220
const FADE_FREEZE_MS = 160
const ONSET_RMS_RATIO = 1.8
const ONSET_MIN_RMS = AUDIO_CONFIG.RMS_GATE_THRESHOLD * 2.5
const MIN_RELIABLE_RMS = AUDIO_CONFIG.RMS_GATE_THRESHOLD * 1.4
const MAX_RELATIVE_RMS_FLOOR = AUDIO_CONFIG.RMS_GATE_THRESHOLD * 4
const RELIABLE_PEAK_RATIO = 0.15
const MIN_RELIABLE_CONFIDENCE = Math.max(
  AUDIO_CONFIG.MIN_PITCH_CONFIDENCE,
  0.72,
)

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }

  return sorted[middle]
}

function requiredStringFrames(
  current: GuitarStringLabel | null,
  candidate: GuitarStringLabel,
): number {
  if (current === null) {
    return INITIAL_STRING_CONFIRM_FRAMES
  }

  const currentIndex = GUITAR_STRINGS.findIndex(
    (guitarString) => guitarString.label === current,
  )
  const candidateIndex = GUITAR_STRINGS.findIndex(
    (guitarString) => guitarString.label === candidate,
  )

  if (currentIndex < 0 || candidateIndex < 0) {
    return SKIPPED_STRING_CONFIRM_FRAMES
  }

  return Math.abs(currentIndex - candidateIndex) <= 1
    ? ADJACENT_STRING_CONFIRM_FRAMES
    : SKIPPED_STRING_CONFIRM_FRAMES
}

function getStatus(
  rms: number,
  liveFrequency: number | null,
  trackedFrequency: number | null,
  gateOpen: boolean,
  isFrozen: boolean,
): TunerDetectionStatus {
  if (trackedFrequency !== null) {
    return !gateOpen || isFrozen ? 'holding' : 'stable'
  }
  if (rms < AUDIO_CONFIG.RMS_GATE_THRESHOLD) {
    return 'too-quiet'
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

    let pluckStartedAt: number | null = null
    let quietStartedAt: number | null = null
    let unreliableStartedAt: number | null = null
    let previousRms = 0
    let peakRms = 0
    let trackedFrequency: number | null = null
    let confirmedString: GuitarStringLabel | null = null
    let pendingString: GuitarStringLabel | null = null
    let pendingStringFrames = 0
    let isFrozen = false
    const responsiveReadings: number[] = []

    const resetPluck = () => {
      pluckStartedAt = null
      quietStartedAt = null
      unreliableStartedAt = null
      peakRms = 0
      trackedFrequency = null
      confirmedString = null
      pendingString = null
      pendingStringFrames = 0
      isFrozen = false
      responsiveReadings.length = 0
    }

    const startNewPluck = (now: number) => {
      resetPluck()
      pluckStartedAt = now
    }

    const addResponsiveReading = (frequency: number): number => {
      responsiveReadings.push(frequency)
      while (responsiveReadings.length > RESPONSIVE_WINDOW_SIZE) {
        responsiveReadings.shift()
      }
      return median(responsiveReadings)
    }

    const updateConfirmedString = (
      candidate: GuitarStringLabel,
    ): GuitarStringLabel | null => {
      if (confirmedString === candidate) {
        pendingString = null
        pendingStringFrames = 0
        return confirmedString
      }

      if (pendingString === candidate) {
        pendingStringFrames += 1
      } else {
        pendingString = candidate
        pendingStringFrames = 1
      }

      if (
        pendingStringFrames >= requiredStringFrames(confirmedString, candidate)
      ) {
        confirmedString = candidate
        pendingString = null
        pendingStringFrames = 0
      }

      return confirmedString
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

        const isFreshOnset =
          gateOpen &&
          (pluckStartedAt === null ||
            (trackedFrequency !== null &&
              previousRms > 0 &&
              rms >= ONSET_MIN_RMS &&
              rms >= previousRms * ONSET_RMS_RATIO))

        if (isFreshOnset) {
          startNewPluck(now)
        }

        let rawFrequency: number | null = null
        let liveFrequency: number | null = null

        if (gateOpen) {
          quietStartedAt = null
          peakRms = Math.max(peakRms, rms)
          const result = detectGuitarPitch(buffer, sampleRate)

          if (
            result.frequency !== null &&
            isValidGuitarFrequency(result.frequency)
          ) {
            rawFrequency = result.frequency
            liveFrequency = result.frequency

            const elapsed =
              pluckStartedAt === null ? 0 : now - pluckStartedAt
            const relativeRmsFloor = Math.min(
              peakRms * RELIABLE_PEAK_RATIO,
              MAX_RELATIVE_RMS_FLOOR,
            )
            const reliableRmsFloor = Math.max(
              MIN_RELIABLE_RMS,
              relativeRmsFloor,
            )
            const reliableReading =
              elapsed >= ATTACK_IGNORE_MS &&
              rms >= reliableRmsFloor &&
              result.confidence >= MIN_RELIABLE_CONFIDENCE

            if (!isFrozen && reliableReading) {
              unreliableStartedAt = null
              const smoothedFrequency = addResponsiveReading(result.frequency)
              const candidateString = resolveGuitarPitch(
                smoothedFrequency,
              ).label
              const acceptedString = updateConfirmedString(candidateString)

              if (acceptedString === candidateString) {
                trackedFrequency = smoothedFrequency
              }
            } else if (!isFrozen && trackedFrequency !== null) {
              if (unreliableStartedAt === null) {
                unreliableStartedAt = now
              } else if (now - unreliableStartedAt >= FADE_FREEZE_MS) {
                isFrozen = true
              }
            }
          } else if (!isFrozen && trackedFrequency !== null) {
            if (unreliableStartedAt === null) {
              unreliableStartedAt = now
            } else if (now - unreliableStartedAt >= FADE_FREEZE_MS) {
              isFrozen = true
            }
          }
        } else if (pluckStartedAt !== null) {
          if (quietStartedAt === null) {
            quietStartedAt = now
          } else if (now - quietStartedAt >= PLUCK_END_SILENCE_MS) {
            resetPluck()
          }
        }

        const status = getStatus(
          rms,
          liveFrequency,
          trackedFrequency,
          gateOpen,
          isFrozen,
        )

        setFrame({
          rawFrequency,
          detectedString: confirmedString,
          responsiveFrequency: trackedFrequency,
          liveFrequency,
          stableFrequency: trackedFrequency,
          heldFrequency: trackedFrequency,
          rms,
          status,
        })

        previousRms = rms
        animationFrameId = requestAnimationFrame(analyze)
      }

      animationFrameId = requestAnimationFrame(analyze)
    }

    void startDetection()

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrameId)
      resetPluck()
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
