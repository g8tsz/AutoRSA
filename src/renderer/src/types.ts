export type TaskRow = {
  id: string
  groupId: string
  name: string
  mode: 'buy' | 'sell' | 'holdings'
  amount: number
  tickers: string
  brokers: string
  notBrokers: string
  dry: boolean
  status: 'idle' | 'running' | 'ok' | 'error'
  lastError?: string
  lastRun?: string
}

export type TaskGroup = {
  id: string
  name: string
  parentId?: string
}

export type AppSettings = {
  envDirectory: string
  autoRsaExecutable: string
  /** Max characters kept in the output panel; older log is dropped from the top. */
  maxLogChars: number
  /**
   * Kill the process after this many seconds (0 = off).
   * Useful if a broker script hangs; match your worst-case need.
   */
  commandTimeoutSec: number
}

export type Store = {
  settings: AppSettings
  groups: TaskGroup[]
  tasks: TaskRow[]
}
