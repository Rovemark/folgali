// Aprovação humana da parte social: o esquema de cada um dos 13 tipos, os limites nas bordas, a análise,
// "o que sai", e o ciclo aprovar / editar / recusar / selar. Os limites vêm da especificação, escritos aqui à mão
// (não derivados do código): se alguém mexer num número, o teste acusa.
import { describe, expect, it } from 'vitest'
import {
  ESQUEMA_SOCIAL, TIPOS_SOCIAIS, analisarSocial, aprovarSocial, bloqueiaSocial, editarSocial, ehTipoSocial, limparCampo, recusarSocial, saidaDaRedeSocial, verificarSeloSocial,
  type AchadoSocial, type Campos, type RascunhoSocial, type TipoSocial,
} from '@/lib/dominio/aprovacao-social'
import { idDeDemonstracao } from '@/lib/dominio/ids'

const AGORA = new Date('2026-11-05T12:00:00.000Z')
const rover = { uid: idDeDemonstracao('rvr', 'lumi'), handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff' } }
const U = idDeDemonstracao('rvr', 'pipa')
const O = (r: string) => idDeDemonstracao('ob', r)

/** Texto de exatamente `n` caracteres que não acende filtro nenhum (palavras curtas separadas por espaço). */
const t = (n: number): string => {
  let s = ''
  while (s.length < n) s += 'ab '
  s = s.slice(0, n)
  return s.endsWith(' ') ? s.slice(0, -1) + 'x' : s
}

const VALIDOS: Record<TipoSocial, Campos> = {
  recado: { alvo: U, texto: 'Oi, Pipa! Gostei do mapa.' },
  depoimento: { alvo: U, texto: 'Organiza tudo com carinho.' },
  entrega: { titulo: 'Mapa da pasta de fotos', descricao: 'Organizei as fotos por ano.', resultado: 'Achar uma foto leva segundos.', tags: ['arquivos'] },
  'comunidade-criar': { nome: 'Cinema de Sofá', descricao: 'Para quem ama organizar.', regras: 'Seja gentil.', tema: 'arquivos', acesso: 'aberta', categorias: ['Dúvidas', 'Dicas'] },
  'comunidade-atualizar': { comunidade: O('ccinema'), nome: 'Cinema de Sofá', descricao: '', regras: '', tema: 'arquivos', acesso: 'moderada', categorias: [] },
  'comunidade-posse': { comunidade: O('ccinema'), acao: 'transferir', novoDono: U },
  topico: { comunidade: O('ccinema'), categoria: 'Dúvidas', titulo: 'Como nomear backups?', texto: 'Uso data no começo.', tags: ['backup'], enquete: [], enqueteDias: '7' },
  'topico-editar': { topico: O('tcinemapipoca'), titulo: 'Como nomear backups?', texto: 'Uso data no começo, e vocês?', tags: [] },
  'resposta-forum': { topico: O('tcinemapipoca'), em: null, cita: null, texto: 'Eu uso o ano primeiro.' },
  'pagina-criar': { nome: 'Disco da Semana', descricao: 'Palavras e seus sentidos.', tema: 'idiomas' },
  'pagina-atualizar': { pagina: O('gdisco'), nome: 'Disco da Semana', descricao: '', tema: 'idiomas' },
  'pagina-publicar': { pagina: O('gdisco'), titulo: 'Plural de pastel', texto: 'Pastéis, mas ainda hesito.', tags: ['plural'] },
  apelacao: { tipo: 'remocao', alvo: O('fparamoderar'), texto: 'Acho que removeram sem querer.' },
  // 0.4.0: mensagens privadas
  'conversa-pedir': { alvo: U, texto: 'Posso conversar a dois?' },
  mensagem: { conversa: O('conversapipa'), texto: 'Oi, Pipa.' },
}

const rasc = (tipo: TipoSocial, campos: Campos = {}, extra: Partial<RascunhoSocial> = {}): RascunhoSocial => ({
  id: 'rsc_s1', tipo, rover, campos: { ...VALIDOS[tipo], ...campos }, destino: { rotulo: 'algum lugar' }, criadoEm: AGORA.toISOString(), versao: 1, estado: 'pendente', ...extra,
})
const achados = (tipo: TipoSocial, campos: Campos = {}) => analisarSocial(rasc(tipo, campos))
// inclui a gravidade quando NÃO é a que bloqueia: um achado que deveria bloquear e só avisa sai com o sufixo e o teste acusa
const codigos = (a: AchadoSocial[]) => a.map((x) => `${x.codigo}@${x.campo ?? ''}${x.gravidade === 'bloqueia' ? '' : `(${x.gravidade})`}`)

describe('o esquema dos 15 tipos', () => {
  it('são exatamente os 15 tipos com aprovação a cada uso que carregam texto, controle ou publicam algo (13 da 0.3 e os 2 de texto da 0.4.0)', () => {
    expect([...TIPOS_SOCIAIS].sort()).toEqual(['apelacao', 'comunidade-atualizar', 'comunidade-criar', 'comunidade-posse', 'conversa-pedir', 'depoimento', 'entrega', 'mensagem', 'pagina-atualizar', 'pagina-criar', 'pagina-publicar', 'recado', 'resposta-forum', 'topico', 'topico-editar'])
    expect(ehTipoSocial('recado')).toBe(true)
    expect(ehTipoSocial('postagem')).toBe(false)
    expect(ehTipoSocial(undefined)).toBe(false)
  })
  it('todo exemplo válido passa limpo, sem nenhum achado', () => {
    for (const tipo of TIPOS_SOCIAIS) expect(achados(tipo), tipo).toEqual([])
  })
  // [tipo, campo, min, max, links]: os limites da seção 4 da especificação
  const LIMITES: [TipoSocial, string, number, number, number][] = [
    ['recado', 'texto', 1, 500, 1],
    ['depoimento', 'texto', 1, 600, 0],
    ['entrega', 'titulo', 3, 80, 0], ['entrega', 'descricao', 1, 400, 0], ['entrega', 'resultado', 1, 300, 0],
    ['comunidade-criar', 'nome', 3, 60, 0], ['comunidade-criar', 'descricao', 0, 500, 0], ['comunidade-criar', 'regras', 0, 1000, 0],
    ['comunidade-atualizar', 'nome', 3, 60, 0], ['comunidade-atualizar', 'descricao', 0, 500, 0], ['comunidade-atualizar', 'regras', 0, 1000, 0],
    ['topico', 'titulo', 3, 120, 0], ['topico', 'texto', 1, 2000, 2],
    ['topico-editar', 'titulo', 3, 120, 0], ['topico-editar', 'texto', 1, 2000, 2],
    ['resposta-forum', 'texto', 1, 1500, 2],
    ['pagina-criar', 'nome', 3, 60, 0], ['pagina-criar', 'descricao', 0, 500, 0],
    ['pagina-atualizar', 'nome', 3, 60, 0], ['pagina-atualizar', 'descricao', 0, 500, 0],
    ['pagina-publicar', 'titulo', 1, 100, 0], ['pagina-publicar', 'texto', 1, 1500, 2],
    ['apelacao', 'texto', 1, 500, 0],
  ]
  it('o esquema declara os limites da especificação', () => {
    for (const [tipo, campo, min, max, links] of LIMITES) {
      const c = ESQUEMA_SOCIAL[tipo].find((x) => x.nome === campo)!
      expect([c.min, c.max, c.links ?? 0], `${tipo}.${campo}`).toEqual([min, max, links])
    }
  })
  for (const [tipo, campo, min, max] of LIMITES) {
    it(`${tipo}.${campo}: ${max} cabe, ${max + 1} passa em 1`, () => {
      expect(achados(tipo, { [campo]: t(max) }), 'no limite').toEqual([])
      expect(codigos(achados(tipo, { [campo]: t(max + 1) })), 'acima').toEqual([`longo@${campo}`])
      expect(achados(tipo, { [campo]: t(max + 1) })[0].quantidade).toBe(1)
    })
    if (min >= 2) {
      it(`${tipo}.${campo}: ${min} cabe, ${min - 1} falta 1`, () => {
        expect(achados(tipo, { [campo]: t(min) }), 'no mínimo').toEqual([])
        const a = achados(tipo, { [campo]: t(min - 1) })
        expect(codigos(a)).toEqual([`curto@${campo}`])
        expect(a[0].quantidade).toBe(1)
      })
    }
    if (min === 1 && ESQUEMA_SOCIAL[tipo].find((x) => x.nome === campo)!.obrigatorio) {
      it(`${tipo}.${campo}: vazio bloqueia (campo obrigatório)`, () => {
        expect(codigos(achados(tipo, { [campo]: '   ' }))).toEqual([`vazio@${campo}`])
        expect(codigos(achados(tipo, { [campo]: null }))).toEqual([`vazio@${campo}`])
      })
    }
    if (min === 0) {
      it(`${tipo}.${campo}: pode ficar vazio`, () => {
        expect(achados(tipo, { [campo]: '' })).toEqual([])
        expect(achados(tipo, { [campo]: null })).toEqual([])
      })
    }
  }
  it('o título da atualização de página é opcional', () => {
    expect(achados('pagina-publicar', { titulo: null })).toEqual([])
    expect(achados('pagina-publicar', { titulo: '' })).toEqual([])
  })
  it('conta pontos de código, não unidades: 80 emojis cabem num título de 80', () => {
    expect(achados('entrega', { titulo: '🧶'.repeat(80) })).toEqual([])
    expect(codigos(achados('entrega', { titulo: '🧶'.repeat(81) }))).toEqual(['longo@titulo'])
  })
  it('linha única: quebra de linha no título bloqueia; multilinha aceita', () => {
    expect(codigos(achados('entrega', { titulo: 'Mapa\nde fotos' }))).toEqual(['varias-linhas@titulo'])
    expect(achados('entrega', { descricao: 'Primeira linha.\nSegunda linha.' })).toEqual([])
  })

  describe('listas e escolhas', () => {
    it('tags: até 3 na entrega, 5 no tópico, 3 na atualização; cada uma 2 a 24, sem repetir', () => {
      expect(achados('entrega', { tags: ['aa', 'bb', 'cc'] })).toEqual([])
      expect(codigos(achados('entrega', { tags: ['aa', 'bb', 'cc', 'dd'] }))).toEqual(['itens-demais@tags'])
      expect(achados('topico', { tags: ['aa', 'bb', 'cc', 'dd', 'ee'] })).toEqual([])
      expect(codigos(achados('topico', { tags: ['aa', 'bb', 'cc', 'dd', 'ee', 'ff'] }))).toEqual(['itens-demais@tags'])
      expect(achados('pagina-publicar', { tags: ['aa', 'bb', 'cc'] })).toEqual([])
      expect(codigos(achados('pagina-publicar', { tags: ['aa', 'bb', 'cc', 'dd'] }))).toEqual(['itens-demais@tags'])
      expect(codigos(achados('entrega', { tags: ['aa', 'aa'] }))).toEqual(['repetido@tags'])
      for (const ruim of ['a', 'Ab', '-ab', 'a b', 'ação', 'a'.repeat(25)]) expect(codigos(achados('entrega', { tags: [ruim] })), ruim).toEqual(['tag-invalida@tags'])
      expect(achados('entrega', { tags: ['a'.repeat(24)] })).toEqual([])
    })
    it('categorias: até 8, cada uma de 2 a 30 em uma linha, sem repetir ignorando caixa e acento', () => {
      const oito = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']
      expect(achados('comunidade-criar', { categorias: oito })).toEqual([])
      expect(codigos(achados('comunidade-criar', { categorias: [...oito, 'c9'] }))).toEqual(['itens-demais@categorias'])
      expect(achados('comunidade-criar', { categorias: [t(30)] })).toEqual([])
      expect(codigos(achados('comunidade-criar', { categorias: [t(31)] }))).toEqual(['item-longo@categorias'])
      expect(codigos(achados('comunidade-criar', { categorias: ['a'] }))).toEqual(['item-curto@categorias'])
      expect(achados('comunidade-criar', { categorias: ['ab'] })).toEqual([])
      expect(codigos(achados('comunidade-criar', { categorias: ['Dúvidas', 'duvidas'] }))).toEqual(['repetido@categorias'])
      expect(codigos(achados('comunidade-criar', { categorias: ['a\nb'] }))).toEqual(['varias-linhas@categorias'])
    })
    it('enquete: nenhuma opção, ou de 2 a 6 de até 60; uma só não é enquete', () => {
      expect(achados('topico', { enquete: [] })).toEqual([])
      expect(achados('topico', { enquete: null })).toEqual([])
      expect(codigos(achados('topico', { enquete: ['só uma'] }))).toEqual(['itens-poucos@enquete'])
      expect(achados('topico', { enquete: ['sim', 'não'] })).toEqual([])
      expect(achados('topico', { enquete: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual([])
      expect(codigos(achados('topico', { enquete: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }))).toEqual(['itens-demais@enquete'])
      expect(achados('topico', { enquete: [t(60), 'b'] })).toEqual([])
      expect(codigos(achados('topico', { enquete: [t(61), 'b'] }))).toEqual(['item-longo@enquete'])
      expect(codigos(achados('topico', { enquete: ['igual', 'Igual'] }))).toEqual(['repetido@enquete'])
    })
    it('a duração da enquete é uma das opções de 1 a 30 dias', () => {
      for (const d of ['1', '3', '7', '14', '30']) expect(achados('topico', { enqueteDias: d })).toEqual([])
      for (const d of ['0', '2', '31', '', 'sete']) expect(codigos(achados('topico', { enqueteDias: d })).length, d).toBe(1)
    })
    it('acesso e escolhas fechadas', () => {
      for (const a of ['aberta', 'moderada', 'fechada']) expect(achados('comunidade-criar', { acesso: a })).toEqual([])
      expect(codigos(achados('comunidade-criar', { acesso: 'publica' }))).toEqual(['opcao-invalida@acesso'])
      expect(codigos(achados('apelacao', { tipo: 'outra' }))).toEqual(['opcao-invalida@tipo'])
      expect(achados('apelacao', { tipo: 'banimento' })).toEqual([])
      expect(codigos(achados('comunidade-posse', { acao: 'vender' }))).toContain('opcao-invalida@acao')
    })
    it('o tema é uma tag de 2 a 24', () => {
      expect(achados('comunidade-criar', { tema: 'ab' })).toEqual([])
      expect(codigos(achados('comunidade-criar', { tema: 'a' }))).toEqual(['tag-invalida@tema'])
      expect(codigos(achados('comunidade-criar', { tema: 'Arquivos' }))).toEqual(['tag-invalida@tema'])
      expect(codigos(achados('comunidade-criar', { tema: '' }))).toEqual(['vazio@tema'])
    })
    it('referências: sem destino (vazia, ou que não é uid nem id) bloqueia; as opcionais podem faltar', () => {
      expect(codigos(achados('recado', { alvo: null }))).toEqual(['sem-destino@alvo'])
      expect(codigos(achados('recado', { alvo: 'pipa' }))).toEqual(['sem-destino@alvo'])
      expect(codigos(achados('resposta-forum', { topico: '' }))).toEqual(['sem-destino@topico'])
      expect(achados('resposta-forum', { em: O('f1'), cita: O('f2') })).toEqual([])
      expect(codigos(achados('resposta-forum', { em: 'xx' }))).toEqual(['sem-destino@em'])
    })
    it('posse: transferir pede um novo dono; encerrar não pode ter', () => {
      expect(codigos(achados('comunidade-posse', { novoDono: null }))).toEqual(['sem-destino@novoDono'])
      expect(achados('comunidade-posse', { acao: 'encerrar', novoDono: null })).toEqual([])
      expect(codigos(achados('comunidade-posse', { acao: 'encerrar', novoDono: U }))).toEqual(['opcao-invalida@novoDono'])
    })
  })
})

describe('texto: invisível, dado pessoal, links e marcas, campo a campo', () => {
  it('invisível comum só avisa; perigoso bloqueia', () => {
    const a = achados('recado', { texto: 'oi​mundo' })
    expect(a).toEqual([{ codigo: 'invisivel', gravidade: 'avisa', campo: 'texto', quantidade: 1 }])
    expect(bloqueiaSocial(a)).toBe(false)
    const p = achados('recado', { texto: 'oi‮mundo' })
    expect(p).toEqual([{ codigo: 'invisivel-perigoso', gravidade: 'bloqueia', campo: 'texto', quantidade: 1 }])
    expect(bloqueiaSocial(p)).toBe(true)
  })
  it('e-mail, número longo, caminho, CEP e coordenadas bloqueiam e dizem o campo', () => {
    expect(achados('recado', { texto: 'ana@exemplo.com' })[0]).toMatchObject({ codigo: 'email', campo: 'texto', gravidade: 'bloqueia', trecho: 'ana@exemplo.com' })
    expect(codigos(achados('recado', { texto: 'ligue 11 98765 4321' }))).toContain('numero-longo@texto')
    expect(codigos(achados('recado', { texto: 'veja /Users/ana/fotos' }))).toContain('caminho@texto')
    expect(codigos(achados('recado', { texto: 'moro no 12345-678' }))).toEqual(['cep@texto'])
    expect(codigos(achados('recado', { texto: 'estou em -23.5505, -46.6333' }))).toEqual(['coordenadas@texto'])
  })
  it('html e esquema perigoso bloqueiam', () => {
    expect(codigos(achados('recado', { texto: 'oi <b>você</b>' }))).toContain('html@texto')
    expect(codigos(achados('recado', { texto: 'veja javascript:alert(1)' }))).toContain('esquema-perigoso@texto')
  })
  it('links: o recado aceita 1; o depoimento, nenhum; o tópico, 2', () => {
    expect(achados('recado', { texto: 'veja https://exemplo.com/a' })).toEqual([])
    expect(codigos(achados('recado', { texto: 'https://a.com e https://b.com' }))).toEqual(['links-demais@texto'])
    expect(achados('recado', { texto: 'https://a.com e https://b.com' })[0].quantidade).toBe(1)
    expect(codigos(achados('depoimento', { texto: 'veja https://exemplo.com' }))).toEqual(['links-demais@texto'])
    expect(achados('topico', { texto: 'https://a.com e https://b.com' })).toEqual([])
    expect(codigos(achados('topico', { texto: 'https://a.com https://b.com https://c.com' }))).toEqual(['links-demais@texto'])
  })
  it('link http, com rastreador, IP ou encurtador bloqueia', () => {
    expect(codigos(achados('recado', { texto: 'http://exemplo.com' }))).toEqual(['link-esquema@texto'])
    expect(codigos(achados('recado', { texto: 'https://exemplo.com/?utm_source=x' }))).toEqual(['link-rastreador@texto'])
    expect(codigos(achados('recado', { texto: 'https://127.0.0.1/x' }))).toEqual(['link-host@texto'])
    expect(codigos(achados('recado', { texto: 'https://bit.ly/x' }))).toEqual(['link-host@texto'])
  })
  it('menções: 5 pessoas cabem, 6 não; é por campo e conta pessoas distintas', () => {
    expect(achados('recado', { texto: '@aaa @bbb @ccc @ddd @eee' })).toEqual([])
    expect(achados('recado', { texto: '@aaa @bbb @ccc @ddd @eee @fff' })).toEqual([{ codigo: 'mencoes-demais', gravidade: 'bloqueia', campo: 'texto', quantidade: 1 }])
    expect(achados('recado', { texto: '@aaa @aaa @aaa @aaa @aaa @aaa @aaa' })).toEqual([])
  })
  it('hashtags: 5 cabem, 6 não; uma de mais de 24 caracteres é erro', () => {
    expect(achados('topico', { texto: '#aa #bb #cc #dd #ee' })).toEqual([])
    expect(achados('topico', { texto: '#aa #bb #cc #dd #ee #ff' })).toEqual([{ codigo: 'hashtags-demais', gravidade: 'bloqueia', campo: 'texto', quantidade: 1 }])
    expect(codigos(achados('topico', { texto: `#${'a'.repeat(25)}` }))).toEqual(['tag-longa@texto'])
    expect(achados('topico', { texto: `#${'a'.repeat(24)}` })).toEqual([])
  })
  it('as opções da enquete passam pelo mesmo filtro de dado pessoal', () => {
    expect(codigos(achados('topico', { enquete: ['ana@exemplo.com', 'não'] }))).toContain('email@enquete')
  })
})

describe('saída da rede: o que vai, exatamente', () => {
  it('lista os campos na ordem do esquema, já limpos, e marca o que é referência fixa', () => {
    const s = saidaDaRedeSocial(rasc('recado', { texto: '  Oi,​ Pipa!  ' }))
    expect(s.campos).toEqual([{ campo: 'alvo', valor: U, fixo: true }, { campo: 'texto', valor: 'Oi, Pipa!', fixo: false }])
    expect(s.meta).toEqual(['rover', 'hora'])
    expect(s.naoVai).toEqual(['nome', 'email', 'conversas', 'arquivos', 'memoria', 'computador', 'motivo'])
  })
  it('campo opcional vazio não aparece; obrigatório vazio aparece vazio', () => {
    const s = saidaDaRedeSocial(rasc('comunidade-criar', { descricao: '', regras: '', categorias: [] }))
    expect(s.campos.map((c) => c.campo)).toEqual(['nome', 'tema', 'acesso'])
    const topico = saidaDaRedeSocial(rasc('topico', { categoria: null, tags: [], enquete: [] }))
    expect(topico.campos.map((c) => c.campo)).toEqual(['comunidade', 'titulo', 'texto', 'enqueteDias'])
    expect(saidaDaRedeSocial(rasc('recado', { texto: '' })).campos.at(-1)).toEqual({ campo: 'texto', valor: '', fixo: false })
  })
  it('tags saem em minúsculas e listas saem sem item vazio', () => {
    const s = saidaDaRedeSocial(rasc('entrega', { tags: [' Backup ', 'fotos'] }))
    expect(s.campos.find((c) => c.campo === 'tags')!.valor).toEqual(['backup', 'fotos'])
    const c = saidaDaRedeSocial(rasc('comunidade-criar', { categorias: ['  Dúvidas ', '', 'Dicas'] }))
    expect(c.campos.find((x) => x.campo === 'categorias')!.valor).toEqual(['Dúvidas', 'Dicas'])
  })
  it('os efeitos públicos: quem será notificado, em que tags entra, que links aparecem', () => {
    const s = saidaDaRedeSocial(rasc('topico', { titulo: 'Oi @max', texto: 'Veja https://exemplo.com/a e #Fio com @nina', enquete: ['quero @zeca', 'não'] }))
    expect(s.efeitos.mencoes.sort()).toEqual(['max', 'nina', 'zeca'])
    expect(s.efeitos.tags).toEqual(['fio'])
    expect(s.efeitos.links).toEqual(['https://exemplo.com/a'])
  })
  it('limparCampo: referência e escolha só perdem espaço; null e undefined viram null', () => {
    const ref = ESQUEMA_SOCIAL.recado[0]
    expect(limparCampo(ref, ` ${U} `)).toBe(U)
    expect(limparCampo(ref, undefined)).toBeNull()
    expect(limparCampo(ref, null)).toBeNull()
  })
})

describe('aprovar, editar, recusar e selar', () => {
  it('aprova a versão que a pessoa viu e devolve o objeto com selo válido', () => {
    const r = aprovarSocial(rasc('recado', { texto: '  Oi​!  ' }), 1, AGORA)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.objeto.tipo).toBe('recado')
    expect(r.objeto.autor).toBe(rover.uid)
    expect(r.objeto.campos).toEqual({ alvo: U, texto: 'Oi!' })
    expect(r.objeto.aprovacao).toMatchObject({ origem: 'rascunho', rascunhoId: 'rsc_s1', versao: 1, em: AGORA.toISOString() })
    expect(verificarSeloSocial(r.objeto)).toBe(true)
    expect(r.rascunho).toMatchObject({ estado: 'aprovado', decididoEm: AGORA.toISOString() })
  })
  it('recusa aprovar uma versão que a pessoa não viu (a edição derruba a aprovação em andamento)', () => {
    const r = rasc('recado')
    expect(aprovarSocial(r, 2, AGORA)).toEqual({ ok: false, motivo: 'versao-antiga', achados: [] })
    expect(aprovarSocial(r, 0, AGORA)).toEqual({ ok: false, motivo: 'versao-antiga', achados: [] })
    const editado = editarSocial(r, { texto: 'Mudei.' })
    expect(editado.versao).toBe(2)
    expect(aprovarSocial(editado, 1, AGORA).ok).toBe(false)
    expect(aprovarSocial(editado, 2, AGORA).ok).toBe(true)
  })
  it('só aprova o que está pendente', () => {
    for (const estado of ['aprovado', 'recusado'] as const) expect(aprovarSocial(rasc('recado', {}, { estado }), 1, AGORA)).toEqual({ ok: false, motivo: 'estado', achados: [] })
  })
  it('não aprova com achado que bloqueia, e devolve os achados', () => {
    const r = aprovarSocial(rasc('recado', { texto: 'ana@exemplo.com' }), 1, AGORA)
    expect(r).toMatchObject({ ok: false, motivo: 'bloqueado' })
    if (!r.ok) expect(r.achados[0].codigo).toBe('email')
    for (const tipo of TIPOS_SOCIAIS) {
      const sem = aprovarSocial(rasc(tipo, { [ESQUEMA_SOCIAL[tipo].find((c) => c.obrigatorio)!.nome]: null }), 1, AGORA)
      expect(sem, tipo).toMatchObject({ ok: false, motivo: 'bloqueado' })
    }
  })
  it('aviso (invisível comum) não impede aprovar', () => {
    expect(aprovarSocial(rasc('recado', { texto: 'oi​mundo' }), 1, AGORA).ok).toBe(true)
  })
  it('todo tipo válido é aprovável', () => {
    for (const tipo of TIPOS_SOCIAIS) expect(aprovarSocial(rasc(tipo), 1, AGORA).ok, tipo).toBe(true)
  })
  it('o selo amarra o conteúdo: mexer no texto, no autor, no tipo, na versão ou no rascunho o invalida', () => {
    const r = aprovarSocial(rasc('recado'), 1, AGORA)
    if (!r.ok) throw new Error('esperava aprovado')
    const o = r.objeto
    expect(verificarSeloSocial({ ...o, campos: { ...o.campos, texto: 'outra coisa' } })).toBe(false)
    expect(verificarSeloSocial({ ...o, campos: { ...o.campos, alvo: idDeDemonstracao('rvr', 'max') } })).toBe(false)
    expect(verificarSeloSocial({ ...o, autor: idDeDemonstracao('rvr', 'max') })).toBe(false)
    expect(verificarSeloSocial({ ...o, tipo: 'depoimento' })).toBe(false)
    expect(verificarSeloSocial({ ...o, aprovacao: { ...o.aprovacao, versao: 2 } })).toBe(false)
    expect(verificarSeloSocial({ ...o, aprovacao: { ...o.aprovacao, rascunhoId: 'rsc_outro' } })).toBe(false)
    expect(verificarSeloSocial({ ...o, aprovacao: { ...o.aprovacao, selo: '00000000' } })).toBe(false)
    expect(verificarSeloSocial({ ...o, aprovacao: undefined as never })).toBe(false)
    expect(verificarSeloSocial({ ...o, aprovacao: { ...o.aprovacao, origem: 'toque' as never } })).toBe(false)
    expect(verificarSeloSocial(o)).toBe(true)
  })
  it('o selo de um tipo não vale para outro mesmo com os mesmos campos (recado x depoimento)', () => {
    const a = aprovarSocial(rasc('recado', { texto: 'Igual.' }), 1, AGORA)
    const b = aprovarSocial(rasc('depoimento', { texto: 'Igual.' }), 1, AGORA)
    if (!a.ok || !b.ok) throw new Error('esperava aprovados')
    expect(a.objeto.aprovacao.selo).not.toBe(b.objeto.aprovacao.selo)
  })
  it('recusar: só um pendente muda; os outros voltam iguais', () => {
    expect(recusarSocial(rasc('recado'), AGORA)).toMatchObject({ estado: 'recusado', decididoEm: AGORA.toISOString() })
    for (const estado of ['aprovado', 'recusado'] as const) {
      const r = rasc('recado', {}, { estado })
      expect(recusarSocial(r, AGORA)).toBe(r)
    }
  })
  it('editar: só mexe em campo editável, limpa o texto, sobe a versão, e não toca no que não está pendente', () => {
    const r = rasc('recado')
    const e = editarSocial(r, { texto: '  Novo​ texto  ', alvo: idDeDemonstracao('rvr', 'max') })
    expect(e.campos.alvo).toBe(U)
    expect(e.campos.texto).toBe('Novo texto')
    expect(e.versao).toBe(2)
    expect(r.versao).toBe(1)
    expect(r.campos.texto).toBe(VALIDOS.recado.texto)
    for (const estado of ['aprovado', 'recusado'] as const) {
      const x = rasc('recado', {}, { estado })
      expect(editarSocial(x, { texto: 'mudou' })).toBe(x)
    }
    // campo que não veio em `novos` fica como estava
    expect(editarSocial(rasc('entrega'), { titulo: 'Outro título' }).campos.descricao).toBe(VALIDOS.entrega.descricao)
    // a posse não tem campo editável: nada muda além da versão
    const posse = editarSocial(rasc('comunidade-posse'), { acao: 'encerrar', novoDono: null })
    expect(posse.campos).toEqual(VALIDOS['comunidade-posse'])
  })
  it('a apelação não deixa mudar o tipo nem o alvo', () => {
    const e = editarSocial(rasc('apelacao'), { tipo: 'banimento', alvo: O('outro'), texto: 'Novo texto.' })
    expect(e.campos.tipo).toBe('remocao')
    expect(e.campos.alvo).toBe(O('fparamoderar'))
    expect(e.campos.texto).toBe('Novo texto.')
  })
})

describe('rigor: gravidade, quantidade e valores malformados', () => {
  it('todo achado, menos o invisível comum, bloqueia', () => {
    const a = [
      ...achados('recado', { texto: 'ana@exemplo.com https://a.com https://b.com http://c.com 12345-678 -23.5505, -46.6333 <b>x</b> javascript:x @a1a @b2b @c3c @d4d @e5e @f6f #aa #bb #cc #dd #ee #ff' }),
      ...achados('topico', { texto: `#${'a'.repeat(25)}`, tags: ['A'], enquete: ['x'], enqueteDias: '9' }),
      ...achados('comunidade-criar', { nome: 'a', acesso: 'x', tema: 'X', categorias: ['a', 'a', 'a\nb'] }),
      ...achados('comunidade-posse', { novoDono: null }),
      ...achados('recado', { alvo: null, texto: '' }),
    ]
    expect(a.length).toBeGreaterThan(15)
    for (const x of a) expect(x.gravidade, x.codigo).toBe('bloqueia')
    for (const c of ['links-demais', 'tag-longa', 'cep', 'coordenadas', 'html', 'esquema-perigoso', 'email', 'link-esquema', 'mencoes-demais', 'hashtags-demais', 'opcao-invalida', 'tag-invalida', 'itens-poucos', 'item-curto', 'varias-linhas', 'repetido', 'sem-destino', 'vazio', 'curto']) {
      expect(a.some((x) => x.codigo === c), c).toBe(true)
    }
  })
  it('a quantidade diz quanto passou, em itens e em caracteres de item', () => {
    expect(achados('entrega', { tags: ['aa', 'bb', 'cc', 'dd', 'ee'] })).toEqual([{ codigo: 'itens-demais', gravidade: 'bloqueia', campo: 'tags', quantidade: 2 }])
    expect(achados('comunidade-criar', { categorias: [t(35)] })).toEqual([{ codigo: 'item-longo', gravidade: 'bloqueia', campo: 'categorias', quantidade: 5 }])
    expect(achados('topico', { enquete: ['só uma'] })).toEqual([{ codigo: 'itens-poucos', gravidade: 'bloqueia', campo: 'enquete', quantidade: 2 }])
    expect(achados('comunidade-criar', { nome: 'ab' })).toEqual([{ codigo: 'curto', gravidade: 'bloqueia', campo: 'nome', quantidade: 1 }])
  })
  it('o trecho de uma tag inválida é encurtado a 28 caracteres', () => {
    const a = achados('entrega', { tags: ['A'.repeat(40)] })
    expect(a).toEqual([{ codigo: 'tag-invalida', gravidade: 'bloqueia', campo: 'tags', trecho: 'A'.repeat(28) }])
  })
  it('campo que falta (undefined) é como campo vazio', () => {
    const { texto: _texto, ...sem } = VALIDOS.recado
    void _texto
    expect(codigos(analisarSocial({ tipo: 'recado', campos: sem, destino: null }))).toEqual(['vazio@texto'])
    const { alvo: _alvo, ...semAlvo } = VALIDOS.recado
    void _alvo
    expect(codigos(analisarSocial({ tipo: 'recado', campos: semAlvo, destino: null }))).toEqual(['sem-destino@alvo'])
  })
  it('valor do tipo errado (o navegador mente) nunca passa: número, lista no lugar de texto, texto no lugar de lista', () => {
    const mal = (campos: Record<string, unknown>) => analisarSocial({ tipo: 'comunidade-criar', campos: { ...VALIDOS['comunidade-criar'], ...campos } as Campos, destino: null })
    expect(codigos(mal({ acesso: ['aberta'] }))).toEqual(['opcao-invalida@acesso'])
    expect(codigos(mal({ acesso: 5 }))).toEqual(['opcao-invalida@acesso'])
    expect(codigos(mal({ tema: ['arquivos'] }))).toEqual(['tag-invalida@tema'])
    expect(codigos(mal({ tema: 7 }))).toEqual(['tag-invalida@tema'])
    expect(codigos(mal({ nome: 123456 }))).toEqual(['curto@nome'])
    expect(codigos(mal({ nome: ['Cinema de Sofá'] }))).toEqual(['curto@nome'])
    expect(codigos(analisarSocial({ tipo: 'recado', campos: { alvo: ['x'] as never, texto: 'oi' }, destino: null }))).toEqual(['sem-destino@alvo'])
    expect(codigos(analisarSocial({ tipo: 'recado', campos: { alvo: 123 as never, texto: 'oi' }, destino: null }))).toEqual(['sem-destino@alvo'])
    expect(codigos(mal({ categorias: 'Dúvidas' }))).toEqual(['opcao-invalida@categorias'])
    expect(codigos(analisarSocial({ tipo: 'entrega', campos: { ...VALIDOS.entrega, tags: 'arquivos' } as Campos, destino: null }))).toEqual(['opcao-invalida@tags'])
  })
  it('um campo que não é da posse não é tratado como da posse', () => {
    expect(achados('recado', { novoDono: U, acao: 'encerrar' })).toEqual([])
  })
  it('a posse sem novo dono avisa o campo certo', () => {
    expect(achados('comunidade-posse', { novoDono: null })).toEqual([{ codigo: 'sem-destino', gravidade: 'bloqueia', campo: 'novoDono' }])
    expect(achados('comunidade-posse', { acao: 'encerrar', novoDono: U })).toEqual([{ codigo: 'opcao-invalida', gravidade: 'bloqueia', campo: 'novoDono' }])
  })
  it('limparCampo não mexe em referência, escolha e tag além de aparar o espaço (um id alterado em silêncio seria outro id)', () => {
    const ref = ESQUEMA_SOCIAL.recado[0]
    const escolha = ESQUEMA_SOCIAL['comunidade-criar'].find((c) => c.nome === 'acesso')!
    const tag = ESQUEMA_SOCIAL['comunidade-criar'].find((c) => c.nome === 'tema')!
    for (const c of [ref, escolha, tag]) {
      expect(limparCampo(c, '  a\u200bb  ')).toBe('a\u200bb')
      expect(limparCampo(c, 'a\n\n\n\nb')).toBe('a\n\n\n\nb')
    }
  })
  it('o selo não confunde fronteira entre o id do rascunho e a versão', () => {
    const a = aprovarSocial(rasc('recado', {}, { id: 'rsc_1', versao: 12 }), 12, AGORA)
    const b = aprovarSocial(rasc('recado', {}, { id: 'rsc_11', versao: 2 }), 2, AGORA)
    if (!a.ok || !b.ok) throw new Error('esperava aprovados')
    expect(a.objeto.aprovacao.selo).not.toBe(b.objeto.aprovacao.selo)
  })
  it('a saída reúne menção e tag de campos de linha, de multilinha e de lista (e só deles)', () => {
    const s = saidaDaRedeSocial(rasc('topico', { titulo: 'Titulo @max #umatag', texto: 'corpo', enquete: ['opção @zeca', 'outra #outra'], tags: ['fio'] }))
    expect(s.efeitos.mencoes.sort()).toEqual(['max', 'zeca'])
    expect(s.efeitos.tags.sort()).toEqual(['outra', 'umatag'])
    // referência e escolha não entram na conta, mesmo parecendo menção
    const x = saidaDaRedeSocial({ tipo: 'comunidade-criar', campos: { ...VALIDOS['comunidade-criar'], tema: 'x', acesso: '@abc' } })
    expect(x.efeitos.mencoes).toEqual([])
  })
})
