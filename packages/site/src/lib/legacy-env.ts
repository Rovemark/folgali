// Environment variable names moved to English on 2026-11-25. The old names still work: importing this module fills each new name
// from its old one in process.env (once), so a server whose env file was not updated keeps running, with a warning in the log.
// When both are set with different values the OLD one wins, because an old env file is an explicit setting. Same rule as the
// relay and the open issuer (packages/protocol/src/env.js); this copy exists because the site image only carries packages/site.

/** new name -> old name */
export const LEGACY_SITE_ENV: Readonly<Record<string, string>> = Object.freeze({
  FOLGALI_INDEXABLE: 'ROVER_NETWORK_INDEXAVEL',
  FOLGALI_CLIENT: 'ROVER_NETWORK_CLIENTE',
  FOLGALI_RELAY_URL: 'ROVER_NETWORK_RELE_URL',
  FOLGALI_BASE_URL: 'ROVER_NETWORK_URL_BASE',
  FOLGALI_SESSION_SECRET: 'FOLGALI_SESSAO_SEGREDO',
  FOLGALI_ROVEMARK_RETURN: 'FOLGALI_ROVEMARK_VOLTA',
  FOLGALI_DATA_DIR: 'FOLGALI_DADOS_DIR',
  FOLGALI_OPEN: 'FOLGALI_ABERTO',
  FOLGALI_LEGAL_EFFECTIVE: 'FOLGALI_JURIDICO_VIGENCIA',
  FOLGALI_DEMO_ALL_TYPES: 'ROVER_NETWORK_DEMO_TODOS_OS_TIPOS',
  FOLGALI_DEMO: 'ROVER_NETWORK_DEMONSTRACAO',
  FOLGALI_ISSUER_URL: 'FOLGALI_EMISSOR_URL',
  FOLGALI_DEMO_AUTHORIZATION: 'ROVER_NETWORK_DEMO_AUTORIZACAO',
  FOLGALI_WAITLIST_URL: 'ROVER_NETWORK_LISTA_ESPERA_URL',
  FOLGALI_ROVEMARK_SIGNIN_URL: 'FOLGALI_ROVEMARK_ENTRAR_URL',
  RVM_FOLGALI_SECRET: 'RVM_FOLGALI_SEGREDO',
})

type Env = Record<string, string | undefined>

/** Fills new names from old ones in `env` (in place). Returns the warnings, one per old name in use. */
export function applyLegacyEnv(env: Env, pairs: Readonly<Record<string, string>> = LEGACY_SITE_ENV): string[] {
  const warnings: string[] = []
  for (const [name, old] of Object.entries(pairs)) {
    const legacy = env[old]
    if (legacy === undefined) continue
    if (env[name] !== undefined && env[name] !== legacy) {
      warnings.push(`${old} and ${name} are both set with different values; using ${old}. Keep only ${name}.`)
      env[name] = legacy
    } else if (env[name] === undefined) {
      warnings.push(`${old} is deprecated; rename it to ${name}.`)
      env[name] = legacy
    }
  }
  return warnings
}

const g = globalThis as unknown as { __folgaliLegacyEnv?: boolean }
if (typeof process !== 'undefined' && process.env && !g.__folgaliLegacyEnv) {
  g.__folgaliLegacyEnv = true
  for (const w of applyLegacyEnv(process.env)) console.warn(`[folgali] ${w}`)
}
