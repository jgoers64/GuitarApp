interface AutoModeToggleProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
}

export function AutoModeToggle({ enabled, onChange }: AutoModeToggleProps) {
  return (
    <div className="auto-mode-toggle">
      <span className="auto-mode-toggle__label">Auto</span>
      <button
        type="button"
        role="switch"
        className="auto-mode-toggle__switch"
        aria-checked={enabled}
        aria-label="Auto mode"
        onClick={() => onChange(!enabled)}
      >
        <span className="auto-mode-toggle__thumb" />
      </button>
    </div>
  )
}
