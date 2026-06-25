import type {
  ChordNoteResult,
  ChromaticNoteName,
} from '../../../lib/audio/detectChordNote'

export interface ChordDisplaySnapshot {
  active: boolean
  note: ChromaticNoteName | null
}

const SWITCH_CONFIRM_SCANS = 3
const EXIT_CONFIRM_SCANS = 4

export class ChordNoteTracker {
  private active = false
  private note: ChromaticNoteName | null = null
  private pendingNote: ChromaticNoteName | null = null
  private pendingScans = 0
  private exitScans = 0

  reset(): void {
    this.active = false
    this.note = null
    this.pendingNote = null
    this.pendingScans = 0
    this.exitScans = 0
  }

  process(result: ChordNoteResult): ChordDisplaySnapshot {
    if (!result.isChordLike || result.note === null) {
      if (this.active) {
        this.exitScans += 1
        if (this.exitScans >= EXIT_CONFIRM_SCANS) {
          this.reset()
        }
      }

      return this.snapshot()
    }

    this.exitScans = 0

    if (!this.active || this.note === null) {
      this.active = true
      this.note = result.note
      this.pendingNote = null
      this.pendingScans = 0
      return this.snapshot()
    }

    if (result.note === this.note) {
      this.pendingNote = null
      this.pendingScans = 0
      return this.snapshot()
    }

    if (this.pendingNote === result.note) {
      this.pendingScans += 1
    } else {
      this.pendingNote = result.note
      this.pendingScans = 1
    }

    if (this.pendingScans >= SWITCH_CONFIRM_SCANS) {
      this.note = result.note
      this.pendingNote = null
      this.pendingScans = 0
    }

    return this.snapshot()
  }

  private snapshot(): ChordDisplaySnapshot {
    return {
      active: this.active,
      note: this.note,
    }
  }
}
