import { TunerDisplay } from '../features/tuner/components/TunerDisplay'
import { useMicrophone } from '../features/tuner/hooks/useMicrophone'
import { usePitchDetection } from '../features/tuner/hooks/usePitchDetection'

export function TunerPage() {
  const { status, stream, error, start, stop } = useMicrophone()
  const { frequency, isListening, confidence, statusMessage } =
    usePitchDetection({
      stream,
      enabled: status === 'active',
    })

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

      <p className="pitch-status">
        {statusMessage}
        {isListening && confidence !== null && (
          <> ({Math.round(confidence * 100)}% confidence)</>
        )}
      </p>

      <TunerDisplay frequency={frequency} note={null} centsOff={null} />
    </main>
  )
}
