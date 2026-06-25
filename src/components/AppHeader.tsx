import { AppVersion } from './AppVersion'
import { AutoModeToggle } from './AutoModeToggle'

interface AppHeaderProps {
  autoMode: boolean
  onAutoModeChange: (enabled: boolean) => void
}

export function AppHeader({ autoMode, onAutoModeChange }: AppHeaderProps) {
  return (
    <header className="app-header">
      <AppVersion />
      <AutoModeToggle enabled={autoMode} onChange={onAutoModeChange} />
    </header>
  )
}
