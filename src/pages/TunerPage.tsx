import { useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { TunerDisplay } from '../features/tuner/components/TunerDisplay'
import { useMicrophone } from '../features/tuner/hooks/useMicrophone'
import { usePitchDetection } from '../features/tuner/hooks/usePitchDetection'
import type { GuitarStringLabel } from '../features/tuner/utils/noteUtils'
import { ensureAudioRunning } from '../lib/audio'

export function TunerPage() {
  const [autoMode, setAutoMode] = useState(true)
  const [selectedString, setSelectedString] = useState<GuitarStringLabel | null>(
    null,
  )

  const { status, stream, error, start, stop } = useMicrophone()
  const {
    stableFrequency,
    heldFrequency,
    status: detectionStatus,
  } = usePitchDetection({
    stream,
    enabled: status === 'active',
  })

  const isActive = status === 'active'
  const isRequesting = status === 'requesting'

  function handleAutoModeChange(enabled: boolean) {
    setAutoMode(enabled)
    if (enabled) {
      setSelectedString(null)
    }
  }

  function handleStringSelect(label: GuitarStringLabel) {
    setSelectedString(label)
    setAutoMode(false)
  }

  function handleToggle() {
    if (isActive) {
      stop()
    } else {
      void ensureAudioRunning()
      void start()
    }
  }

  return (
    <>
      <AppHeader autoMode={autoMode} onAutoModeChange={handleAutoModeChange} />

      <main className="tuner-page">
        {error !== null && (
          <p className="mic-error" role="alert">
            {error}
          </p>
        )}

        <TunerDisplay
          stableFrequency={stableFrequency}
          heldFrequency={heldFrequency}
          detectionStatus={detectionStatus}
          isMicActive={isActive}
          autoMode={autoMode}
          selectedString={selectedString}
          onStringSelect={handleStringSelect}
        />

        <button
          type="button"
          className="mic-toggle"
          onClick={handleToggle}
          disabled={isRequesting}
        >
          {isRequesting ? 'Starting…' : isActive ? 'Stop' : 'Start Tuner'}
        </button>
      </main>
    </>
  )
}
