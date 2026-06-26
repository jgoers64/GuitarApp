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

const HTTPS_REQUIRED_MESSAGE =
  'Microphone access requires HTTPS. Deploy the app or open it from a secure URL.'

function getMicrophoneAvailabilityError(): string | null {
  if (!window.isSecureContext) {
    return HTTPS_REQUIRED_MESSAGE
  }
  if (!navigator.mediaDevices) {
    return HTTPS_REQUIRED_MESSAGE
  }
  if (typeof navigator.mediaDevices.getUserMedia !== 'function') {
    return HTTPS_REQUIRED_MESSAGE
  }
  return null
}

export function useMicrophone(): UseMicrophoneResult {
  const [status, setStatus] = useState<MicStatus>('idle')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const requestIdRef = useRef(0)

  const stop = useCallback(() => {
    requestIdRef.current += 1

    const currentStream = streamRef.current
    streamRef.current = null
    stopStream(currentStream)

    setStream(null)
    setStatus('idle')
    setError(null)
  }, [])

  const start = useCallback(async () => {
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId

    const previousStream = streamRef.current
    streamRef.current = null
    stopStream(previousStream)

    setStream(null)
    setStatus('requesting')
    setError(null)

    const availabilityError = getMicrophoneAvailabilityError()
    if (availabilityError !== null) {
      if (requestId === requestIdRef.current) {
        setError(availabilityError)
        setStatus('error')
      }
      return
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })

      if (
        requestId !== requestIdRef.current ||
        document.visibilityState === 'hidden'
      ) {
        stopStream(mediaStream)
        return
      }

      const handleTrackEnded = () => {
        if (streamRef.current !== mediaStream) {
          return
        }

        requestIdRef.current += 1
        streamRef.current = null
        setStream(null)
        setStatus('idle')
      }

      mediaStream
        .getAudioTracks()
        .forEach((track) => track.addEventListener('ended', handleTrackEnded))

      streamRef.current = mediaStream
      setStream(mediaStream)
      setStatus('active')
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return
      }

      const message =
        err instanceof Error ? err.message : 'Microphone access failed'
      setError(message)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
      const currentStream = streamRef.current
      streamRef.current = null
      stopStream(currentStream)
    }
  }, [])

  return { status, stream, error, start, stop }
}
