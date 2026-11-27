// SPDX-License-Identifier: AGPL-3.0-or-later
// Environment variable names. They moved to English on 2026-11-25; the Portuguese names still work, so a deployment that has
// not been updated keeps running. When only the old name is set, its value is used and a warning says which new name to use.
// When both are set with different values, the OLD one wins (an explicit setting in an old env file must not be silently
// overridden by an image default under the new name), with a warning to remove one of them.

/** new name -> old name */
export const LEGACY_ENV = Object.freeze({
  // relay
  RELAY_ISSUERS: 'RELE_EMISSORES',
  RELAY_REPORT_SECRET: 'RELE_SEGREDO_DENUNCIAS',
  RELAY_MEDIA: 'RELE_MIDIA',
  RELAY_MEDIA_DIR: 'RELE_MIDIA_DIR',
  RELAY_MEDIA_QUOTA_MB: 'RELE_MIDIA_COTA_MB',
  RELAY_ISSUERS_DISCOVERY: 'RELE_EMISSORES_DESCOBERTA',
  RELAY_ISSUER_FAMILIES: 'RELE_FAMILIAS_DE_EMISSORES',
  RELAY_CLOUDFLARE: 'RELE_CLOUDFLARE',
  RELAY_CLOUDFLARE_RANGES: 'RELE_CLOUDFLARE_FAIXAS',
  RELAY_MESSAGES: 'RELE_MENSAGENS',
  RELAY_DB: 'RELE_BANCO',
  RELAY_STANDING_AUTHORIZATION: 'RELE_AUTORIZACAO_PERMANENTE',
  RELAY_ADMIN_TOKEN: 'RELE_ADMIN_TOKEN',
  RELAY_AGENT_ISSUERS: 'RELE_EMISSORES_DE_AGENTES',
  RELAY_PEOPLE_ISSUERS: 'RELE_EMISSORES_DE_PESSOAS',
  RELAY_TRUST_PROXY: 'RELE_CONFIAR_PROXY',
  RELAY_LEAK_FILTER: 'RELE_FILTRO_DE_VAZAMENTO',
  RELAY_REFERENCE: 'RELE_REFERENCIA',
  RELAY_WITHOUT_AGE_FACTOR: 'RELE_SEM_FATOR_DE_IDADE',
  RELAY_PORT: 'RELE_PORTA',
  RELAY_ADDRESS: 'RELE_ENDERECO',
  RELAY_REVOKED_INTERVAL_MIN: 'RELE_REVOGADOS_INTERVALO_MIN',
  RELAY_REVOKED_MAX_AGE_MIN: 'RELE_REVOGADOS_IDADE_MAX_MIN',
  RELAY_BURST_PER_SECOND: 'RELE_RAJADA_POR_SEGUNDO',
  RELAY_BURST_CAPACITY: 'RELE_RAJADA_CAPACIDADE',
  RELAY_CORS_ORIGINS: 'RELE_CORS_ORIGENS',
  RELAY_DEMO: 'RELE_DEMONSTRACAO',
  RELAY_BACKUP_DIR: 'RELE_BACKUP_PASTA',
  RELAY_BACKUP_KEEP: 'RELE_BACKUP_ULTIMOS',
  RELAY_BACKUP_DAYS: 'RELE_BACKUP_DIAS',
  RELAY_VERIFIED_ISSUERS: 'RELE_EMISSORES_VERIFICADOS',
  RELAY_GALLERY_BASE: 'RELE_GALERIA_BASE',
  RELAY_VIDEO: 'RELE_VIDEO',
  RELAY_VIDEO_QUOTA_MB: 'RELE_VIDEO_COTA_MB',
  RELAY_MEDIA_S3_ENDPOINT: 'RELE_MIDIA_S3_ENDPOINT',
  RELAY_MEDIA_S3_BUCKET: 'RELE_MIDIA_S3_BUCKET',
  RELAY_MEDIA_S3_REGION: 'RELE_MIDIA_S3_REGIAO',
  RELAY_MEDIA_S3_KEY: 'RELE_MIDIA_S3_CHAVE',
  RELAY_MEDIA_S3_SECRET: 'RELE_MIDIA_S3_SEGREDO',
  RELAY_MEDIA_S3_PREFIX: 'RELE_MIDIA_S3_PREFIXO',
  RELAY_MEDIA_S3_PUBLIC_URL: 'RELE_MIDIA_S3_URL_PUBLICA',
  RELAY_MEDIA_S3_SIGNED_URL_S: 'RELE_MIDIA_S3_URL_ASSINADA_S',
  // open issuer
  ISSUER_KEY: 'EMISSOR_CHAVE',
  ISSUER_SECRET: 'EMISSOR_SEGREDO',
  ISSUER_OWNERS: 'EMISSOR_DONOS',
  ISSUER_LINK: 'EMISSOR_LINK',
  ISSUER_RELAY: 'EMISSOR_RELE',
  ISSUER_DB: 'EMISSOR_BANCO',
  ISSUER_PORT: 'EMISSOR_PORTA',
  ISSUER_ADDRESS: 'EMISSOR_ENDERECO',
  ISSUER_TRUST_PROXY: 'EMISSOR_CONFIAR_PROXY',
  ISSUER_CLOUDFLARE: 'EMISSOR_CLOUDFLARE',
  ISSUER_CLOUDFLARE_RANGES: 'EMISSOR_CLOUDFLARE_FAIXAS',
  ISSUER_DELIVERY_INTERVAL_S: 'EMISSOR_ENTREGAS_INTERVALO_S',
  ISSUER_BACKUP_DIR: 'EMISSOR_BACKUP_PASTA',
  ISSUER_BACKUP_KEEP: 'EMISSOR_BACKUP_ULTIMOS',
})

/**
 * A copy of `env` where every new name is filled from its old name. `warn(message)` is called once per old name in use.
 * Values stay as they are (the switches still take `sim` and `nao`).
 */
export function withLegacyEnv(env, warn = () => {}, pairs = LEGACY_ENV) {
  const out = { ...env }
  for (const [name, old] of Object.entries(pairs)) {
    const legacy = env[old]
    if (legacy === undefined) continue
    if (env[name] !== undefined && env[name] !== legacy) {
      warn(`${old} and ${name} are both set with different values; using ${old}. Keep only ${name}.`)
      out[name] = legacy
    } else if (env[name] === undefined) {
      warn(`${old} is deprecated; rename it to ${name}.`)
      out[name] = legacy
    }
  }
  return out
}
