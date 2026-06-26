import type { TuningPreset } from '../features/tuner/tunings'
import { AppVersion } from './AppVersion'
import { AutoModeToggle } from './AutoModeToggle'
import { TuningSelector } from './TuningSelector'

interface AppHeaderProps {
  autoMode: boolean
  activeTuning: TuningPreset
  customTuning: TuningPreset | null
  onAutoModeChange: (enabled: boolean) => void
  onTuningSelect: (tuning: TuningPreset) => void
  onCustomTuningSave: (tuning: TuningPreset) => void
}

export function AppHeader({
  autoMode,
  activeTuning,
  customTuning,
  onAutoModeChange,
  onTuningSelect,
  onCustomTuningSave,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__left">
        <TuningSelector
          activeTuning={activeTuning}
          customTuning={customTuning}
          onSelect={onTuningSelect}
          onSaveCustom={onCustomTuningSave}
        />
      </div>

      <div className="app-header__right">
        <AppVersion />
        <AutoModeToggle enabled={autoMode} onChange={onAutoModeChange} />
      </div>
    </header>
  )
}
