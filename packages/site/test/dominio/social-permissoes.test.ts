// A matriz de quem pode o quê (docs/API-REDE-SOCIAL.md, seção 8), célula por célula. Cada linha da tabela
// abaixo é uma linha da matriz da especificação; as colunas são D (dono), M (moderador), m (membro),
// n (não membro) e B (banido). O resultado esperado é `true` (pode) ou o CÓDIGO que o relé devolveria.
import { describe, expect, it } from 'vitest'
import {
  CARENCIA_RESPOSTA_S, CARENCIA_TOPICO_S, DIAS_PARA_DEPOIMENTO, DIAS_PARA_SELO, EDICAO_TOPICO_S, MAX_EDICOES_TOPICO, podeEditarTopico, podeMoverTopico,
  podeNaComunidade, podeNaPagina, podeNoPerfil, type AcaoComunidade, type Extra, type Negacao, type Quem, type RelacaoComODono,
} from '@/lib/dominio/permissoes'
import type { Acesso } from '@/lib/social/tipos'

const D: Quem = { papel: 'dono', banido: false }
const M: Quem = { papel: 'moderador', banido: false }
const m: Quem = { papel: 'membro', banido: false }
const n: Quem = { papel: null, banido: false }
const B: Quem = { papel: null, banido: true }
type R = true | Negacao
const veredito = (v: ReturnType<typeof podeNaComunidade>): R => (v.ok ? true : v.motivo)

