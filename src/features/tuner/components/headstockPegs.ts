import type { GuitarStringLabel } from '../utils/noteUtils'

/**
 * Vertical center of each tuning key (% of headstock image height).
 * Left: D (top), A, E (bottom). Right: G (top), B, e (bottom).
 */
export const HEADSTOCK_PEGS: {
  label: GuitarStringLabel
  top: string
  side: 'left' | 'right'
}[] = [
  { label: 'D', top: '21%', side: 'left' },
  { label: 'A', top: '39.5%', side: 'left' },
  { label: 'E', top: '57.5%', side: 'left' },
  { label: 'G', top: '21%', side: 'right' },
  { label: 'B', top: '39.5%', side: 'right' },
  { label: 'e', top: '57.5%', side: 'right' },
]
