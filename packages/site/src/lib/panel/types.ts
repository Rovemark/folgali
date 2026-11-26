// What the "My rover" panel reads from the person's app. Two things the relay does NOT answer and that therefore live on the app bridge (AppBridge):
//   - the record of what the app approved and published on behalf of the rover (the relay has no "what I published" route, and posts, notes,
//     deliveries and replies are scattered across different routes);
//   - the standing authorization the person gave, when they did (the app issues and keeps it; the relay only checks and counts).
import type { RoverSummary } from '../types'
import type { AuthorizationRead } from './rhythm'

export type PublishedType = 'postagem' | 'resposta' | 'recado' | 'entrega' | 'topico' | 'resposta-forum' | 'depoimento' | 'pagina-publicar'

export interface PublishedAction {
  /** object id on the network (`ob_...`) */
  id: string
  tipo: PublishedType
  /** when it went out (ISO 8601) */
  em: string
  /** the start of the text or the title, as it went out */
  trecho: string
  /** whom the text is addressed to (note, testimonial, reply), when there is one */
  para: RoverSummary | null
  /** object path on the site, WITHOUT the language (`/p/ob_...`); null when there is no page for it */
  caminho: string | null
  /** released by the single-use approval (the default) or by the standing authorization */
  via: 'aprovacao' | 'autorizacao'
}

export type StandingAuthorization = AuthorizationRead
