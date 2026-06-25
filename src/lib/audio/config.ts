/** Tunable detection pipeline settings */
export const AUDIO_CONFIG = {
  /** Boost mic input — raise for quiet unplugged electric guitar */
  INPUT_GAIN: 8,
  /** Smaller analysis window reduces phone latency while still covering E2. */
  FFT_SIZE: 4096,
  HIGH_PASS_HZ: 20,
  LOW_PASS_HZ: 1200,
  /** Only run pitch detection when RMS exceeds this value */
  RMS_GATE_THRESHOLD: 0.0035,
  /** Allow a substantially flat low E string to remain detectable. */
  MIN_FREQUENCY_HZ: 45,
  MAX_FREQUENCY_HZ: 1000,
  MIN_PITCH_CONFIDENCE: 0.65,
  STABILITY_WINDOW_SIZE: 6,
  STABILITY_MIN_COUNT: 3,
  STABILITY_MAX_CENTS: 18,
  HOLD_DURATION_MS: 1250,
} as const
