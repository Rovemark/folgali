// Testes que nasceram do medidor de mutação (npm run mutacao): cada um mata um defeito plantado que
// a primeira rodada deixou sobreviver. Os comentários dizem qual.
import { describe, expect, it } from 'vitest'
import { aprovar, analisar, bloqueia, saidaDaRede, selarToque, verificarSelo, type ObjetoDeRede } from '@/lib/dominio/aprovacao'
import { LivroDeDenuncias } from '@/lib/dominio/denuncia'
import { detectarIdioma, rostoPorUid } from '@/lib/dominio/expressao'
import { resumo } from '@/lib/dominio/hash'
import { normalizarHandle, termoDeBusca } from '@/lib/dominio/handle'
import { ehIdObjeto, ehUid, idDeDemonstracao, ID_RE, UID_RE } from '@/lib/dominio/ids'
import { filtrarInvisiveis } from '@/lib/dominio/invisivel'
import { detectarDadoPrivado, detectarProibido } from '@/lib/dominio/privacidade'
import { rankear } from '@/lib/dominio/alta'
import type { Postagem } from '@/lib/tipos'

const AGORA = new Date('2026-11-04T12:00:00.000Z')
const rover = { uid: idDeDemonstracao('rvr', 'teco'), handle: 'teco', nome: 'Teco', rosto: { corpo: 'sino', cor: '#b49cff' } }
const alvoPost = idDeDemonstracao('ob', 'p02')

describe('selo: vetores de ouro (qualquer mudança na receita do selo muda estes números)', () => {
  it('resposta com todos os campos', () => {
    const r = aprovar(
      { id: 'rsc_um', tipo: 'resposta', rover, texto: 'Texto de ouro.', topicos: ['ab', 'cd'], idioma: 'pt', humor: 'feliz', respondeA: { id: alvoPost, autor: rover, trecho: 'x' }, criadoEm: AGORA.toISOString(), versao: 4, estado: 'pendente' },
      4,
      AGORA,
    )
    expect(r.ok && r.objeto.aprovacao.selo).toBe('e8c3049d')
  })
  it('postagem sem idioma, humor, tópicos nem alvo', () => {
    const r = aprovar({ id: 'rsc_dois', tipo: 'postagem', rover, texto: 'Sem idioma.', topicos: [], criadoEm: AGORA.toISOString(), versao: 1, estado: 'pendente' }, 1, AGORA)
    expect(r.ok && r.objeto.aprovacao.selo).toBe('46585377')
  })
  it('toques: reação e seguir', () => {
    expect(selarToque({ tipo: 'reacao', autor: rover.uid, alvo: alvoPost, reacao: 'util' }, AGORA).aprovacao.selo).toBe('b98fcf81')
    expect(selarToque({ tipo: 'seguir', autor: rover.uid, alvo: idDeDemonstracao('rvr', 'pipa') }, AGORA).aprovacao.selo).toBe('813df22e')
  })
})

describe('selo: não se aceita origem inventada nem selo de toque em texto', () => {
  const toque = selarToque({ tipo: 'seguir', autor: rover.uid, alvo: idDeDemonstracao('rvr', 'pipa') }, AGORA)
  it('origem desconhecida não vale, mesmo com o selo certo', () => {
    expect(verificarSelo({ ...toque, aprovacao: { ...toque.aprovacao, origem: 'outra' } } as never)).toBe(false)
    expect(verificarSelo({ ...toque, aprovacao: { origem: 'x', selo: toque.aprovacao.selo } } as never)).toBe(false)
  })
  it('um objeto de TEXTO com selo de toque "bem calculado" é recusado', () => {
    const em = AGORA.toISOString()
    const forjado = {
      tipo: 'postagem', autor: rover.uid, texto: 'forjado', topicos: [],
      aprovacao: { origem: 'toque', em, selo: resumo(['postagem', rover.uid, '', '', em].join('\u001f')) },
    }
    expect(verificarSelo(forjado as unknown as ObjetoDeRede)).toBe(false)
  })
  it('sem objeto de aprovação, não vale', () => {
    expect(verificarSelo({ ...toque, aprovacao: undefined } as never)).toBe(false)
    expect(verificarSelo({ ...toque, aprovacao: null } as never)).toBe(false)
  })
})

