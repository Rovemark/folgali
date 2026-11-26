// @vitest-environment node
// The site's environment variables moved to English names (FOLGALI_*). The production env file may still have the old ones
// (ROVER_NETWORK_*, FOLGALI_DADOS_DIR, RVM_FOLGALI_SEGREDO...), so the old names keep working: they fill the new ones, with a
// warning, and an old explicit value wins over a different new one.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEGACY_SITE_ENV, applyLegacyEnv } from '@/lib/legacy-env'

const site = join(__dirname, '..')

describe('old environment names on the site', () => {
  it('old only: the new name is filled and the old one stays; a warning names both', () => {
    const env: Record<string, string | undefined> = { ROVER_NETWORK_CLIENTE: 'http', ROVER_NETWORK_RELE_URL: 'http://127.0.0.1:4747', FOLGALI_DADOS_DIR: '/data' }
    const w = applyLegacyEnv(env)
    expect(env.FOLGALI_CLIENT).toBe('http')
    expect(env.FOLGALI_RELAY_URL).toBe('http://127.0.0.1:4747')
    expect(env.FOLGALI_DATA_DIR).toBe('/data')
    expect(env.ROVER_NETWORK_CLIENTE).toBe('http')
    expect(w).toContain('ROVER_NETWORK_CLIENTE is deprecated; rename it to FOLGALI_CLIENT.')
  })
  it('new only: nothing changes; both different: the old wins with a warning', () => {
    const fresh: Record<string, string | undefined> = { FOLGALI_INDEXABLE: 'sim' }
    expect(applyLegacyEnv(fresh)).toEqual([])
    expect(fresh).toEqual({ FOLGALI_INDEXABLE: 'sim' })
    const both: Record<string, string | undefined> = { FOLGALI_INDEXABLE: 'nao', ROVER_NETWORK_INDEXAVEL: 'sim' }
    expect(applyLegacyEnv(both)[0]).toMatch(/both set/)
    expect(both.FOLGALI_INDEXABLE).toBe('sim')
  })
  it('every FOLGALI_* or RVM_* name the site reads from the environment has its old name (or never had one)', () => {
    // the source files: from git in the working repository, from the disk in an exported tree (no .git there)
    const walk = (d: string): string[] => readdirSync(join(site, d), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]))
    const files = (existsSync(join(site, '../../.git'))
      ? execFileSync('git', ['ls-files', 'src', 'next.config.ts'], { cwd: site, encoding: 'utf8' }).split('\n')
      : [...walk('src'), 'next.config.ts']).filter((f) => /\.(ts|tsx)$/.test(f))
    const read = new Set<string>()
    for (const f of files) for (const m of readFileSync(join(site, f), 'utf8').matchAll(/env\.((?:FOLGALI|RVM)_[A-Z0-9_]+)/g)) read.add(m[1])
    const unchanged = new Set(['FOLGALI_ROVEMARK_API'])
    for (const n of read) expect(n in LEGACY_SITE_ENV || unchanged.has(n), n).toBe(true)
    expect(read.size).toBeGreaterThan(5)
  })
})
