import { centsDifference } from '../music/frequency'

export class PitchStabilityFilter {
  private readonly readings: number[] = []
  private readonly windowSize: number
  private readonly minCount: number
  private readonly maxCents: number

  constructor(windowSize: number, minCount: number, maxCents: number) {
    this.windowSize = windowSize
    this.minCount = minCount
    this.maxCents = maxCents
  }

  add(frequency: number): number | null {
    this.readings.push(frequency)
    while (this.readings.length > this.windowSize) {
      this.readings.shift()
    }

    if (this.readings.length < this.minCount) {
      return null
    }

    const sorted = [...this.readings].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)] ?? null
    if (median === null) {
      return null
    }

    const closeCount = this.readings.filter(
      (reading) => Math.abs(centsDifference(reading, median)) <= this.maxCents,
    ).length

    return closeCount >= this.minCount ? median : null
  }

  clear(): void {
    this.readings.length = 0
  }
}
