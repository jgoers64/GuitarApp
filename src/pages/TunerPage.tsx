import { useEffect, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { TunerDisplay } from '../features/tuner/components/TunerDisplay'
import { useMicrophone } from '../features/tuner/hooks/useMicrophone'
import { usePitchDetection } from '../features/tuner/hooks/usePitchDetection'
import type { GuitarStringLabel } from '../features/tuner/utils/noteUtils'

export function TunerPage() {
  const [autoMode, setAutoMode] = useState(true)
  const [selectedString, setSelectedString] = useState<GuitarStringLabel | null>(
    null,
  )

  const { status, stream, error, start } = useMicrophone()
  const {
    responsiveFrequency,
    detectedString,
    heldFrequency,
    chordTargetString,
    isChordFallback,
    status: detectionStatus,
  } = usePitchDetection({
    stream,
    enabled: status === 'active',
  })

  const isActive = status === 'active'

  useEffect(() => {
    void start()
  }, [start])

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
          responsiveFrequency={responsiveFrequency}
          detectedString={detectedString}
          heldFrequency={heldFrequency}
          chordTargetString={chordTargetString}
          isChordFallback={isChordFallback}
          detectionStatus={detectionStatus}
          isMicActive={isActive}
          autoMode={autoMode}
          selectedString={selectedString}
          onStringSelect={handleStringSelect}
        />
      </main>
    </>
  )
}