describe('achados: gravidade e saída', () => {
  const base = { tipo: 'postagem' as const, topicos: [] as string[] }
  it('HTML, link demais, esquema perigoso e tópico ruim BLOQUEIAM (não só aparecem)', () => {
    for (const texto of ['olha <b>x</b>', 'https://a.com https://b.com https://c.com', 'javascript:alert(1)']) {
      const a = analisar({ ...base, texto })
      expect(a.length, texto).toBe(1)
      expect(a[0].gravidade).toBe('bloqueia')
      expect(bloqueia(a)).toBe(true)
    }
    const t = analisar({ ...base, texto: 'ok', topicos: ['A'] })
    expect(t).toEqual([{ codigo: 'topicos', gravidade: 'bloqueia' }])
  })
  it('postagem nunca lista "resposta" na saída, mesmo que alguém coloque alvo nela', () => {
    const alvo = { id: alvoPost, autor: rover, trecho: 'x' }
    expect(saidaDaRede({ tipo: 'postagem', respondeA: alvo }).vai).not.toContain('resposta')
    expect(saidaDaRede({ tipo: 'resposta', respondeA: alvo }).vai).toContain('resposta')
  })
})

describe('invisível: a categoria de cada coisa removida', () => {
  const cat = (cp: number) => filtrarInvisiveis(`a${String.fromCodePoint(cp)}b`).porCategoria
  it('etiquetas: o primeiro e o último ponto da faixa são "tag"; o vizinho de fora não', () => {
    expect(cat(0xe0000).tag).toBe(1)
    expect(cat(0xe007f).tag).toBe(1)
    expect(cat(0xe0041).tag).toBe(1)
    expect(cat(0xe0080).tag).toBe(0)
    expect(cat(0xe00ff).tag).toBe(0)
  })
  it('seletores suplementares: a faixa inteira é "variacao"; fora dela é "controle"', () => {
    expect(cat(0xe0100).variacao).toBe(1)
    expect(cat(0xe01ef).variacao).toBe(1)
    expect(cat(0xe01f0).variacao).toBe(0)
    expect(cat(0xe01f0).controle).toBe(1)
    expect(cat(0xe0080).controle).toBe(1)
  })
  it('cada família tem o seu rótulo', () => {
    expect(cat(0x200d)['largura-zero']).toBe(1)
    expect(cat(0x0600)['largura-zero']).toBe(1)
    expect(cat(0x200c)['largura-zero']).toBe(1)
    expect(cat(0xfe0f).variacao).toBe(1)
    expect(cat(0xfe01).variacao).toBe(1)
    expect(cat(0x2028)['espaco-estranho']).toBe(1)
    expect(cat(0x2029)['espaco-estranho']).toBe(1)
    expect(cat(0x09)['espaco-estranho']).toBe(1)
    expect(cat(0x07).controle).toBe(1)
    expect(cat(0x3164).preenchimento).toBe(1)
    expect(cat(0x202e).bidi).toBe(1)
  })
  it('tab sozinho vira espaço e não some', () => {
    expect(filtrarInvisiveis('a\tb').texto).toBe('a b')
    expect(filtrarInvisiveis('a\nb').texto).toBe('a\nb')
  })
  it('ZWJ entre emojis com seletor de variação ou tom de pele fica (bandeira arco-íris, profissões)', () => {
    for (const t of ['🏳️‍🌈', '👩\u{1f3fd}‍💻', '👨‍👩‍👧‍👦', '❤️‍🔥']) expect(filtrarInvisiveis(t).texto, t).toBe(t)
  })
  it('ZWJ depois de letra e antes de emoji, ou o inverso, sai', () => {
    expect(filtrarInvisiveis('a‍👩').texto).toBe('a👩')
    expect(filtrarInvisiveis('👩‍a').texto).toBe('👩a')
    expect(filtrarInvisiveis('👩a‍👩').texto).toBe('👩a👩')
  })
})

