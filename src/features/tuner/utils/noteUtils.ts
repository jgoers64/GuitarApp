export function formatFrequency(hz: number | null): string {
  if (hz === null) return '—'
  return `${hz.toFixed(1)} Hz`
}

export function formatNote(note: string | null): string {
  return note ?? '—'
}

export function formatCents(cents: number | null): string {
  if (cents === null) return '—'
  const sign = cents > 0 ? '+' : ''
  return `${sign}${cents.toFixed(0)}¢`
}
