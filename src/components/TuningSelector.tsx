import { useEffect, useState } from 'react'
import {
  BUILT_IN_TUNINGS,
  CUSTOM_NOTE_OPTIONS,
  createCustomTuning,
  formatTuningNote,
  formatTuningSummary,
  type TuningPreset,
} from '../features/tuner/tunings'

interface TuningSelectorProps {
  activeTuning: TuningPreset
  customTuning: TuningPreset | null
  onSelect: (tuning: TuningPreset) => void
  onSaveCustom: (tuning: TuningPreset) => void
}

export function TuningSelector({
  activeTuning,
  customTuning,
  onSelect,
  onSaveCustom,
}: TuningSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isEditingCustom, setIsEditingCustom] = useState(false)
  const [customName, setCustomName] = useState('My Tuning')
  const [customNotes, setCustomNotes] = useState<string[]>(
    activeTuning.strings.map((string) => string.note),
  )

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        setIsEditingCustom(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  function closeSheet() {
    setIsOpen(false)
    setIsEditingCustom(false)
  }

  function selectTuning(tuning: TuningPreset) {
    onSelect(tuning)
    closeSheet()
  }

  function beginCustomEditor() {
    const source = customTuning ?? activeTuning
    setCustomName(customTuning?.name ?? 'My Tuning')
    setCustomNotes(source.strings.map((string) => string.note))
    setIsEditingCustom(true)
  }

  function updateCustomNote(index: number, note: string) {
    setCustomNotes((current) =>
      current.map((currentNote, currentIndex) =>
        currentIndex === index ? note : currentNote,
      ),
    )
  }

  function saveCustom() {
    const tuning = createCustomTuning(customName, customNotes)
    onSaveCustom(tuning)
    closeSheet()
  }

  return (
    <div className="tuning-selector">
      <button
        type="button"
        className="tuning-selector__trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      >
        <span className="tuning-selector__trigger-copy">
          <span className="tuning-selector__trigger-name">
            {activeTuning.name}
          </span>
          <span className="tuning-selector__trigger-notes">
            {formatTuningSummary(activeTuning.strings)}
          </span>
        </span>
        <span className="tuning-selector__chevron" aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen && (
        <div
          className="tuning-sheet-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeSheet()
          }}
        >
          <section
            className="tuning-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tuning-sheet-title"
          >
            <div className="tuning-sheet__handle" aria-hidden="true" />

            <header className="tuning-sheet__header">
              <div>
                <p className="tuning-sheet__eyebrow">Guitar setup</p>
                <h2 id="tuning-sheet-title">Choose a tuning</h2>
              </div>
              <button
                type="button"
                className="tuning-sheet__close"
                onClick={closeSheet}
                aria-label="Close tuning menu"
              >
                ×
              </button>
            </header>

            {!isEditingCustom ? (
              <>
                <div className="tuning-list">
                  {BUILT_IN_TUNINGS.map((tuning) => {
                    const isActive = activeTuning.id === tuning.id
                    return (
                      <button
                        type="button"
                        className={`tuning-option${
                          isActive ? ' tuning-option--active' : ''
                        }`}
                        key={tuning.id}
                        onClick={() => selectTuning(tuning)}
                      >
                        <span>
                          <strong>{tuning.name}</strong>
                          <small>{tuning.description}</small>
                        </span>
                        <span aria-hidden="true">{isActive ? '✓' : '›'}</span>
                      </button>
                    )
                  })}

                  {customTuning !== null && (
                    <button
                      type="button"
                      className={`tuning-option${
                        activeTuning.id === 'custom'
                          ? ' tuning-option--active'
                          : ''
                      }`}
                      onClick={() => selectTuning(customTuning)}
                    >
                      <span>
                        <strong>{customTuning.name}</strong>
                        <small>{customTuning.description}</small>
                      </span>
                      <span aria-hidden="true">
                        {activeTuning.id === 'custom' ? '✓' : '›'}
                      </span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="custom-tuning-button"
                  onClick={beginCustomEditor}
                >
                  <span aria-hidden="true">＋</span>
                  {customTuning === null
                    ? 'Create custom tuning'
                    : 'Edit custom tuning'}
                </button>
              </>
            ) : (
              <div className="custom-tuning-editor">
                <label className="custom-tuning-editor__name">
                  <span>Name</span>
                  <input
                    type="text"
                    maxLength={24}
                    value={customName}
                    onChange={(event) => setCustomName(event.target.value)}
                    placeholder="My Tuning"
                  />
                </label>

                <div className="custom-tuning-editor__strings">
                  {customNotes.map((note, index) => (
                    <label key={`${index}-${note}`}>
                      <span>String {6 - index}</span>
                      <select
                        value={note}
                        onChange={(event) =>
                          updateCustomNote(index, event.target.value)
                        }
                      >
                        {CUSTOM_NOTE_OPTIONS.map((option) => (
                          <option value={option} key={option}>
                            {formatTuningNote(option)}
                            {option.match(/-?\d+$/)?.[0] ?? ''}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>

                <p className="custom-tuning-editor__preview">
                  {customNotes.map(formatTuningNote).join(' ')}
                </p>

                <div className="custom-tuning-editor__actions">
                  <button
                    type="button"
                    className="custom-tuning-editor__cancel"
                    onClick={() => setIsEditingCustom(false)}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    className="custom-tuning-editor__save"
                    onClick={saveCustom}
                  >
                    Save tuning
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
