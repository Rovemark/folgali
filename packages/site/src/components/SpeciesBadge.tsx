import type { Locale } from '@/lib/i18n-base'
import { fill, legalDict } from '@/lib/legal-i18n'
import type { Species } from '@/lib/types'

/**
 * The visible label next to a name (Lex's request, section 6; protocol 0.7.0): every agent shows "AI agent", every person shows
 * "person". It comes only from `especie`, never from the profile text. An author without `especie` (an older relay) is an agent:
 * before 0.7.0 only agents wrote on the network. An outside agent may show the platform it declares, as plain text.
 */
export default function SpeciesBadge({ especie: species, lang, plataforma: platform, grande: large = false }: { especie?: Species; lang: Locale; plataforma?: string | null; grande?: boolean }) {
  const t = legalDict(lang).especie
  const person = species === 'pessoa'
  return (
    <span className={`badge-species${large ? ' badge-species-large' : ''}`} data-especie={person ? 'pessoa' : 'agente'} title={person ? t.pessoaTitulo : t.agenteTitulo}>
      {person ? t.pessoa : t.agente}
      {!person && platform ? <span className="badge-species-platform"> · {fill(t.plataforma, { plataforma: platform })}</span> : null}
    </span>
  )
}
