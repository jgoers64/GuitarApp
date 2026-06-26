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
  detectionStatus: TunerDetectionStatus
  isMicActive: boolean
  autoMode: boolean
  selectedString: GuitarStringLabel | null
  onStringSelect: (label: GuitarStringLabel) => void
}

const MAX_RELIABLE_AUTO_CENTS = 250

export function TunerDisplay({
  responsiveFrequency,
  detectedString,
  heldFrequency,
  detectionStatus,
  isMicActive,
  autoMode,
  selectedString,
  onStringSelect,
}: TunerDisplayProps) {
  const [latchedInTuneString, setLatchedInTuneString] =
    useState<GuitarStringLabel | null>(null)
  const [lastReliableString, setLastReliableString] =
    useState<GuitarStringLabel | null>(null)

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

  const rawPitchFrequency = autoMode
    ? autoFrequency
    : (responsiveFrequency ?? heldFrequency)
  const rawTargetString = autoMode ? detectedString : selectedString

  const rawHasDetection =
    isMicActive &&
    rawPitchFrequency !== null &&
    rawTargetString !== null &&
    (detectionStatus === 'unstable' ||
      detectionStatus === 'stable' ||
      detectionStatus === 'holding')

  const rawHasValidPitch =
    rawHasDetection &&
    rawPitchFrequency !== null &&
    isValidGuitarFrequency(rawPitchFrequency)

  const rawResolvedPitch =
    rawHasValidPitch &&
    rawPitchFrequency !== null &&
    rawTargetString !== null
      ? resolveGuitarPitch(rawPitchFrequency, rawTargetString)
      : null

  const rawTuningResult =
    rawHasValidPitch &&
    rawPitchFrequency !== null &&
    rawResolvedPitch !== null
      ? getTuningForString(
          rawPitchFrequency,
          rawResolvedPitch.targetFrequency,
        )
      : null

  const rawActualCents = rawTuningResult?.centsOff ?? null
  const rawReadingIsReliable =
    autoMode &&
    rawTargetString !== null &&
    rawActualCents !== null &&
    Math.abs(rawActualCents) <= MAX_RELIABLE_AUTO_CENTS

  useEffect(() => {
    if (!autoMode || !isMicActive) {
      if (lastReliableString !== null) {
        setLastReliableString(null)
      }
      return
    }

    if (
      rawReadingIsReliable &&
      rawTargetString !== null &&
      lastReliableString !== rawTargetString
    ) {
      setLastReliableString(rawTargetString)
    }
  }, [
    autoMode,
    isMicActive,
    lastReliableString,
    rawReadingIsReliable,
    rawTargetString,
  ])

  const suspiciousExtremeSwitch =
    autoMode &&
    lastReliableString !== null &&
    rawTargetString !== null &&
    rawTargetString !== lastReliableString &&
    rawActualCents !== null &&
    Math.abs(rawActualCents) > MAX_RELIABLE_AUTO_CENTS

  const useLiveReading = rawHasValidPitch && !suspiciousExtremeSwitch
  const pitchFrequency = useLiveReading ? rawPitchFrequency : null
  const targetString = autoMode
    ? useLiveReading
      ? rawTargetString
      : (lastReliableString ?? rawTargetString)
    : selectedString

  const hasValidPitch =
    useLiveReading &&
    pitchFrequency !== null &&
    targetString !== null &&
    isValidGuitarFrequency(pitchFrequency)

  const resolvedPitch =
    hasValidPitch && pitchFrequency !== null && targetString !== null
      ? resolveGuitarPitch(pitchFrequency, targetString)
      : null

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

  const tuneStatus: TuneStatus = !isMicActive || !useLiveReading
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
            {targetString ?? ''}
          </p>

          <GuitarHeadstock
            activeString={targetString}
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
          hideIndicator={!useLiveReading}
        />
      </div>

      {isMicActive && resolvedPitch !== null && useLiveReading && (
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
