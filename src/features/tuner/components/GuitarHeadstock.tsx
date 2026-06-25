import headstockImage from '../../../assets/headstock.png'
import { playStringReference } from '../../../lib/audio'
import type { GuitarStringLabel } from '../utils/noteUtils'
import { HEADSTOCK_PEGS } from './headstockPegs'

interface GuitarHeadstockProps {
  activeString: GuitarStringLabel | null
  onStringSelect: (label: GuitarStringLabel) => void
}

const LEFT_PEGS = HEADSTOCK_PEGS.filter((peg) => peg.side === 'left')
const RIGHT_PEGS = HEADSTOCK_PEGS.filter((peg) => peg.side === 'right')

function PegButton({
  label,
  top,
  activeString,
  onStringSelect,
}: {
  label: GuitarStringLabel
  top: string
  activeString: GuitarStringLabel | null
  onStringSelect: (label: GuitarStringLabel) => void
}) {
  return (
    <button
      type="button"
      className={`string-btn string-btn--peg${
        activeString === label ? ' string-btn--active' : ''
      }`}
      style={{ top }}
      onClick={() => {
        void playStringReference(label)
        onStringSelect(label)
      }}
      aria-pressed={activeString === label}
      aria-label={`${label === 'E' ? 'Low E' : label === 'e' ? 'High e' : label} string`}
    >
      {label}
    </button>
  )
}

export function GuitarHeadstock({
  activeString,
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
            onStringSelect={onStringSelect}
          />
        ))}
      </div>
    </div>
  )
}
