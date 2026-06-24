import { useEffect, useState } from 'react'
import { detectPitch } from '../../../lib/audio'

interface UsePitchDetectionOptions {
  stream: MediaStream | null
  enabled: boolean
}

interface UsePitchDetectionResult {
  frequency: number | null
  isListening: boolean
  confidence: number | null
  statusMessage: string
}

const CONFIDENCE_THRESHOLD = 0.45
const INPUT_GAIN = 5
const FFT_SIZE = 4096

function getStatusMessage(
  isListening: boolean,
  frequency: number | null,
  confidence: number | null,
): string {
  if (!isListening) {
    return 'Pitch detection inactive'
  }
  if (frequency === null) {
    return 'Listening — play a note'
  }
  if (confidence !== null && confidence < CONFIDENCE_THRESHOLD) {
    return 'Weak signal — try playing louder'
  }
  return 'Pitch detected'
}

export function usePitchDetection({
  stream,
  enabled,
}: UsePitchDetectionOptions): UsePitchDetectionResult {
  const [frequency, setFrequency] = useState<number | null>(null)
  const [confidence, setConfidence] = useState<number | null>(null)
  const [isListening, setIsListening] = useState(false)

  const isActive = enabled && stream !== null

  useEffect(() => {
    if (!isActive) {
      return
    }

    let animationFrameId = 0
    let audioContext: AudioContext | null = null
    let cancelled = false

    const startDetection = async () => {
      audioContext = new AudioContext()
      await audioContext.resume()

      if (cancelled) {
        await audioContext.close()
        return
      }

      const source = audioContext.createMediaStreamSource(stream)
      const gain = audioContext.createGain()
      gain.gain.value = INPUT_GAIN
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = FFT_SIZE
      source.connect(gain)
      gain.connect(analyser)

      const buffer = new Float32Array(analyser.fftSize)
      const sampleRate = audioContext.sampleRate
      setIsListening(true)

      const analyze = () => {
        analyser.getFloatTimeDomainData(buffer)
        const result = detectPitch(buffer, sampleRate)

        setFrequency(result.frequency)
        setConfidence(result.confidence > 0 ? result.confidence : null)
        animationFrameId = requestAnimationFrame(analyze)
      }

      animationFrameId = requestAnimationFrame(analyze)
    }

    void startDetection()

    return () => {
      cancelled = true
      cancelAnimationFrame(animationFrameId)
      setIsListening(false)
      setFrequency(null)
      setConfidence(null)
      void audioContext?.close()
    }
  }, [isActive, stream])

  const activeFrequency = isActive ? frequency : null
  const activeConfidence = isActive ? confidence : null
  const activeListening = isActive && isListening
  const statusMessage = getStatusMessage(
    activeListening,
    activeFrequency,
    activeConfidence,
  )

  return {
    frequency: activeFrequency,
    isListening: activeListening,
    confidence: activeConfidence,
    statusMessage,
  }
}