type Linha = { acao: AcaoComunidade; acesso?: Acesso; extra?: Extra; esperado: [R, R, R, R, R] }
const MATRIZ: Linha[] = [
  // ler: aberta e moderada são públicas; fechada some para quem está fora (404)
  { acao: 'ler', acesso: 'aberta', esperado: [true, true, true, true, true] },
  { acao: 'ler', acesso: 'moderada', esperado: [true, true, true, true, true] },
  { acao: 'ler', acesso: 'fechada', esperado: [true, true, true, 'nao-encontrado', 'nao-encontrado'] },
  // entrar e pedir entrada
  { acao: 'entrar', acesso: 'aberta', esperado: ['ja-existe', 'ja-existe', 'ja-existe', true, 'banido'] },
  { acao: 'entrar', acesso: 'moderada', esperado: ['ja-existe', 'ja-existe', 'ja-existe', 'sem-permissao', 'banido'] },
  { acao: 'entrar', acesso: 'fechada', esperado: ['ja-existe', 'ja-existe', 'ja-existe', 'nao-encontrado', 'banido'] },
  { acao: 'pedir-entrada', acesso: 'moderada', esperado: ['ja-existe', 'ja-existe', 'ja-existe', true, 'banido'] },
  { acao: 'pedir-entrada', acesso: 'aberta', esperado: ['ja-existe', 'ja-existe', 'ja-existe', 'sem-permissao', 'banido'] },
  { acao: 'pedir-entrada', acesso: 'fechada', esperado: ['ja-existe', 'ja-existe', 'ja-existe', 'nao-encontrado', 'banido'] },
  // sair: o dono não sai (transfira a posse antes)
  { acao: 'sair', esperado: ['sem-permissao', true, true, 'nao-e-membro', 'nao-e-membro'] },
  // tópico, resposta, voto, reação: só membro não banido
  { acao: 'postar-topico', esperado: [true, true, true, 'nao-e-membro', 'banido'] },
  { acao: 'responder', esperado: [true, true, true, 'nao-e-membro', 'banido'] },
  { acao: 'votar', esperado: [true, true, true, 'nao-e-membro', 'banido'] },
  { acao: 'reagir', esperado: [true, true, true, 'nao-e-membro', 'banido'] },
  // editar o seu tópico
  { acao: 'editar-meu-topico', extra: { meuTopico: true }, esperado: [true, true, true, 'sem-permissao', 'sem-permissao'] },
  { acao: 'editar-meu-topico', extra: { meuTopico: false }, esperado: ['sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // convidar, aprovar e recusar pedido, fixar, trancar, mover: dono e moderador
  { acao: 'convidar', esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'decidir-pedido', esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'fixar', esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'trancar', esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'mover', esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // remover tópico ou resposta alheios: o moderador não remove o que é do dono
  { acao: 'remover-alheio', extra: { conteudoDoDono: false }, esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'remover-alheio', extra: { conteudoDoDono: true }, esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // resolveu: dono, moderador, ou o membro no tópico dele
  { acao: 'resolver', extra: { meuTopico: false }, esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'resolver', extra: { meuTopico: true }, esperado: [true, true, true, 'sem-permissao', 'sem-permissao'] },
  // expulsar: o dono, todos; o moderador, só membros comuns
  { acao: 'expulsar', extra: { alvoPapel: 'membro' }, esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'expulsar', extra: { alvoPapel: 'moderador' }, esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'expulsar', extra: { alvoPapel: 'dono' }, esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // banir: o moderador não bane moderador nem dono; bane membro e quem nem é membro
  { acao: 'banir', extra: { alvoPapel: 'membro' }, esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'banir', extra: { alvoPapel: null }, esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'banir', extra: { alvoPapel: 'moderador' }, esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'banir', extra: { alvoPapel: 'dono' }, esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'desbanir', esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // promover e rebaixar: só o dono
  { acao: 'promover', esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'rebaixar', esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // nome, descrição, regras, tema, categorias: dono e moderador; o acesso, só o dono
  { acao: 'editar-dados', esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'mudar-acesso', esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'transferir', esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'encerrar', esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // ver pedidos, convites, banidos e a fila: dono e moderador; apelações: só o dono
  { acao: 'ver-moderacao', esperado: [true, true, 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  { acao: 'ver-apelacoes', esperado: [true, 'sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao'] },
  // apelar: o autor removido (membro) e o banido
  { acao: 'apelar', extra: { autorRemovido: true }, esperado: [true, true, true, true, true] },
  { acao: 'apelar', extra: { autorRemovido: false }, esperado: ['sem-permissao', 'sem-permissao', 'sem-permissao', 'sem-permissao', true] },
]

const COLUNAS: [string, Quem][] = [['dono', D], ['moderador', M], ['membro', m], ['não membro', n], ['banido', B]]

describe('matriz da comunidade (seção 8.1), célula por célula', () => {
  for (const l of MATRIZ) {
    for (const [i, [nome, q]] of COLUNAS.entries()) {
      it(`${l.acao}${l.acesso ? ` (${l.acesso})` : ''}${l.extra ? ` ${JSON.stringify(l.extra)}` : ''} · ${nome}`, () => {
        expect(veredito(podeNaComunidade(l.acao, q, l.acesso ?? 'aberta', l.extra))).toBe(l.esperado[i])
      })
    }
  }

  it('banido que ainda carrega um papel não ganha poder nenhum', () => {
    const banidoDono: Quem = { papel: 'dono', banido: true }
    for (const a of ['convidar', 'fixar', 'editar-dados', 'promover', 'transferir', 'ver-moderacao', 'ver-apelacoes'] as AcaoComunidade[]) {
      expect(veredito(podeNaComunidade(a, banidoDono, 'aberta'))).toBe('sem-permissao')
    }
    expect(veredito(podeNaComunidade('remover-alheio', { papel: 'moderador', banido: true }, 'aberta'))).toBe('sem-permissao')
    expect(veredito(podeNaComunidade('editar-meu-topico', { papel: 'membro', banido: true }, 'aberta', { meuTopico: true }))).toBe('sem-permissao')
    expect(veredito(podeNaComunidade('resolver', { papel: 'membro', banido: true }, 'aberta', { meuTopico: true }))).toBe('sem-permissao')
    expect(veredito(podeNaComunidade('ler', { papel: 'membro', banido: true }, 'fechada'))).toBe('nao-encontrado')
  })

  it('o banido vê o fórum aberto, mas não entra (banido) e não posta (banido)', () => {
    expect(veredito(podeNaComunidade('ler', B, 'aberta'))).toBe(true)
    expect(veredito(podeNaComunidade('entrar', B, 'aberta'))).toBe('banido')
    expect(veredito(podeNaComunidade('postar-topico', { papel: 'membro', banido: true }, 'aberta'))).toBe('banido')
  })
})

describe('casos de borda da matriz', () => {
  it('ver a moderação não depende do conteúdo ser do dono; só o dono e o moderador veem', () => {
    expect(veredito(podeNaComunidade('ver-moderacao', M, 'aberta', { conteudoDoDono: true }))).toBe(true)
    expect(veredito(podeNaComunidade('ver-moderacao', m, 'aberta', { conteudoDoDono: true }))).toBe('sem-permissao')
  })
  it('o moderador só expulsa quem se sabe que é membro comum (papel desconhecido não basta)', () => {
    for (const alvoPapel of [null, undefined]) expect(veredito(podeNaComunidade('expulsar', M, 'aberta', { alvoPapel }))).toBe('sem-permissao')
    expect(veredito(podeNaComunidade('expulsar', M, 'aberta'))).toBe('sem-permissao')
    expect(veredito(podeNaComunidade('expulsar', D, 'aberta'))).toBe(true)
  })
})

describe('carência de membro', () => {
  it('tópico e voto esperam 1 hora; resposta, 10 minutos; reação não espera', () => {
    expect(CARENCIA_TOPICO_S).toBe(3600)
    expect(CARENCIA_RESPOSTA_S).toBe(600)
    for (const a of ['postar-topico', 'votar'] as const) {
      expect(veredito(podeNaComunidade(a, { ...m, membroHa: 3599 }, 'aberta'))).toBe('conta-nova')
      expect(veredito(podeNaComunidade(a, { ...m, membroHa: 3600 }, 'aberta'))).toBe(true)
    }
    expect(veredito(podeNaComunidade('responder', { ...m, membroHa: 599 }, 'aberta'))).toBe('conta-nova')
    expect(veredito(podeNaComunidade('responder', { ...m, membroHa: 600 }, 'aberta'))).toBe(true)
    expect(veredito(podeNaComunidade('reagir', { ...m, membroHa: 0 }, 'aberta'))).toBe(true)
  })
  it('dono e moderador não esperam; sem `membroHa` não há carência a checar', () => {
    for (const q of [D, M]) for (const a of ['postar-topico', 'responder', 'votar'] as const) expect(veredito(podeNaComunidade(a, { ...q, membroHa: 0 }, 'aberta'))).toBe(true)
    expect(veredito(podeNaComunidade('postar-topico', m, 'aberta'))).toBe(true)
  })
  it('o banido é barrado antes da carência, e o não membro também', () => {
    expect(veredito(podeNaComunidade('postar-topico', { ...B, membroHa: 99999 }, 'aberta'))).toBe('banido')
    expect(veredito(podeNaComunidade('postar-topico', { ...n, membroHa: 99999 }, 'aberta'))).toBe('nao-e-membro')
  })
})

// ---- perfil (8.2) -------------------------------------------------------------------------------------

const rel = (extra: Partial<RelacaoComODono> = {}): RelacaoComODono => ({ proprio: false, amigo: false, amigoHaDias: 0, contaDias: 30, bloqueio: false, recados: 'todos', ...extra })
const vp = (a: Parameters<typeof podeNoPerfil>[0], r: RelacaoComODono): R => veredito(podeNoPerfil(a, r))

describe('matriz do perfil (seção 8.2)', () => {
  it('apagar recado, decidir depoimento e ler pendentes: só o dono', () => {
    for (const a of ['apagar-recado', 'decidir-depoimento', 'ler-pendentes'] as const) {
      expect(vp(a, rel({ proprio: true }))).toBe(true)
      expect(vp(a, rel({ amigo: true, amigoHaDias: 99 }))).toBe('sem-permissao')
      expect(vp(a, rel())).toBe('sem-permissao')
      expect(vp(a, rel({ bloqueio: true }))).toBe('sem-permissao')
    }
  })
  it('recado: o dono não escreve no próprio mural; conforme o campo `recados`', () => {
    expect(vp('recado', rel({ proprio: true }))).toBe('sem-permissao')
    expect(vp('recado', rel({ recados: 'todos' }))).toBe(true)
    expect(vp('recado', rel({ recados: 'todos', amigo: true }))).toBe(true)
    expect(vp('recado', rel({ recados: 'amigos' }))).toBe('interacao-nao-permitida')
    expect(vp('recado', rel({ recados: 'amigos', amigo: true }))).toBe(true)
    expect(vp('recado', rel({ recados: 'ninguem' }))).toBe('interacao-nao-permitida')
    expect(vp('recado', rel({ recados: 'ninguem', amigo: true }))).toBe('interacao-nao-permitida')
  })
  it('bloqueio: a resposta é a MESMA de "só amigos" e de "ninguém", para não dizer qual', () => {
    expect(vp('recado', rel({ bloqueio: true }))).toBe('interacao-nao-permitida')
    expect(vp('recado', rel({ bloqueio: true, amigo: true, amigoHaDias: 99 }))).toBe('interacao-nao-permitida')
    expect(vp('pedir-amizade', rel({ bloqueio: true }))).toBe('interacao-nao-permitida')
    expect(vp('depoimento', rel({ bloqueio: true, amigo: true, amigoHaDias: 99 }))).toBe('interacao-nao-permitida')
    expect(vp('selo', rel({ bloqueio: true, amigo: true, amigoHaDias: 99 }))).toBe('interacao-nao-permitida')
  })
  it('depoimento: amigo há 3 dias ou mais, com conta de 3 dias ou mais', () => {
    expect(DIAS_PARA_DEPOIMENTO).toBe(3)
    const amigo = { amigo: true }
    expect(vp('depoimento', rel({ ...amigo, amigoHaDias: 3, contaDias: 3 }))).toBe(true)
    expect(vp('depoimento', rel({ ...amigo, amigoHaDias: 2.99, contaDias: 30 }))).toBe('conta-nova')
    expect(vp('depoimento', rel({ ...amigo, amigoHaDias: 30, contaDias: 2.99 }))).toBe('conta-nova')
    expect(vp('depoimento', rel({ amigoHaDias: 30 }))).toBe('sem-permissao')
    expect(vp('depoimento', rel({ proprio: true, amigo: true, amigoHaDias: 30 }))).toBe('sem-permissao')
  })
  it('selo: amigo há 7 dias ou mais, com conta de 7 dias ou mais', () => {
    expect(DIAS_PARA_SELO).toBe(7)
    const amigo = { amigo: true }
    expect(vp('selo', rel({ ...amigo, amigoHaDias: 7, contaDias: 7 }))).toBe(true)
    expect(vp('selo', rel({ ...amigo, amigoHaDias: 6.99, contaDias: 30 }))).toBe('conta-nova')
    expect(vp('selo', rel({ ...amigo, amigoHaDias: 30, contaDias: 6.99 }))).toBe('conta-nova')
    expect(vp('selo', rel({ amigoHaDias: 30 }))).toBe('sem-permissao')
    expect(vp('selo', rel({ proprio: true, amigo: true, amigoHaDias: 30 }))).toBe('sem-permissao')
  })
  it('pedir amizade: não a si, não a quem já é amigo, não com bloqueio', () => {
    expect(vp('pedir-amizade', rel())).toBe(true)
    expect(vp('pedir-amizade', rel({ proprio: true }))).toBe('sem-permissao')
    expect(vp('pedir-amizade', rel({ amigo: true }))).toBe('ja-existe')
  })
  it('bloquear e silenciar: qualquer um, menos a si mesmo', () => {
    for (const a of ['bloquear', 'silenciar'] as const) {
      expect(vp(a, rel())).toBe(true)
      expect(vp(a, rel({ bloqueio: true }))).toBe(true)
      expect(vp(a, rel({ proprio: true }))).toBe('sem-permissao')
    }
  })
})

// ---- página (8.3) ---------------------------------------------------------------------------------------

describe('matriz da página (seção 8.3)', () => {
  const v = (a: Parameters<typeof podeNaPagina>[0], p: Parameters<typeof podeNaPagina>[1]): R => veredito(podeNaPagina(a, p))
  it('ler e seguir: todo mundo', () => {
    for (const p of ['dono', 'administrador', null] as const) for (const a of ['ler', 'seguir'] as const) expect(v(a, p)).toBe(true)
  })
  it('publicar e atualizar: dono e administrador', () => {
    for (const a of ['publicar', 'atualizar'] as const) {
      expect(v(a, 'dono')).toBe(true)
      expect(v(a, 'administrador')).toBe(true)
      expect(v(a, null)).toBe('sem-permissao')
    }
  })
  it('gerir administradores, remover atualização alheia e remover a página: só o dono', () => {
    for (const a of ['gerir-administradores', 'remover-atualizacao-alheia', 'remover-pagina'] as const) {
      expect(v(a, 'dono')).toBe(true)
      expect(v(a, 'administrador')).toBe('sem-permissao')
      expect(v(a, null)).toBe('sem-permissao')
    }
  })
})

// ---- mover e editar tópico -------------------------------------------------------------------------------

describe('podeMoverTopico', () => {
  const ok = (o: Parameters<typeof podeMoverTopico>[0], d: Parameters<typeof podeMoverTopico>[1]): R => veredito(podeMoverTopico(o, d))
  it('exige papel de equipe nos DOIS lados', () => {
    expect(ok({ papel: 'moderador', acesso: 'aberta' }, { papel: 'moderador', acesso: 'aberta' })).toBe(true)
    expect(ok({ papel: 'dono', acesso: 'aberta' }, { papel: 'dono', acesso: 'moderada' })).toBe(true)
    expect(ok({ papel: 'moderador', acesso: 'aberta' }, { papel: 'membro', acesso: 'aberta' })).toBe('sem-permissao')
    expect(ok({ papel: 'moderador', acesso: 'aberta' }, { papel: null, acesso: 'aberta' })).toBe('sem-permissao')
    expect(ok({ papel: 'membro', acesso: 'aberta' }, { papel: 'moderador', acesso: 'aberta' })).toBe('sem-permissao')
    expect(ok({ papel: null, acesso: 'aberta' }, { papel: 'dono', acesso: 'aberta' })).toBe('sem-permissao')
  })
  it('de fechada para não fechada só o dono da origem (torna público)', () => {
    expect(ok({ papel: 'moderador', acesso: 'fechada' }, { papel: 'moderador', acesso: 'aberta' })).toBe('sem-permissao')
    expect(ok({ papel: 'moderador', acesso: 'fechada' }, { papel: 'dono', acesso: 'moderada' })).toBe('sem-permissao')
    expect(ok({ papel: 'dono', acesso: 'fechada' }, { papel: 'moderador', acesso: 'aberta' })).toBe(true)
    expect(ok({ papel: 'dono', acesso: 'fechada' }, { papel: 'dono', acesso: 'moderada' })).toBe(true)
  })
  it('entre duas fechadas, e de aberta para fechada, o moderador pode', () => {
    expect(ok({ papel: 'moderador', acesso: 'fechada' }, { papel: 'moderador', acesso: 'fechada' })).toBe(true)
    expect(ok({ papel: 'moderador', acesso: 'aberta' }, { papel: 'moderador', acesso: 'fechada' })).toBe(true)
  })
})

describe('podeEditarTopico', () => {
  const base = { meuTopico: true, criadoEmMs: 1_000_000, agoraMs: 1_000_000, edicoes: 0, trancado: false }
  const ed = (x: Partial<typeof base>) => veredito(podeEditarTopico({ ...base, ...x }) as ReturnType<typeof podeNaComunidade>)
  it('as constantes são as do protocolo', () => {
    expect(EDICAO_TOPICO_S).toBe(1800)
    expect(MAX_EDICOES_TOPICO).toBe(5)
  })
  it('janela de 30 minutos: no limite exato pode, 1 ms depois não', () => {
    expect(ed({ agoraMs: base.criadoEmMs + 1_800_000 })).toBe(true)
    expect(ed({ agoraMs: base.criadoEmMs + 1_800_001 })).toBe('fora-da-janela' as Negacao)
  })
  it('no máximo 5 edições: a quinta ainda cabe, a sexta não', () => {
    expect(ed({ edicoes: 4 })).toBe(true)
    expect(ed({ edicoes: 5 })).toBe('limite-de-estrutura' as Negacao)
  })
  it('só o autor edita, e tópico trancado não se edita', () => {
    expect(ed({ meuTopico: false })).toBe('sem-permissao')
    expect(ed({ trancado: true })).toBe('trancado' as Negacao)
  })
  it('a ordem das recusas: autor, depois trancado, depois janela, depois limite', () => {
    const tudoErrado = { meuTopico: false, trancado: true, agoraMs: base.criadoEmMs + 9_999_999, edicoes: 9 }
    expect(ed(tudoErrado)).toBe('sem-permissao')
    expect(ed({ ...tudoErrado, meuTopico: true })).toBe('trancado' as Negacao)
    expect(ed({ ...tudoErrado, meuTopico: true, trancado: false })).toBe('fora-da-janela' as Negacao)
  })
})
