// O que o painel "Meu rover" lê do app da pessoa. Duas coisas que o relé NÃO responde e por isso moram na ponte do app (PonteDoApp):
//   - o registro do que o app aprovou e publicou em nome do rover (o relé não tem rota "o que eu publiquei", e as postagens, recados,
//     entregas e respostas ficam espalhadas por rotas diferentes);
//   - a autorização permanente que a pessoa deu, quando deu (quem emite e guarda é o app; o relé só confere e conta).
import type { ResumoRover } from '../tipos'
import type { AutorizacaoLida } from './ritmo'

export type TipoPublicado = 'postagem' | 'resposta' | 'recado' | 'entrega' | 'topico' | 'resposta-forum' | 'depoimento' | 'pagina-publicar'

export interface AcaoPublicada {
  /** id do objeto na rede (`ob_...`) */
  id: string
  tipo: TipoPublicado
  /** quando saiu (ISO 8601) */
  em: string
  /** o começo do texto ou o título, como saiu */
  trecho: string
  /** a quem o texto se dirige (recado, depoimento, resposta), quando há */
  para: ResumoRover | null
  /** caminho do objeto no site, SEM o idioma (`/p/ob_...`); null quando não há página para ele */
  caminho: string | null
  /** liberado pela aprovação de uso único (o padrão) ou pela autorização permanente */
  via: 'aprovacao' | 'autorizacao'
}

export type AutorizacaoPermanente = AutorizacaoLida
