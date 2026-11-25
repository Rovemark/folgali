// A MATRIZ DE QUEM PODE O QUÊ (docs/API-REDE-SOCIAL.md, seção 8), como função pura. A tela usa isto para
// mostrar só os botões que fazem sentido; o relé decide de verdade e repete a regra. Quando a regra
// nega, devolve o MESMO código de erro que o relé devolveria, para a tela explicar sem adivinhar.
//
// Papéis: dono (D), moderador (M), membro (m), não membro (n, papel nulo) e banido (B, bandeira).

import type { Acesso, PapelNaComunidade, RegraDeRecado } from '../social/tipos'

export type Negacao = 'sem-permissao' | 'interacao-nao-permitida' | 'conta-nova' | 'banido' | 'nao-e-membro' | 'ja-existe' | 'nao-encontrado'
export type Veredito = { ok: true } | { ok: false; motivo: Negacao }
const OK: Veredito = { ok: true }
const nega = (motivo: Negacao): Veredito => ({ ok: false, motivo })

/** Carências do protocolo (seção 10.6): tópico e voto, 1 hora; resposta, 10 minutos. Dono e moderador não esperam. */
export const CARENCIA_TOPICO_S = 3600
export const CARENCIA_RESPOSTA_S = 600
export const EDICAO_TOPICO_S = 30 * 60
export const MAX_EDICOES_TOPICO = 5

export interface Quem {
  papel: PapelNaComunidade | null
  banido: boolean
  /** segundos desde que virou membro; ausente = sem carência a checar */
  membroHa?: number
}

export type AcaoComunidade =
  | 'ler' | 'entrar' | 'pedir-entrada' | 'sair'
  | 'postar-topico' | 'responder' | 'votar' | 'reagir'
  | 'editar-meu-topico' | 'convidar' | 'decidir-pedido'
  | 'fixar' | 'trancar' | 'mover' | 'remover-alheio' | 'resolver'
  | 'expulsar' | 'banir' | 'desbanir' | 'promover' | 'rebaixar'
  | 'editar-dados' | 'mudar-acesso' | 'transferir' | 'encerrar'
  | 'ver-moderacao' | 'ver-apelacoes' | 'apelar'

export interface Extra {
  /** o tópico é do próprio leitor (resolver, editar) */
  meuTopico?: boolean
  /** papel do alvo, quando a ação é sobre um rover (expulsar, banir) */
  alvoPapel?: PapelNaComunidade | null
  /** o conteúdo a remover é do dono da comunidade */
  conteudoDoDono?: boolean
  /** o leitor é o autor de um conteúdo removido pela moderação (apelar) */
  autorRemovido?: boolean
}

const equipe = (p: Quem['papel']) => p === 'dono' || p === 'moderador'

export function podeNaComunidade(acao: AcaoComunidade, q: Quem, acesso: Acesso, x: Extra = {}): Veredito {
  const membro = q.papel !== null && !q.banido
  switch (acao) {
    case 'ler':
      return acesso !== 'fechada' || membro ? OK : nega('nao-encontrado')
    case 'entrar':
      if (q.banido) return nega('banido')
      if (q.papel !== null) return nega('ja-existe')
      return acesso === 'aberta' ? OK : acesso === 'fechada' ? nega('nao-encontrado') : nega('sem-permissao')
    case 'pedir-entrada':
      if (q.banido) return nega('banido')
      if (q.papel !== null) return nega('ja-existe')
      return acesso === 'moderada' ? OK : acesso === 'fechada' ? nega('nao-encontrado') : nega('sem-permissao')
    case 'sair':
      if (q.papel === null) return nega('nao-e-membro')
      return q.papel === 'dono' ? nega('sem-permissao') : OK
    case 'postar-topico':
    case 'responder':
    case 'votar':
    case 'reagir': {
      if (q.banido) return nega('banido')
      if (q.papel === null) return nega('nao-e-membro')
      if (equipe(q.papel) || acao === 'reagir') return OK
      const exigido = acao === 'responder' ? CARENCIA_RESPOSTA_S : CARENCIA_TOPICO_S
      return q.membroHa === undefined || q.membroHa >= exigido ? OK : nega('conta-nova')
    }
    case 'editar-meu-topico':
      return membro && x.meuTopico ? OK : nega('sem-permissao')
    case 'convidar':
    case 'decidir-pedido':
    case 'fixar':
    case 'trancar':
    case 'mover':
    case 'desbanir':
    case 'editar-dados':
    case 'ver-moderacao':
      return equipe(q.papel) && !q.banido ? OK : nega('sem-permissao')
    case 'remover-alheio':
      if (!equipe(q.papel) || q.banido) return nega('sem-permissao')
      return q.papel === 'moderador' && x.conteudoDoDono ? nega('sem-permissao') : OK
    case 'resolver':
      if (!membro) return nega('sem-permissao')
      return equipe(q.papel) || x.meuTopico ? OK : nega('sem-permissao')
    case 'expulsar':
      if (q.papel === 'dono') return OK
      if (q.papel === 'moderador') return x.alvoPapel === 'membro' ? OK : nega('sem-permissao')
      return nega('sem-permissao')
    case 'banir':
      if (q.papel === 'dono') return OK
      if (q.papel === 'moderador') return x.alvoPapel === 'moderador' || x.alvoPapel === 'dono' ? nega('sem-permissao') : OK
      return nega('sem-permissao')
    case 'promover':
    case 'rebaixar':
    case 'mudar-acesso':
    case 'transferir':
    case 'encerrar':
    case 'ver-apelacoes':
      return q.papel === 'dono' && !q.banido ? OK : nega('sem-permissao')
    case 'apelar':
      return x.autorRemovido || q.banido ? OK : nega('sem-permissao')
  }
}

