export class DisplayHold {
  private heldFrequency: number | null = null
  private lastStableAt = 0
  private readonly holdDurationMs: number

  constructor(holdDurationMs: number) {
    this.holdDurationMs = holdDurationMs
  }

  update(
    stableFrequency: number | null,
    timestamp: number,
  ): { frequency: number | null; isHolding: boolean } {
    if (stableFrequency !== null) {
      this.heldFrequency = stableFrequency
      this.lastStableAt = timestamp
      return { frequency: stableFrequency, isHolding: false }
    }

    if (
      this.heldFrequency !== null &&
      timestamp - this.lastStableAt <= this.holdDurationMs
    ) {
      return { frequency: this.heldFrequency, isHolding: true }
    }

    this.heldFrequency = null
    return { frequency: null, isHolding: false }
  }

  reset(): void {
    this.heldFrequency = null
    this.lastStableAt = 0
  }
}
