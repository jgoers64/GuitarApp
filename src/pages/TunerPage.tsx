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

  const { status, stream, error, start, stop } = useMicrophone()
  const {
    responsiveFrequency,
    detectedString,
    heldFrequency,
    status: detectionStatus,
  } = usePitchDetection({
    stream,
    enabled: status === 'active',
  })

  const isActive = status === 'active'
  const isRequesting = status === 'requesting'

  useEffect(() => {
    let resumeTimer: number | null = null

    const clearResumeTimer = () => {
      if (resumeTimer !== null) {
        window.clearTimeout(resumeTimer)
        resumeTimer = null
      }
    }

    const resumeTuner = () => {
      clearResumeTimer()

      if (document.visibilityState !== 'visible') {
        return
      }

      // iOS may need a short moment to reactivate audio after the standalone
      // app returns from the Home Screen.
      resumeTimer = window.setTimeout(() => {
        resumeTimer = null
        void start()
      }, 150)
    }

    const suspendTuner = () => {
      clearResumeTimer()
      stop()
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        suspendTuner()
      } else {
        resumeTuner()
      }
    }

    resumeTuner()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', resumeTuner)
    window.addEventListener('pagehide', suspendTuner)

    return () => {
      clearResumeTimer()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', resumeTuner)
      window.removeEventListener('pagehide', suspendTuner)
      stop()
    }
  }, [start, stop])

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
          detectionStatus={detectionStatus}
          isMicActive={isActive}
          autoMode={autoMode}
          selectedString={selectedString}
          onStringSelect={handleStringSelect}
        />

        {!isActive && (
          <button
            type="button"
            className="mic-toggle"
            onClick={() => void start()}
            disabled={isRequesting}
          >
            {isRequesting ? 'Starting…' : 'Resume Tuner'}
          </button>
        )}
      </main>
    </>
  )
}
