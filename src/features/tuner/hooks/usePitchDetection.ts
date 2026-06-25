import { useEffect, useState } from 'react'
import {
  GUITAR_STRINGS,
  getStringByLabel,
  isValidGuitarFrequency,
  resolveGuitarPitch,
  type GuitarStringLabel,
} from '../utils/noteUtils'
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
const INITIAL_STRING_CONFIRM_FRAMES = 3
const ADJACENT_STRING_CONFIRM_FRAMES = 3
const SKIPPED_STRING_CONFIRM_FRAMES = 8
const HARMONIC_JUMP_CONFIRM_FRAMES = 10
const HARMONIC_TOLERANCE_CENTS = 80
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

function centsBetween(frequency: number, targetFrequency: number): number {
  return 1200 * Math.log2(frequency / targetFrequency)
}

function isLikelyHarmonicError(
  frequency: number,
  confirmedString: GuitarStringLabel,
): boolean {
  const targetFrequency = getStringByLabel(confirmedString).frequency

  for (let harmonic = 2; harmonic <= 4; harmonic++) {
    const upperHarmonicCents = Math.abs(
      centsBetween(frequency, targetFrequency * harmonic),
    )
    const lowerSubharmonicCents = Math.abs(
      centsBetween(frequency * harmonic, targetFrequency),
    )

    if (
      upperHarmonicCents <= HARMONIC_TOLERANCE_CENTS ||
      lowerSubharmonicCents <= HARMONIC_TOLERANCE_CENTS
    ) {
      return true
    }
  }

  return false
}

function getRequiredConfirmationFrames(
  confirmedString: GuitarStringLabel | null,
  candidateString: GuitarStringLabel,
  frequency: number,
): number {
  if (confirmedString === null) {
    return INITIAL_STRING_CONFIRM_FRAMES
  }

  if (isLikelyHarmonicError(frequency, confirmedString)) {
    return HARMONIC_JUMP_CONFIRM_FRAMES
  }

  const confirmedIndex = GUITAR_STRINGS.findIndex(
    (guitarString) => guitarString.label === confirmedString,
  )
  const candidateIndex = GUITAR_STRINGS.findIndex(
    (guitarString) => guitarString.label === candidateString,
  )

  if (confirmedIndex < 0 || candidateIndex < 0) {
    return SKIPPED_STRING_CONFIRM_FRAMES
  }

  return Math.abs(candidateIndex - confirmedIndex) <= 1
    ? ADJACENT_STRING_CONFIRM_FRAMES
    : SKIPPED_STRING_CONFIRM_FRAMES
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

    let confirmedString: GuitarStringLabel | null = null
    let pendingString: GuitarStringLabel | null = null
    let pendingFrames = 0
    let quietStartedAt: number | null = null
    const responsiveReadings: number[] = []

    const stabilityFilter = new PitchStabilityFilter(
      AUDIO_CONFIG.STABILITY_WINDOW_SIZE,
      AUDIO_CONFIG.STABILITY_MIN_COUNT,
      AUDIO_CONFIG.STABILITY_MAX_CENTS,
    )
    const displayHold = new DisplayHold(AUDIO_CONFIG.HOLD_DURATION_MS)

    const resetStringTracking = () => {
      confirmedString = null
      pendingString = null
      pendingFrames = 0
      responsiveReadings.length = 0
    }

    const addResponsiveReading = (frequency: number): number => {
      responsiveReadings.push(frequency)
      while (responsiveReadings.length > RESPONSIVE_WINDOW_SIZE) {
        responsiveReadings.shift()
      }

      const sorted = [...responsiveReadings].sort((a, b) => a - b)
      return sorted[Math.floor((sorted.length - 1) / 2)] ?? frequency
    }

    const updateConfirmedString = (
      label: GuitarStringLabel,
      frequency: number,
    ) => {
      if (confirmedString === label) {
        pendingString = null
        pendingFrames = 0
        return
      }

      if (pendingString === label) {
        pendingFrames += 1
      } else {
        pendingString = label
        pendingFrames = 1
      }

      const requiredFrames = getRequiredConfirmationFrames(
        confirmedString,
        label,
        frequency,
      )

      if (pendingFrames >= requiredFrames) {
        confirmedString = label
        pendingString = null
        pendingFrames = 0
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
        let responsiveFrequency: number | null = null
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
            rawFrequency = result.frequency
            liveFrequency = result.frequency
            responsiveFrequency = addResponsiveReading(result.frequency)
            stableFrequency = stabilityFilter.add(result.frequency)

            const responsiveString = resolveGuitarPitch(
              responsiveFrequency,
            ).label
            updateConfirmedString(responsiveString, responsiveFrequency)
          } else {
            stabilityFilter.clear()
          }
        } else {
          stabilityFilter.clear()
          responsiveReadings.length = 0

          if (quietStartedAt === null) {
            quietStartedAt = now
          } else if (now - quietStartedAt >= STRING_UNLOCK_SILENCE_MS) {
            resetStringTracking()
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
          detectedString: confirmedString,
          responsiveFrequency,
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
      resetStringTracking()
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
