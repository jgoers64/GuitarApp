import { useEffect, useState } from 'react'
import type { TunerDetectionStatus } from '../hooks/usePitchDetection'
import {
  actualToDisplayCents,
  centsToMeterPercent,
  clampCents,
  formatTuneStatus,
  getTuningForString,
  isValidGuitarFrequency,
  resolveGuitarPitch,
  type GuitarStringLabel,
  type TuneStatus,
} from '../utils/noteUtils'
import { updateInTuneHysteresis } from '../utils/tuningHysteresis'
import { CentsMeter } from './CentsMeter'
import { GuitarHeadstock } from './GuitarHeadstock'

interface TunerDisplayProps {
  responsiveFrequency: number | null
  detectedString: GuitarStringLabel | null
  heldFrequency: number | null
  chordTargetString: GuitarStringLabel | null
  isChordFallback: boolean
  detectionStatus: TunerDetectionStatus
  isMicActive: boolean
  autoMode: boolean
  selectedString: GuitarStringLabel | null
  onStringSelect: (label: GuitarStringLabel) => void
}

export function TunerDisplay({
  responsiveFrequency,
  detectedString,
  heldFrequency,
  chordTargetString,
  isChordFallback,
  detectionStatus,
  isMicActive,
  autoMode,
  selectedString,
  onStringSelect,
}: TunerDisplayProps) {
  const [latchedInTuneString, setLatchedInTuneString] =
    useState<GuitarStringLabel | null>(null)

  const showChordFallback =
    autoMode && isChordFallback && chordTargetString !== null

  const responsiveAutoString =
    responsiveFrequency !== null
      ? resolveGuitarPitch(responsiveFrequency).label
      : null
  const heldAutoString =
    heldFrequency !== null ? resolveGuitarPitch(heldFrequency).label : null

  const autoFrequency =
    detectedString !== null &&
    responsiveFrequency !== null &&
    responsiveAutoString === detectedString
      ? responsiveFrequency
      : detectedString !== null &&
          heldFrequency !== null &&
          heldAutoString === detectedString
        ? heldFrequency
        : null

  const pitchFrequency = autoMode
    ? autoFrequency
    : (responsiveFrequency ?? heldFrequency)
  const targetString = autoMode ? detectedString : selectedString

  const hasDetection =
    !showChordFallback &&
    isMicActive &&
    pitchFrequency !== null &&
    targetString !== null &&
    (detectionStatus === 'unstable' ||
      detectionStatus === 'stable' ||
      detectionStatus === 'holding')

  const hasValidPitch =
    hasDetection &&
    pitchFrequency !== null &&
    isValidGuitarFrequency(pitchFrequency)

  const resolvedPitch =
    hasValidPitch && pitchFrequency !== null && targetString !== null
      ? resolveGuitarPitch(pitchFrequency, targetString)
      : null

  const displayNote = showChordFallback
    ? chordTargetString
    : autoMode
      ? (detectedString ?? '')
      : (selectedString ?? '')

  const tuningResult =
    hasValidPitch && pitchFrequency !== null && resolvedPitch !== null
      ? getTuningForString(pitchFrequency, resolvedPitch.targetFrequency)
      : null

  const actualCentsOff = tuningResult?.centsOff ?? null
  const hysteresis = updateInTuneHysteresis(
    latchedInTuneString,
    targetString,
    actualCentsOff,
    hasValidPitch,
  )

  useEffect(() => {
    if (latchedInTuneString !== hysteresis.latchedString) {
      setLatchedInTuneString(hysteresis.latchedString)
    }
  }, [hysteresis.latchedString, latchedInTuneString])

  const displayCents =
    actualCentsOff === null
      ? null
      : hysteresis.isInTune
        ? 0
        : actualToDisplayCents(actualCentsOff)

  const tuneStatus: TuneStatus =
    !isMicActive || showChordFallback
      ? 'idle'
      : hasValidPitch && tuningResult !== null
        ? hysteresis.isInTune
          ? 'in-tune'
          : actualCentsOff !== null && actualCentsOff < 0
            ? 'flat'
            : 'sharp'
        : 'listening'

  const meterPosition =
    displayCents !== null
      ? centsToMeterPercent(clampCents(displayCents))
      : 50

  return (
    <section className="tuner-display" aria-label="Guitar tuner">
      <div className="tuner-readout">
        <div className="tuner-headstock-layout">
          <p className="detected-note" aria-live="polite">
            {displayNote}
          </p>

          <GuitarHeadstock
            activeString={
              showChordFallback
                ? chordTargetString
                : autoMode
                  ? detectedString
                  : selectedString
            }
            onStringSelect={onStringSelect}
          />
        </div>

        <p
          className={`tune-status tune-status--${tuneStatus}`}
          aria-live="polite"
        >
          {tuneStatus === 'idle' ? '' : formatTuneStatus(tuneStatus)}
        </p>

        <CentsMeter
          centsOff={hasValidPitch && tuningResult !== null ? displayCents : null}
          indicatorPercent={
            hasValidPitch && tuningResult !== null ? meterPosition : null
          }
          isInTune={hysteresis.isInTune}
          hideIndicator={showChordFallback}
        />
      </div>

      {isMicActive && resolvedPitch !== null && !showChordFallback && (
        <p className="tuner-debug">
          mic {pitchFrequency?.toFixed(1) ?? '—'} Hz → {resolvedPitch.note}{' '}
          (target {resolvedPitch.targetFrequency.toFixed(1)} Hz,{' '}
          {resolvedPitch.centsOff >= 0 ? '+' : ''}
          {Math.round(resolvedPitch.centsOff)}¢)
        </p>
      )}
    </section>
  )
}
