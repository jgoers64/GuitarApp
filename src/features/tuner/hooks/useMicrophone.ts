import { useCallback, useEffect, useRef, useState } from 'react'

export type MicStatus = 'idle' | 'requesting' | 'active' | 'error'

interface UseMicrophoneResult {
  status: MicStatus
  stream: MediaStream | null
  error: string | null
  start: () => Promise<void>
  stop: () => void
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop())
}

export function useMicrophone(): UseMicrophoneResult {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const stop = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    setStream(null)
    setStatus('idle')
    setError(null)
  }, [])

  const start = useCallback(async () => {
    stopStream(streamRef.current)
    streamRef.current = null
    setStream(null)
    setStatus('requesting')
    setError(null)

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      })
      streamRef.current = mediaStream
      setStream(mediaStream)
      setStatus('active')
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Microphone access failed'
      setError(message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    return () => stopStream(streamRef.current)
  }, [])

  return { status, stream, error, start, stop }
}
