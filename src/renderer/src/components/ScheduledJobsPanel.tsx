import { useState } from 'react'
import type { ScheduledJob, Store } from '../types'

function newId(): string {
  return crypto.randomUUID()
}

export function ScheduledJobsPanel({
  store,
  onChange,
  selectedGroupId
}: {
  store: Store
  onChange: (u: (p: Store) => Store) => void
  selectedGroupId: string | null
}): React.JSX.Element {
  const jobs = store.scheduledJobs ?? []
  const [name, setName] = useState('Daily holdings')
  const [dailyTime, setDailyTime] = useState('09:00')

  const addJob = () => {
    if (!selectedGroupId) return
    const job: ScheduledJob = {
      id: newId(),
      name,
      groupId: selectedGroupId,
      scheduleType: 'daily',
      dailyTime,
      enabled: true
    }
    onChange((s) => ({ ...s, scheduledJobs: [...(s.scheduledJobs ?? []), job] }))
  }

  return (
    <section className="rounded-md border-2 border-surface-border bg-surface-raised p-4">
      <h2 className="text-sm font-semibold text-zinc-200">Scheduled runs</h2>
      <p className="mt-1 text-[11px] text-zinc-500">
        Run all tasks in the selected group on a daily schedule (local time). Requires the app to be open.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          className="rounded border border-surface-border bg-[#0c0c0e] px-2 py-1 text-xs"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Job name"
        />
        <input
          type="time"
          className="rounded border border-surface-border bg-[#0c0c0e] px-2 py-1 text-xs"
          value={dailyTime}
          onChange={(e) => setDailyTime(e.target.value)}
        />
        <button type="button" onClick={addJob} className="rounded-md bg-accent px-2 py-1 text-xs text-white">
          Add schedule
        </button>
      </div>
      <ul className="mt-3 space-y-1 text-xs">
        {jobs.length === 0 ? (
          <li className="text-zinc-500">No schedules yet.</li>
        ) : (
          jobs.map((j) => (
            <li key={j.id} className="flex items-center justify-between rounded border border-surface-border px-2 py-1">
              <span>
                {j.name} · {j.scheduleType} {j.dailyTime ?? ''} · group{' '}
                {store.groups.find((g) => g.id === j.groupId)?.name ?? j.groupId}
              </span>
              <button
                type="button"
                className="text-red-400"
                onClick={() =>
                  onChange((s) => ({
                    ...s,
                    scheduledJobs: (s.scheduledJobs ?? []).filter((x) => x.id !== j.id)
                  }))
                }
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
