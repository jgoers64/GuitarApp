import { CENTS_METER_RANGE, formatIndicatorCents } from '../utils/noteUtils'

interface CentsMeterProps {
  centsOff: number | null
  indicatorPercent: number | null
  isInTune: boolean
}

export function CentsMeter({
  centsOff,
  indicatorPercent,
  isInTune,
}: CentsMeterProps) {
  const left = `${indicatorPercent ?? 50}%`
  const label =
    centsOff !== null
      ? isInTune
        ? '✓'
        : formatIndicatorCents(centsOff)
      : null

  return (
    <div className="cents-meter" aria-label="Cents deviation meter">
      <div className="cents-meter__track">
        <div className="cents-meter__center-line" aria-hidden="true" />
        <div
          className="cents-meter__indicator"
          style={{ left }}
          aria-hidden={label === null}
        >
          {label !== null && (
            <span className="cents-meter__indicator-label">{label}</span>
          )}
        </div>
      </div>
      <div className="cents-meter__labels" aria-hidden="true">
        <span>-{CENTS_METER_RANGE}</span>
        <span>0</span>
        <span>+{CENTS_METER_RANGE}</span>
      </div>
    </div>
  )
}
