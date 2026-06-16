import { describe, expect, it } from 'vitest'
import { resolveDirectBotExecutable } from './botLaunch'
import { join } from 'node:path'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

describe('resolveDirectBotExecutable', () => {
  it('returns null when nothing exists', () => {
    const root = join(tmpdir(), 'autorsa-test-' + Date.now())
    expect(resolveDirectBotExecutable('', root, 'win32')).toBeNull()
  })

  it('finds a fake exe on disk', () => {
    const root = join(tmpdir(), 'autorsa-test-' + Date.now())
    const scripts = join(root, 'python', 'venv', 'Scripts')
    mkdirSync(scripts, { recursive: true })
    const exe = join(scripts, 'auto_rsa_bot.exe')
    writeFileSync(exe, '')
    expect(resolveDirectBotExecutable(exe, root, 'win32')).toBe(exe)
    rmSync(root, { recursive: true, force: true })
  })
})
