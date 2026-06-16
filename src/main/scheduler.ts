import type { BrowserWindow } from 'electron'
import type { ScheduledJob } from '../shared/types'

let timer: ReturnType<typeof setInterval> | null = null

function parseDailyTime(t: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return { h, m: min }
}

function isJobDue(job: ScheduledJob, now: Date): boolean {
  if (!job.enabled) return false
  if (job.scheduleType === 'interval') {
    const mins = job.intervalMinutes ?? 0
    if (mins <= 0) return false
    if (!job.lastRunAt) return true
    const last = new Date(job.lastRunAt).getTime()
    return now.getTime() - last >= mins * 60_000
  }
  const daily = parseDailyTime(job.dailyTime ?? '')
  if (!daily) return false
  const lastKey = job.lastRunAt ? job.lastRunAt.slice(0, 10) : ''
  const todayKey = now.toISOString().slice(0, 10)
  if (lastKey === todayKey) return false
  return now.getHours() === daily.h && now.getMinutes() === daily.m
}

export function startSchedulePoller(
  getJobs: () => ScheduledJob[],
  getWindow: () => BrowserWindow | null,
  onDue: (jobId: string) => void
): void {
  if (timer) clearInterval(timer)
  timer = setInterval(() => {
    const win = getWindow()
    if (!win) return
    const now = new Date()
    for (const job of getJobs()) {
      if (isJobDue(job, now)) {
        onDue(job.id)
      }
    }
  }, 30_000)
}

export function stopSchedulePoller(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
