/** Fallback when PyPI fetch fails; update via upstream sync checklist. */
export const FALLBACK_LATEST_AUTORSA = '2.1.0'

export const MAX_RUN_HISTORY = 50
export const MAX_HOLDINGS_SNAPSHOTS = 20
export const MAX_DELETED_BACKUP = 10
export const MAX_TASK_TEMPLATES = 50

export const COMMON_TICKERS = [
  'aapl',
  'msft',
  'goog',
  'googl',
  'amzn',
  'nvda',
  'meta',
  'tsla',
  'spy',
  'qqq',
  'vti',
  'brk.b',
  'jpm',
  'v',
  'unh'
] as const
