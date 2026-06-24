import { TunerDisplay } from '../features/tuner/components/TunerDisplay'
import { useMicrophone } from '../features/tuner/hooks/useMicrophone'

export function TunerPage() {
  const { status, error, start, stop } = useMicrophone()

  const isActive = status === 'active'
  const isRequesting = status === 'requesting'

  function handleToggle() {
    if (isActive) {
      stop()
    } else {
      void start()
    }
  }

  return (
    <main className="tuner-page">
      <h1>Guitar Tuner</h1>

      <button
        type="button"
        onClick={handleToggle}
        disabled={isRequesting}
      >
        {isActive ? 'Stop Tuner' : 'Start Tuner'}
      </button>

      <p className="mic-status">
        Mic status: <span>{status}</span>
      </p>

      {error !== null && <p className="mic-error">{error}</p>}

      <TunerDisplay frequency={null} note={null} centsOff={null} />
    </main>
  )
}
