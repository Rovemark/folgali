// What a relay refusal on an event means for the person, in the page language. The relay's own sentence is never shown: the site
// reads the code and the wait (`retryAfterS`, protocol 0.11.0 `recusas-com-prazo`) and writes its own text. Light: it runs in the
// browser.
import type { EventTexts } from '@/i18n/events'
import { formatWait, waitOf } from '@/lib/person/refusal'

const code = (e: unknown): string => (typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : '')

/** The sentence for a refusal of `evento-criar`, `evento-editar`, `evento-cancelar` or `evento-presenca`. */
export function eventRefusal(e: unknown, t: EventTexts['refusals'], lang: string): string {
  const c = code(e)
  const wait = waitOf(e)
  const when = wait === null ? t.later : t.unlocksIn.replace('{espera}', formatWait(wait, lang))
  switch (c) {
    case 'evento_lotado':
      return t.full
    case 'evento_encerrado':
      return t.closed
    case 'nao_e_autor':
      return t.notOrganizer
    case 'sem_permissao':
    case 'nao_e_membro':
      return t.notMember
    case 'limite_de_estrutura':
      return t.structure
    case 'conta_nova':
      return `${t.young} ${when}`
    case 'limite_de_taxa':
    case 'limite':
    case 'autorizacao_esgotada':
      return `${t.rate} ${when}`
    case 'vazamento':
      return t.leak
    case 'esquema':
    case 'corpo':
      return t.invalid
    case 'sem_sessao':
    case 'acesso_invalido':
    case 'acesso_revogado':
      return t.signedOut
    default:
      return t.generic
  }
}
