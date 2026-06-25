import type { TunerDetectionStatus } from '../hooks/usePitchDetection'
import {
  actualToDisplayCents,
  centsToMeterPercent,
  clampCents,
  formatTuneStatus,
  getTuningForString,
  getTuneStatus,
  isValidGuitarFrequency,
  resolveGuitarPitch,
  type GuitarStringLabel,
  type TuneStatus,
} from '../utils/noteUtils'
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
  // The meter follows the fast-smoothed pitch while the target string uses
  // short confirmation, preventing a one-frame harmonic from changing notes.
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

  const displayNote = autoMode
    ? (detectedString ?? '—')
    : (selectedString ?? '—')

  const tuningResult =
    hasValidPitch && pitchFrequency !== null && resolvedPitch !== null
      ? getTuningForString(pitchFrequency, resolvedPitch.targetFrequency)
      : null

  const actualCentsOff = tuningResult?.centsOff ?? null
  const displayCents =
    actualCentsOff !== null ? actualToDisplayCents(actualCentsOff) : null
  const tuneStatus: TuneStatus = !isMicActive
    ? 'idle'
    : hasValidPitch && tuningResult !== null
      ? getTuneStatus(actualCentsOff)
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
            activeString={autoMode ? detectedString : selectedString}
            onStringSelect={onStringSelect}
          />
        </div>

        <p
          className={`tune-status tune-status--${tuneStatus}`}
          aria-live="polite"
        >
          {formatTuneStatus(tuneStatus)}
        </p>

        <CentsMeter
          centsOff={hasValidPitch && tuningResult !== null ? displayCents : null}
          indicatorPercent={
            hasValidPitch && tuningResult !== null ? meterPosition : null
          }
        />
      </div>

      {isMicActive && resolvedPitch !== null && (
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
