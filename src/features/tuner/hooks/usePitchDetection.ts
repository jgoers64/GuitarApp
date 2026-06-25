import { useEffect, useState } from 'react'
import {
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

interface CaptureReading {
  frequency: number
  label: GuitarStringLabel
}

interface LockedPluck {
  frequency: number
  label: GuitarStringLabel
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
/** Ignore the pick/noise transient before measuring the musical pitch. */
const ATTACK_IGNORE_MS = 60
/** Use only the earliest reliable readings from each pluck. */
const CAPTURE_TARGET_READINGS = 5
const CAPTURE_MIN_AGREEING_READINGS = 4
const CAPTURE_TIMEOUT_MS = 320
const CAPTURE_MAX_SPREAD_CENTS = 45
const FORCED_CAPTURE_MAX_SPREAD_CENTS = 70
/** A quiet gap marks the end of the current pluck. */
const PLUCK_END_SILENCE_MS = 220
/** A large volume jump allows a fresh pluck before the old one fully dies. */
const ONSET_RMS_RATIO = 1.8
const ONSET_MIN_RMS = AUDIO_CONFIG.RMS_GATE_THRESHOLD * 2.5

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }

  return sorted[middle]
}

function centsBetween(frequency: number, targetFrequency: number): number {
  return 1200 * Math.log2(frequency / targetFrequency)
}

function chooseLockedPluck(
  readings: CaptureReading[],
  force: boolean,
): LockedPluck | null {
  const grouped = new Map<GuitarStringLabel, number[]>()

  for (const reading of readings) {
    const frequencies = grouped.get(reading.label) ?? []
    frequencies.push(reading.frequency)
    grouped.set(reading.label, frequencies)
  }

  let bestLabel: GuitarStringLabel | null = null
  let bestFrequencies: number[] = []

  for (const [label, frequencies] of grouped) {
    if (frequencies.length > bestFrequencies.length) {
      bestLabel = label
      bestFrequencies = frequencies
    }
  }

  const minimumReadings = force ? 3 : CAPTURE_MIN_AGREEING_READINGS
  if (bestLabel === null || bestFrequencies.length < minimumReadings) {
    return null
  }

  const capturedFrequency = median(bestFrequencies)
  const maxSpread = Math.max(
    ...bestFrequencies.map((frequency) =>
      Math.abs(centsBetween(frequency, capturedFrequency)),
    ),
  )
  const allowedSpread = force
    ? FORCED_CAPTURE_MAX_SPREAD_CENTS
    : CAPTURE_MAX_SPREAD_CENTS

  if (maxSpread > allowedSpread) {
    return null
  }

  return {
    frequency: capturedFrequency,
    label: bestLabel,
  }
}

function getStatus(
  rms: number,
  liveFrequency: number | null,
  lockedFrequency: number | null,
  gateOpen: boolean,
): TunerDetectionStatus {
  if (lockedFrequency !== null) {
    return gateOpen ? 'stable' : 'holding'
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
    let previousRms = 0
    let lockedFrequency: number | null = null
    let lockedString: GuitarStringLabel | null = null
    const responsiveReadings: number[] = []
    const captureReadings: CaptureReading[] = []

    const resetPluck = () => {
      pluckStartedAt = null
      quietStartedAt = null
      lockedFrequency = null
      lockedString = null
      responsiveReadings.length = 0
      captureReadings.length = 0
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
            (lockedFrequency !== null &&
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
          const result = detectGuitarPitch(buffer, sampleRate)

          if (
            result.frequency !== null &&
            result.confidence >= AUDIO_CONFIG.MIN_PITCH_CONFIDENCE &&
            isValidGuitarFrequency(result.frequency)
          ) {
            rawFrequency = result.frequency
            liveFrequency = result.frequency

            if (lockedFrequency === null && pluckStartedAt !== null) {
              const smoothedFrequency = addResponsiveReading(result.frequency)
              const elapsed = now - pluckStartedAt

              if (elapsed >= ATTACK_IGNORE_MS) {
                captureReadings.push({
                  frequency: smoothedFrequency,
                  label: resolveGuitarPitch(smoothedFrequency).label,
                })

                const forceCapture = elapsed >= CAPTURE_TIMEOUT_MS
                const hasTargetReadings =
                  captureReadings.length >= CAPTURE_TARGET_READINGS

                if (hasTargetReadings || forceCapture) {
                  const locked = chooseLockedPluck(
                    captureReadings,
                    forceCapture,
                  )

                  if (locked !== null) {
                    lockedFrequency = locked.frequency
                    lockedString = locked.label
                  }
                }
              }
            }
          }
        } else if (pluckStartedAt !== null) {
          if (quietStartedAt === null) {
            quietStartedAt = now
          } else if (now - quietStartedAt >= PLUCK_END_SILENCE_MS) {
            resetPluck()
          }
        }

        const status = getStatus(rms, liveFrequency, lockedFrequency, gateOpen)

        setFrame({
          rawFrequency,
          detectedString: lockedString,
          // Once captured, this value intentionally remains fixed until the
          // current pluck ends. The fading tail cannot change the verdict.
          responsiveFrequency: lockedFrequency,
          liveFrequency,
          stableFrequency: lockedFrequency,
          heldFrequency: lockedFrequency,
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
