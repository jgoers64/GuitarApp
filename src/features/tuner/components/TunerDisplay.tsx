import {
  formatCents,
  formatFrequency,
  formatNote,
} from '../utils/noteUtils'

interface TunerDisplayProps {
  frequency: number | null
  note: string | null
  centsOff: number | null
}

export function TunerDisplay({
  frequency,
  note,
  centsOff,
}: TunerDisplayProps) {
  return (
    <section className="tuner-display" aria-label="Tuner readout">
      <dl>
        <div>
          <dt>Frequency</dt>
          <dd>{formatFrequency(frequency)}</dd>
        </div>
        <div>
          <dt>Note</dt>
          <dd>{formatNote(note)}</dd>
        </div>
        <div>
          <dt>Cents off</dt>
          <dd>{formatCents(centsOff)}</dd>
        </div>
      </dl>
    </section>
  )
}