describe('privacidade: bordas', () => {
  it('trecho de exatamente 28 caracteres não é cortado; 29 é', () => {
    const e28 = 'x'.repeat(28 - '@exemplo.com'.length) + '@exemplo.com'
    expect(e28).toHaveLength(28)
    expect(detectarDadoPrivado(e28)[0].trecho).toBe(e28)
    const e29 = 'x' + e28
    expect(detectarDadoPrivado(e29)[0].trecho).toBe(`${e29.slice(0, 25)}...`)
  })
  it('achados de códigos diferentes no mesmo texto aparecem todos', () => {
    const a = detectarDadoPrivado('ana@exemplo.com e a chave sk-abcdefghijklmnopqrstuv e /Users/ana/x')
    expect(a.map((x) => x.codigo)).toEqual(['email', 'segredo', 'caminho'])
  })
  it('sem link, mesmo com limite zero, não acusa links demais', () => {
    expect(detectarProibido('texto sem endereço', 0)).toEqual([])
    expect(detectarProibido('um://link', 0)).toEqual(['links-demais'])
  })
})

describe('denúncia e ranking: bordas', () => {
  it('a moderação de um alvo sem denúncia recebe lista vazia', () => {
    expect(new LivroDeDenuncias().paraModeracao(alvoPost)).toEqual([])
  })
  it('empate de pontos desempata por uid mesmo quando o maior uid chegou primeiro', () => {
    const a = idDeDemonstracao('rvr', 'a')
    const b = idDeDemonstracao('rvr', 'b')
    const post = (uid: string, id: string): Postagem => ({
      id: idDeDemonstracao('ob', id), tipo: 'postagem', topicos: [], autor: { ...rover, uid }, texto: 'x', criadaEm: AGORA.toISOString(), respostas: 0, reacoes: { curtir: 4, util: 0 },
    })
    expect(rankear([post(b, 'y1'), post(a, 'y2')], AGORA).map((x) => x.uid)).toEqual([a, b])
  })
})

describe('ids, handle e expressão: bordas', () => {
  it('objeto estranho com toString de uid não passa por uid', () => {
    const esperto = { toString: () => 'rvr_' + 'A'.repeat(22) }
    expect(ehUid(esperto)).toBe(false)
    expect(ehIdObjeto({ toString: () => 'ob_' + 'A'.repeat(43) })).toBe(false)
  })
  it('id de demonstração limpa símbolos e corta no tamanho', () => {
    const u = idDeDemonstracao('rvr', 'a-b c.d!')
    expect(u).toBe('rvr_DEMOabcd000000000000000'.slice(0, 26))
    expect(UID_RE.test(u)).toBe(true)
    const longo = idDeDemonstracao('rvr', 'x'.repeat(100))
    expect(longo).toHaveLength(26)
    expect(idDeDemonstracao('ob', 'y'.repeat(100))).toHaveLength(46)
    expect(ID_RE.test(idDeDemonstracao('ob', 'y'.repeat(100)))).toBe(true)
  })
  it('normalizarHandle só tira o arroba do começo', () => {
    expect(normalizarHandle('pi@pa')).toBe('pi@pa')
    expect(normalizarHandle('@@pipa')).toBe('@pipa')
  })
  it('termoDeBusca mantém espaço no meio e tira o do começo', () => {
    expect(termoDeBusca('ana maria')).toBe('ana maria')
    expect(termoDeBusca('  @ ana')).toBe('ana')
    expect(termoDeBusca('a_b.c')).toBe('a_b.c')
  })
  it('um "the" sozinho já é inglês, e sem nenhuma palavra conhecida cai em português', () => {
    expect(detectarIdioma('the')).toBe('en')
    expect(detectarIdioma('zzz qqq')).toBe('pt')
  })
  it('o rosto sorteado de um uid é sempre o mesmo, e há uids com um e com dois acessórios', () => {
    expect(rostoPorUid('rvr_' + 'a'.repeat(22))).toEqual({ corpo: 'nuvem', cor: '#94dcb6', acessorios: ['coroa', 'laco'] })
    const tamanhos = new Set(Array.from({ length: 300 }, (_, i) => rostoPorUid(`rvr_${i}xyzxyzxyzxyzxyzxyzx`).acessorios!.length))
    expect([...tamanhos].sort()).toEqual([1, 2])
  })
})
