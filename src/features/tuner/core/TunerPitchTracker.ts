import { AUDIO_CONFIG } from '../../../lib/audio'
import {
  GUITAR_STRINGS,
  isValidGuitarFrequency,
  resolveGuitarPitch,
  type GuitarStringLabel,
} from '../utils/noteUtils'

export type TunerDetectionStatus =
  | 'idle'
  | 'listening'
  | 'too-quiet'
  | 'unstable'
  | 'stable'
  | 'holding'

export interface PitchObservation {
  now: number
  rms: number
  frequency: number | null
  confidence: number
}

export interface PitchTrackerSnapshot {
  detectedString: GuitarStringLabel | null
  frequency: number | null
  status: TunerDetectionStatus
  isFrozen: boolean
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

export class TunerPitchTracker {
  private pluckStartedAt: number | null = null
  private quietStartedAt: number | null = null
  private unreliableStartedAt: number | null = null
  private previousRms = 0
  private peakRms = 0
  private trackedFrequency: number | null = null
  private confirmedString: GuitarStringLabel | null = null
  private pendingString: GuitarStringLabel | null = null
  private pendingStringFrames = 0
  private isFrozen = false
  private readonly responsiveReadings: number[] = []

  reset(): void {
    this.pluckStartedAt = null
    this.quietStartedAt = null
    this.unreliableStartedAt = null
    this.previousRms = 0
    this.peakRms = 0
    this.trackedFrequency = null
    this.confirmedString = null
    this.pendingString = null
    this.pendingStringFrames = 0
    this.isFrozen = false
    this.responsiveReadings.length = 0
  }

  process(observation: PitchObservation): PitchTrackerSnapshot {
    const { now, rms, frequency, confidence } = observation
    const gateOpen = rms >= AUDIO_CONFIG.RMS_GATE_THRESHOLD

    const isFreshOnset =
      gateOpen &&
      (this.pluckStartedAt === null ||
        (this.trackedFrequency !== null &&
          this.previousRms > 0 &&
          rms >= ONSET_MIN_RMS &&
          rms >= this.previousRms * ONSET_RMS_RATIO))

    if (isFreshOnset) {
      this.startNewPluck(now)
    }

    const hasValidFrequency =
      frequency !== null && isValidGuitarFrequency(frequency)

    if (gateOpen) {
      this.quietStartedAt = null
      this.peakRms = Math.max(this.peakRms, rms)

      if (hasValidFrequency && frequency !== null) {
        const elapsed =
          this.pluckStartedAt === null ? 0 : now - this.pluckStartedAt
        const relativeRmsFloor = Math.min(
          this.peakRms * RELIABLE_PEAK_RATIO,
          MAX_RELATIVE_RMS_FLOOR,
        )
        const reliableRmsFloor = Math.max(
          MIN_RELIABLE_RMS,
          relativeRmsFloor,
        )
        const reliableReading =
          elapsed >= ATTACK_IGNORE_MS &&
          rms >= reliableRmsFloor &&
          confidence >= MIN_RELIABLE_CONFIDENCE

        if (reliableReading) {
          this.unreliableStartedAt = null
          this.isFrozen = false
          const smoothedFrequency = this.addResponsiveReading(frequency)
          const candidateString = resolveGuitarPitch(smoothedFrequency).label
          const acceptedString = this.updateConfirmedString(candidateString)

          if (acceptedString === candidateString) {
            this.trackedFrequency = smoothedFrequency
          }
        } else if (this.trackedFrequency !== null) {
          this.markUnreliable(now)
        }
      } else if (this.trackedFrequency !== null) {
        this.markUnreliable(now)
      }
    } else if (this.pluckStartedAt !== null) {
      if (this.quietStartedAt === null) {
        this.quietStartedAt = now
      } else if (now - this.quietStartedAt >= PLUCK_END_SILENCE_MS) {
        this.reset()
      }
    }

    const snapshot = this.snapshot(gateOpen, hasValidFrequency)
    this.previousRms = rms
    return snapshot
  }

  private startNewPluck(now: number): void {
    this.reset()
    this.pluckStartedAt = now
  }

  private addResponsiveReading(frequency: number): number {
    this.responsiveReadings.push(frequency)
    while (this.responsiveReadings.length > RESPONSIVE_WINDOW_SIZE) {
      this.responsiveReadings.shift()
    }
    return median(this.responsiveReadings)
  }

  private updateConfirmedString(
    candidate: GuitarStringLabel,
  ): GuitarStringLabel | null {
    if (this.confirmedString === candidate) {
      this.pendingString = null
      this.pendingStringFrames = 0
      return this.confirmedString
    }

    if (this.pendingString === candidate) {
      this.pendingStringFrames += 1
    } else {
      this.pendingString = candidate
      this.pendingStringFrames = 1
    }

    if (
      this.pendingStringFrames >=
      requiredStringFrames(this.confirmedString, candidate)
    ) {
      this.confirmedString = candidate
      this.pendingString = null
      this.pendingStringFrames = 0
    }

    return this.confirmedString
  }

  private markUnreliable(now: number): void {
    if (this.unreliableStartedAt === null) {
      this.unreliableStartedAt = now
    } else if (now - this.unreliableStartedAt >= FADE_FREEZE_MS) {
      this.isFrozen = true
    }
  }

  private snapshot(
    gateOpen: boolean,
    hasValidFrequency: boolean,
  ): PitchTrackerSnapshot {
    let status: TunerDetectionStatus

    if (this.trackedFrequency !== null) {
      status = !gateOpen || this.isFrozen ? 'holding' : 'stable'
    } else if (!gateOpen) {
      status = 'too-quiet'
    } else if (hasValidFrequency) {
      status = 'unstable'
    } else {
      status = 'listening'
    }

    return {
      detectedString: this.confirmedString,
      frequency: this.trackedFrequency,
      status,
      isFrozen: this.isFrozen,
    }
  }
}
