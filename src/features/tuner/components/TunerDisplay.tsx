import type { TunerDetectionStatus } from '../hooks/usePitchDetection'
import {
  actualToDisplayCents,
  centsToMeterPercent,
  clampCents,
  formatTuneStatus,
  getStringByLabel,
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
  rawFrequency: number | null
  detectedString: GuitarStringLabel | null
  heldFrequency: number | null
  liveFrequency: number | null
  detectionStatus: TunerDetectionStatus
  isMicActive: boolean
  autoMode: boolean
  selectedString: GuitarStringLabel | null
  onStringSelect: (label: GuitarStringLabel) => void
}

export function TunerDisplay({
  rawFrequency,
  detectedString,
  heldFrequency,
  liveFrequency,
  detectionStatus,
  isMicActive,
  autoMode,
  selectedString,
  onStringSelect,
}: TunerDisplayProps) {
  const pitchFrequency = rawFrequency ?? heldFrequency ?? liveFrequency
  const activeString = autoMode ? detectedString : selectedString

  const hasManualDetection =
    isMicActive &&
    pitchFrequency !== null &&
    (detectionStatus === 'stable' || detectionStatus === 'holding')

  const hasAutoDetection =
    isMicActive &&
    pitchFrequency !== null &&
    activeString !== null &&
    (detectionStatus === 'stable' || detectionStatus === 'holding')

  const hasDetection = autoMode ? hasAutoDetection : hasManualDetection

  const hasValidPitch =
    hasDetection &&
    pitchFrequency !== null &&
    isValidGuitarFrequency(pitchFrequency)

  const resolvedPitch =
    hasValidPitch && pitchFrequency !== null
      ? resolveGuitarPitch(
          pitchFrequency,
          autoMode ? activeString : selectedString,
        )
      : null

  const displayNote = autoMode
    ? (resolvedPitch?.label ?? '—')
    : (selectedString ?? '—')

  const tuningResult =
    hasValidPitch &&
    pitchFrequency !== null &&
    resolvedPitch !== null &&
    (autoMode ? activeString !== null : selectedString !== null)
      ? getTuningForString(
          pitchFrequency,
          getStringByLabel(
            autoMode ? activeString! : selectedString!,
          ).frequency,
        )
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
            activeString={autoMode ? resolvedPitch?.label ?? null : selectedString}
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
