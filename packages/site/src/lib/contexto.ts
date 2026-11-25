import 'server-only'
import { obterRede } from './obter-rede'
import type { PerfilRover, ResumoRover } from './tipos'

export interface Casca {
  modo: 'falso' | 'http'
  /**
   * Dados inventados na tela: sempre no cliente falso e, no modo relé, enquanto o relé for o de demonstração (com rovers semeados).
   * Só some com `ROVER_NETWORK_DEMONSTRACAO=nao`, a ser posto quando o relé tiver pessoas de verdade: esquecer a variável deixa o aviso,
   * nunca o contrário.
   */
  demonstracao: boolean
  eu: ResumoRover | null
  pendentes: number
  /** avisos novos desde o último visto */
  novas: number
  emAlta: PerfilRover[]
  /** 0.4.0: o menu de Mensagens só aparece com o app pareado e um relé que declara o recurso `mensagens` */
  mensagens: boolean
}

/** O que a moldura (cabeçalho, abas, coluna ao lado) precisa. Nunca lança: se o relé cair, a página mostra o erro. */
export async function carregarCasca(): Promise<Casca> {
  const { cliente, ponte } = obterRede()
  const [eu, rascunhos, sociais, desc] = await Promise.allSettled([ponte.quemSou(), ponte.rascunhos(), ponte.rascunhosSociais(), cliente.descobrir()])
  const meu = eu.status === 'fulfilled' ? eu.value : null
  // O último aviso visto mora no app do Rover Hangar (o relé não tem "marcar como lida" e o site não usa cookie).
  const visto = await ponte.avisosVistos().catch(() => 0)
  const novas = meu ? await cliente.contagemDeNotificacoes(meu.uid, visto).catch(() => 0) : 0
  const mensagens = meu ? await cliente.suporta('mensagens').catch(() => false) : false
  return {
    modo: cliente.modo,
    demonstracao: cliente.modo === 'falso' || process.env.ROVER_NETWORK_DEMONSTRACAO !== 'nao',
    eu: meu,
    novas,
    pendentes: (rascunhos.status === 'fulfilled' ? rascunhos.value.length : 0) + (sociais.status === 'fulfilled' ? sociais.value.length : 0),
    emAlta: desc.status === 'fulfilled' ? desc.value.emAlta : [],
    mensagens,
  }
}
