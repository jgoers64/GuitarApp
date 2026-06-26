import headstockImage from '../../../assets/headstock.png'
import { playReferenceTone } from '../../../lib/audio'
import {
  formatTuningNote,
  getTuningStringByLabel,
  type TuningStringTarget,
} from '../tunings'
import type { GuitarStringLabel } from '../utils/noteUtils'
import { HEADSTOCK_PEGS } from './headstockPegs'

interface GuitarHeadstockProps {
  activeString: GuitarStringLabel | null
  tuningStrings: readonly TuningStringTarget[]
  onStringSelect: (label: GuitarStringLabel) => void
}

const LEFT_PEGS = HEADSTOCK_PEGS.filter((peg) => peg.side === 'left')
const RIGHT_PEGS = HEADSTOCK_PEGS.filter((peg) => peg.side === 'right')

function PegButton({
  label,
  top,
  activeString,
  tuningStrings,
  onStringSelect,
}: {
  label: GuitarStringLabel
  top: string
  activeString: GuitarStringLabel | null
  tuningStrings: readonly TuningStringTarget[]
  onStringSelect: (label: GuitarStringLabel) => void
}) {
  const target = getTuningStringByLabel(label, tuningStrings)
  const displayNote = formatTuningNote(target.note)

  return (
    <button
      type="button"
      className={`string-btn string-btn--peg${
        activeString === label ? ' string-btn--active' : ''
      }`}
      style={{ top }}
      onClick={() => {
        void playReferenceTone(target.frequency)
        onStringSelect(label)
      }}
      aria-pressed={activeString === label}
      aria-label={`String tuned to ${target.note}`}
    >
      {displayNote}
    </button>
  )
}

export function GuitarHeadstock({
  activeString,
  tuningStrings,
  onStringSelect,
}: GuitarHeadstockProps) {
  return (
    <div className="headstock-stage">
      <div className="headstock-side headstock-side--left">
        {LEFT_PEGS.map(({ label, top }) => (
          <PegButton
            key={label}
            label={label}
            top={top}
            activeString={activeString}
            tuningStrings={tuningStrings}
            onStringSelect={onStringSelect}
          />
        ))}
      </div>

      <img
        className="guitar-headstock"
        src={headstockImage}
        alt=""
        aria-hidden="true"
        draggable={false}
      />

      <div className="headstock-side headstock-side--right">
        {RIGHT_PEGS.map(({ label, top }) => (
          <PegButton
            key={label}
            label={label}
            top={top}
            activeString={activeString}
            tuningStrings={tuningStrings}
            onStringSelect={onStringSelect}
          />
        ))}
      </div>
    </div>
  )
}
