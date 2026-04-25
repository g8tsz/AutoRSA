/** Keeps the last `max` characters; adds a one-line note when older output is dropped. */
export function trimLogEnd(s: string, max: number): string {
  if (max <= 0) return s
  if (s.length <= max) return s
  const overflow = s.length - max
  const head = 72
  const keep = max - head
  return `… [dropped ${overflow} characters] …\n` + s.slice(s.length - keep)
}
