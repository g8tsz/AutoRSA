import { spawn, type ChildProcess } from 'node:child_process'

/** Kill process and children (Windows: taskkill /T; Unix: kill process group). */
export function killProcessTree(child: ChildProcess): void {
  const pid = child.pid
  if (pid == null) {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
    return
  }
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
}
