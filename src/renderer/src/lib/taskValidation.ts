import type { TaskRow } from '../types'

export type TaskValidationIssue = { field: string; message: string }

export function validateTask(task: TaskRow): TaskValidationIssue[] {
  const issues: TaskValidationIssue[] = []
  if (!task.name.trim()) issues.push({ field: 'name', message: 'Name is required.' })
  if (!task.brokers.trim()) {
    issues.push({ field: 'brokers', message: 'Brokers is required (e.g. all, day1, robinhood).' })
  }
  if (task.mode === 'buy' || task.mode === 'sell') {
    if (!task.tickers.trim()) {
      issues.push({ field: 'tickers', message: 'At least one ticker is required for buy/sell.' })
    }
    if (task.amount <= 0) {
      issues.push({ field: 'amount', message: 'Amount must be greater than 0.' })
    }
    if (!task.dry && task.amount > 100) {
      issues.push({ field: 'amount', message: 'Live amount > 100 shares — double-check before saving.' })
    }
  }
  return issues
}