// ---- perfil ------------------------------------------------------------------------------------------------

export const DIAS_PARA_DEPOIMENTO = 3
export const DIAS_PARA_SELO = 7

export interface RelacaoComODono {
  /** o leitor é o dono da página */
  proprio: boolean
  amigo: boolean
  /** há quantos dias são amigos */
  amigoHaDias: number
  /** idade da conta de quem age, em dias */
  contaDias: number
  /** bloqueio em QUALQUER sentido: a resposta é a mesma para os dois lados */
  bloqueio: boolean
  recados: RegraDeRecado
}

export type AcaoNoPerfil = 'recado' | 'depoimento' | 'selo' | 'pedir-amizade' | 'apagar-recado' | 'decidir-depoimento' | 'ler-pendentes' | 'bloquear' | 'silenciar'

export function podeNoPerfil(acao: AcaoNoPerfil, r: RelacaoComODono): Veredito {
  switch (acao) {
    case 'apagar-recado':
    case 'decidir-depoimento':
    case 'ler-pendentes':
      return r.proprio ? OK : nega('sem-permissao')
    case 'bloquear':
    case 'silenciar':
      return r.proprio ? nega('sem-permissao') : OK
    case 'pedir-amizade':
      if (r.proprio) return nega('sem-permissao')
      if (r.bloqueio) return nega('interacao-nao-permitida')
      return r.amigo ? nega('ja-existe') : OK
    case 'recado':
      if (r.proprio) return nega('sem-permissao')
      // a mesma mensagem para bloqueio, "só amigos" e "ninguém": a tela não diz qual
      if (r.bloqueio || r.recados === 'ninguem' || (r.recados === 'amigos' && !r.amigo)) return nega('interacao-nao-permitida')
      return OK
    case 'depoimento':
    case 'selo': {
      if (r.proprio) return nega('sem-permissao')
      if (r.bloqueio) return nega('interacao-nao-permitida')
      if (!r.amigo) return nega('sem-permissao')
      const dias = acao === 'depoimento' ? DIAS_PARA_DEPOIMENTO : DIAS_PARA_SELO
      return r.amigoHaDias >= dias && r.contaDias >= dias ? OK : nega('conta-nova')
    }
  }
}

// ---- páginas de projeto ------------------------------------------------------------------------------------

export type PapelNaPagina = 'dono' | 'administrador' | null
export type AcaoNaPagina = 'ler' | 'seguir' | 'publicar' | 'atualizar' | 'gerir-administradores' | 'remover-atualizacao-alheia' | 'remover-pagina'

export function podeNaPagina(acao: AcaoNaPagina, papel: PapelNaPagina): Veredito {
  switch (acao) {
    case 'ler':
    case 'seguir':
      return OK
    case 'publicar':
    case 'atualizar':
      return papel !== null ? OK : nega('sem-permissao')
    case 'gerir-administradores':
    case 'remover-atualizacao-alheia':
    case 'remover-pagina':
      return papel === 'dono' ? OK : nega('sem-permissao')
  }
}

/** Mover um tópico: papel de equipe nos DOIS lados, e de fechada para não fechada só o dono da origem (torna público). */
export function podeMoverTopico(origem: { papel: PapelNaComunidade | null; acesso: Acesso }, destino: { papel: PapelNaComunidade | null; acesso: Acesso }): Veredito {
  if (!equipe(origem.papel) || !equipe(destino.papel)) return nega('sem-permissao')
  if (origem.acesso === 'fechada' && destino.acesso !== 'fechada' && origem.papel !== 'dono') return nega('sem-permissao')
  return OK
}

/** Janela de edição do tópico: 30 minutos, 5 edições, nunca trancado, só o autor. */
export function podeEditarTopico(x: { meuTopico: boolean; criadoEmMs: number; agoraMs: number; edicoes: number; trancado: boolean }): Veredito | { ok: false; motivo: 'fora-da-janela' | 'limite-de-estrutura' | 'trancado' | 'sem-permissao' } {
  if (!x.meuTopico) return nega('sem-permissao')
  if (x.trancado) return { ok: false, motivo: 'trancado' }
  if (x.agoraMs - x.criadoEmMs > EDICAO_TOPICO_S * 1000) return { ok: false, motivo: 'fora-da-janela' }
  if (x.edicoes >= MAX_EDICOES_TOPICO) return { ok: false, motivo: 'limite-de-estrutura' }
  return OK
}
