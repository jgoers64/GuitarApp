import type { GuitarStringLabel } from '../utils/noteUtils'

export interface ChordDisplaySnapshot {
  active: boolean
  targetString: GuitarStringLabel | null
}

const ENTER_CONFIRM_SCANS = 2
const SWITCH_CONFIRM_SCANS = 2
const EXIT_CONFIRM_SCANS = 3

export class ChordNoteTracker {
  private active = false
  private targetString: GuitarStringLabel | null = null
  private pendingTarget: GuitarStringLabel | null = null
  private pendingScans = 0
  private exitScans = 0

  reset(): void {
    this.active = false
    this.targetString = null
    this.pendingTarget = null
    this.pendingScans = 0
    this.exitScans = 0
  }

  process(
    candidate: GuitarStringLabel | null,
    shouldActivate: boolean,
  ): ChordDisplaySnapshot {
    if (!shouldActivate || candidate === null) {
      this.pendingTarget = null
      this.pendingScans = 0

      if (this.active) {
        this.exitScans += 1
        if (this.exitScans >= EXIT_CONFIRM_SCANS) {
          this.reset()
        }
      }

      return this.snapshot()
    }

    this.exitScans = 0

    if (this.active && this.targetString === candidate) {
      this.pendingTarget = null
      this.pendingScans = 0
      return this.snapshot()
    }

    if (this.pendingTarget === candidate) {
      this.pendingScans += 1
    } else {
      this.pendingTarget = candidate
      this.pendingScans = 1
    }

    const requiredScans = this.active
      ? SWITCH_CONFIRM_SCANS
      : ENTER_CONFIRM_SCANS

    if (this.pendingScans >= requiredScans) {
      this.active = true
      this.targetString = candidate
      this.pendingTarget = null
      this.pendingScans = 0
    }

    return this.snapshot()
  }

  private snapshot(): ChordDisplaySnapshot {
    return {
      active: this.active,
      targetString: this.targetString,
    }
  }
}
