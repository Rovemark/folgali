// Human approval of the social part: the schema of each of the 13 types, the limits at the edges, the analysis,
// "what goes out", and the approve / edit / refuse / seal cycle. The limits come from the specification, written here by hand
// (not derived from the code): if someone changes a number, the test flags it.
import { describe, expect, it } from 'vitest'
import {
  SOCIAL_SCHEMA, SOCIAL_TYPES, parseSocial, approveSocial, blocksSocial, editSocial, isSocialType, cleanField, refuseSocial, socialNetworkOutput, verifySocialBadge,
  type SocialFinding, type Fields, type SocialDraft, type SocialType,
} from '@/lib/domain/social-approval'
import { demoId } from '@/lib/domain/ids'

const NOW = new Date('2026-11-05T12:00:00.000Z')
const rover = { uid: demoId('rvr', 'lumi'), handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'sino', cor: '#b49cff' } }
const U = demoId('rvr', 'pipa')
const O = (r: string) => demoId('ob', r)

/** Text of exactly `n` characters that lights no filter (short words separated by spaces). */
const t = (n: number): string => {
  let s = ''
  while (s.length < n) s += 'ab '
  s = s.slice(0, n)
  return s.endsWith(' ') ? s.slice(0, -1) + 'x' : s
}

const VALID: Record<SocialType, Fields> = {
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

const draft = (type: SocialType, fields: Fields = {}, extra: Partial<SocialDraft> = {}): SocialDraft => ({
  id: 'rsc_s1', tipo: type, rover, campos: { ...VALID[type], ...fields }, destino: { rotulo: 'algum lugar' }, criadoEm: NOW.toISOString(), versao: 1, estado: 'pendente', ...extra,
})
const findings = (type: SocialType, fields: Fields = {}) => parseSocial(draft(type, fields))
// includes the severity when it is NOT the one that blocks: a finding that should block and only warns comes out with the suffix and the test flags it
const codes = (a: SocialFinding[]) => a.map((x) => `${x.codigo}@${x.campo ?? ''}${x.severity === 'bloqueia' ? '' : `(${x.severity})`}`)

describe('the schema of the 15 types', () => {
  it('they are exactly the 15 types with approval on each use that carry text, control or publish something (13 from 0.3 and the 2 text ones from 0.4.0)', () => {
    expect([...SOCIAL_TYPES].sort()).toEqual(['apelacao', 'comunidade-atualizar', 'comunidade-criar', 'comunidade-posse', 'conversa-pedir', 'depoimento', 'entrega', 'mensagem', 'pagina-atualizar', 'pagina-criar', 'pagina-publicar', 'recado', 'resposta-forum', 'topico', 'topico-editar'])
    expect(isSocialType('recado')).toBe(true)
    expect(isSocialType('postagem')).toBe(false)
    expect(isSocialType(undefined)).toBe(false)
  })
  it('every valid example passes clean, with no finding', () => {
    for (const type of SOCIAL_TYPES) expect(findings(type), type).toEqual([])
  })
  // [type, field, min, max, links]: the limits from section 4 of the specification
  const LIMITS: [SocialType, string, number, number, number][] = [
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
  it('the schema declares the specification\'s limits', () => {
    for (const [type, field, min, max, links] of LIMITS) {
      const c = SOCIAL_SCHEMA[type].find((x) => x.nome === field)!
      expect([c.min, c.max, c.links ?? 0], `${type}.${field}`).toEqual([min, max, links])
    }
  })
  for (const [type, field, min, max] of LIMITS) {
    it(`${type}.${field}: ${max} fits, ${max + 1} exceeds by 1`, () => {
      expect(findings(type, { [field]: t(max) }), 'at the limit').toEqual([])
      expect(codes(findings(type, { [field]: t(max + 1) })), 'acima').toEqual([`longo@${field}`])
      expect(findings(type, { [field]: t(max + 1) })[0].quantity).toBe(1)
    })
    if (min >= 2) {
      it(`${type}.${field}: ${min} cabe, ${min - 1} falta 1`, () => {
        expect(findings(type, { [field]: t(min) }), 'at the minimum').toEqual([])
        const a = findings(type, { [field]: t(min - 1) })
        expect(codes(a)).toEqual([`curto@${field}`])
        expect(a[0].quantity).toBe(1)
      })
    }
    if (min === 1 && SOCIAL_SCHEMA[type].find((x) => x.nome === field)!.mandatory) {
      it(`${type}.${field}: empty blocks (required field)`, () => {
        expect(codes(findings(type, { [field]: '   ' }))).toEqual([`vazio@${field}`])
        expect(codes(findings(type, { [field]: null }))).toEqual([`vazio@${field}`])
      })
    }
    if (min === 0) {
      it(`${type}.${field}: may stay empty`, () => {
        expect(findings(type, { [field]: '' })).toEqual([])
        expect(findings(type, { [field]: null })).toEqual([])
      })
    }
  }
  it('the page update title is optional', () => {
    expect(findings('pagina-publicar', { titulo: null })).toEqual([])
    expect(findings('pagina-publicar', { titulo: '' })).toEqual([])
  })
  it('counts code points, not units: 80 emoji fit in a title of 80', () => {
    expect(findings('entrega', { titulo: '🧶'.repeat(80) })).toEqual([])
    expect(codes(findings('entrega', { titulo: '🧶'.repeat(81) }))).toEqual(['longo@titulo'])
  })
  it('single line: a line break in the title blocks; multiline accepts it', () => {
    expect(codes(findings('entrega', { titulo: 'Mapa\nde fotos' }))).toEqual(['varias-linhas@titulo'])
    expect(findings('entrega', { descricao: 'Primeira linha.\nSegunda linha.' })).toEqual([])
  })

  describe('listas e escolhas', () => {
    it('tags: up to 3 on the delivery, 5 on the topic, 3 on the update; each 2 to 24, without repeating', () => {
      expect(findings('entrega', { tags: ['aa', 'bb', 'cc'] })).toEqual([])
      expect(codes(findings('entrega', { tags: ['aa', 'bb', 'cc', 'dd'] }))).toEqual(['itens-demais@tags'])
      expect(findings('topico', { tags: ['aa', 'bb', 'cc', 'dd', 'ee'] })).toEqual([])
      expect(codes(findings('topico', { tags: ['aa', 'bb', 'cc', 'dd', 'ee', 'ff'] }))).toEqual(['itens-demais@tags'])
      expect(findings('pagina-publicar', { tags: ['aa', 'bb', 'cc'] })).toEqual([])
      expect(codes(findings('pagina-publicar', { tags: ['aa', 'bb', 'cc', 'dd'] }))).toEqual(['itens-demais@tags'])
      expect(codes(findings('entrega', { tags: ['aa', 'aa'] }))).toEqual(['repetido@tags'])
      for (const bad of ['a', 'Ab', '-ab', 'a b', 'ação', 'a'.repeat(25)]) expect(codes(findings('entrega', { tags: [bad] })), bad).toEqual(['tag-invalida@tags'])
      expect(findings('entrega', { tags: ['a'.repeat(24)] })).toEqual([])
    })
    it('categories: up to 8, each 2 to 30 on one line, without repeating ignoring case and accent', () => {
      const eight = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']
      expect(findings('comunidade-criar', { categorias: eight })).toEqual([])
      expect(codes(findings('comunidade-criar', { categorias: [...eight, 'c9'] }))).toEqual(['itens-demais@categorias'])
      expect(findings('comunidade-criar', { categorias: [t(30)] })).toEqual([])
      expect(codes(findings('comunidade-criar', { categorias: [t(31)] }))).toEqual(['item-longo@categorias'])
      expect(codes(findings('comunidade-criar', { categorias: ['a'] }))).toEqual(['item-curto@categorias'])
      expect(findings('comunidade-criar', { categorias: ['ab'] })).toEqual([])
      expect(codes(findings('comunidade-criar', { categorias: ['Dúvidas', 'duvidas'] }))).toEqual(['repetido@categorias'])
      expect(codes(findings('comunidade-criar', { categorias: ['a\nb'] }))).toEqual(['varias-linhas@categorias'])
    })
    it('poll: no option, or 2 to 6 of up to 60; just one is not a poll', () => {
      expect(findings('topico', { enquete: [] })).toEqual([])
      expect(findings('topico', { enquete: null })).toEqual([])
      expect(codes(findings('topico', { enquete: ['só uma'] }))).toEqual(['itens-poucos@enquete'])
      expect(findings('topico', { enquete: ['sim', 'não'] })).toEqual([])
      expect(findings('topico', { enquete: ['a', 'b', 'c', 'd', 'e', 'f'] })).toEqual([])
      expect(codes(findings('topico', { enquete: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }))).toEqual(['itens-demais@enquete'])
      expect(findings('topico', { enquete: [t(60), 'b'] })).toEqual([])
      expect(codes(findings('topico', { enquete: [t(61), 'b'] }))).toEqual(['item-longo@enquete'])
      expect(codes(findings('topico', { enquete: ['igual', 'Igual'] }))).toEqual(['repetido@enquete'])
    })
    it('the poll duration is one of the options from 1 to 30 days', () => {
      for (const d of ['1', '3', '7', '14', '30']) expect(findings('topico', { enqueteDias: d })).toEqual([])
      for (const d of ['0', '2', '31', '', 'sete']) expect(codes(findings('topico', { enqueteDias: d })).length, d).toBe(1)
    })
    it('acesso e escolhas fechadas', () => {
      for (const a of ['aberta', 'moderada', 'fechada']) expect(findings('comunidade-criar', { acesso: a })).toEqual([])
      expect(codes(findings('comunidade-criar', { acesso: 'publica' }))).toEqual(['opcao-invalida@acesso'])
      expect(codes(findings('apelacao', { tipo: 'outra' }))).toEqual(['opcao-invalida@tipo'])
      expect(findings('apelacao', { tipo: 'banimento' })).toEqual([])
      expect(codes(findings('comunidade-posse', { acao: 'vender' }))).toContain('opcao-invalida@acao')
    })
    it('the theme is a tag of 2 to 24', () => {
      expect(findings('comunidade-criar', { tema: 'ab' })).toEqual([])
      expect(codes(findings('comunidade-criar', { tema: 'a' }))).toEqual(['tag-invalida@tema'])
      expect(codes(findings('comunidade-criar', { tema: 'Arquivos' }))).toEqual(['tag-invalida@tema'])
      expect(codes(findings('comunidade-criar', { tema: '' }))).toEqual(['vazio@tema'])
    })
    it('references: without a destination (empty, or neither a uid nor an id) blocks; the optional ones may be missing', () => {
      expect(codes(findings('recado', { alvo: null }))).toEqual(['sem-destino@alvo'])
      expect(codes(findings('recado', { alvo: 'pipa' }))).toEqual(['sem-destino@alvo'])
      expect(codes(findings('resposta-forum', { topico: '' }))).toEqual(['sem-destino@topico'])
      expect(findings('resposta-forum', { em: O('f1'), cita: O('f2') })).toEqual([])
      expect(codes(findings('resposta-forum', { em: 'xx' }))).toEqual(['sem-destino@em'])
    })
    it('ownership: transfer asks for a new owner; closing cannot have one', () => {
      expect(codes(findings('comunidade-posse', { novoDono: null }))).toEqual(['sem-destino@novoDono'])
      expect(findings('comunidade-posse', { acao: 'encerrar', novoDono: null })).toEqual([])
      expect(codes(findings('comunidade-posse', { acao: 'encerrar', novoDono: U }))).toEqual(['opcao-invalida@novoDono'])
    })
  })
})

describe('text: invisible, personal data, links and marks, field by field', () => {
  it('an ordinary invisible only warns; a dangerous one blocks', () => {
    const a = findings('recado', { texto: 'oi​mundo' })
    expect(a).toEqual([{ codigo: 'invisivel', severity: 'avisa', campo: 'texto', quantity: 1 }])
    expect(blocksSocial(a)).toBe(false)
    const p = findings('recado', { texto: 'oi‮mundo' })
    expect(p).toEqual([{ codigo: 'invisivel-perigoso', severity: 'bloqueia', campo: 'texto', quantity: 1 }])
    expect(blocksSocial(p)).toBe(true)
  })
  it('e-mail, long number, path, postal code and coordinates block and name the field', () => {
    expect(findings('recado', { texto: 'ana@exemplo.com' })[0]).toMatchObject({ codigo: 'email', campo: 'texto', severity: 'bloqueia', trecho: 'ana@exemplo.com' })
    expect(codes(findings('recado', { texto: 'ligue 11 98765 4321' }))).toContain('numero-longo@texto')
    expect(codes(findings('recado', { texto: 'veja /Users/ana/fotos' }))).toContain('caminho@texto')
    expect(codes(findings('recado', { texto: 'moro no 12345-678' }))).toEqual(['cep@texto'])
    expect(codes(findings('recado', { texto: 'estou em -23.5505, -46.6333' }))).toEqual(['coordenadas@texto'])
  })
  it('html e esquema perigoso bloqueiam', () => {
    expect(codes(findings('recado', { texto: 'oi <b>você</b>' }))).toContain('html@texto')
    expect(codes(findings('recado', { texto: 'veja javascript:alert(1)' }))).toContain('esquema-perigoso@texto')
  })
  it('links: the note accepts 1; the testimonial, none; the topic, 2', () => {
    expect(findings('recado', { texto: 'veja https://exemplo.com/a' })).toEqual([])
    expect(codes(findings('recado', { texto: 'https://a.com e https://b.com' }))).toEqual(['links-demais@texto'])
    expect(findings('recado', { texto: 'https://a.com e https://b.com' })[0].quantity).toBe(1)
    expect(codes(findings('depoimento', { texto: 'veja https://exemplo.com' }))).toEqual(['links-demais@texto'])
    expect(findings('topico', { texto: 'https://a.com e https://b.com' })).toEqual([])
    expect(codes(findings('topico', { texto: 'https://a.com https://b.com https://c.com' }))).toEqual(['links-demais@texto'])
  })
  it('an http link, with a tracker, IP or shortener blocks', () => {
    expect(codes(findings('recado', { texto: 'http://exemplo.com' }))).toEqual(['link-esquema@texto'])
    expect(codes(findings('recado', { texto: 'https://exemplo.com/?utm_source=x' }))).toEqual(['link-rastreador@texto'])
    expect(codes(findings('recado', { texto: 'https://127.0.0.1/x' }))).toEqual(['link-host@texto'])
    expect(codes(findings('recado', { texto: 'https://bit.ly/x' }))).toEqual(['link-host@texto'])
  })
  it('mentions: 5 people fit, 6 do not; it is per field and counts distinct people', () => {
    expect(findings('recado', { texto: '@aaa @bbb @ccc @ddd @eee' })).toEqual([])
    expect(findings('recado', { texto: '@aaa @bbb @ccc @ddd @eee @fff' })).toEqual([{ codigo: 'mencoes-demais', severity: 'bloqueia', campo: 'texto', quantity: 1 }])
    expect(findings('recado', { texto: '@aaa @aaa @aaa @aaa @aaa @aaa @aaa' })).toEqual([])
  })
  it('hashtags: 5 fit, 6 do not; one of more than 24 characters is an error', () => {
    expect(findings('topico', { texto: '#aa #bb #cc #dd #ee' })).toEqual([])
    expect(findings('topico', { texto: '#aa #bb #cc #dd #ee #ff' })).toEqual([{ codigo: 'hashtags-demais', severity: 'bloqueia', campo: 'texto', quantity: 1 }])
    expect(codes(findings('topico', { texto: `#${'a'.repeat(25)}` }))).toEqual(['tag-longa@texto'])
    expect(findings('topico', { texto: `#${'a'.repeat(24)}` })).toEqual([])
  })
  it('the poll options go through the same personal-data filter', () => {
    expect(codes(findings('topico', { enquete: ['ana@exemplo.com', 'não'] }))).toContain('email@enquete')
  })
})

describe('output to the network: what goes, exactly', () => {
  it('lists the fields in schema order, already clean, and marks what is a fixed reference', () => {
    const s = socialNetworkOutput(draft('recado', { texto: '  Oi,​ Pipa!  ' }))
    expect(s.campos).toEqual([{ campo: 'alvo', valor: U, fixed: true }, { campo: 'texto', valor: 'Oi, Pipa!', fixed: false }])
    expect(s.meta).toEqual(['rover', 'hora'])
    expect(s.naoVai).toEqual(['nome', 'email', 'conversas', 'arquivos', 'memoria', 'computador', 'motivo'])
  })
  it('an optional empty field does not appear; a required empty one appears empty', () => {
    const s = socialNetworkOutput(draft('comunidade-criar', { descricao: '', regras: '', categorias: [] }))
    expect(s.campos.map((c) => c.campo)).toEqual(['nome', 'tema', 'acesso'])
    const topic = socialNetworkOutput(draft('topico', { categoria: null, tags: [], enquete: [] }))
    expect(topic.campos.map((c) => c.campo)).toEqual(['comunidade', 'titulo', 'texto', 'enqueteDias'])
    expect(socialNetworkOutput(draft('recado', { texto: '' })).campos.at(-1)).toEqual({ campo: 'texto', valor: '', fixed: false })
  })
  it('tags come out in lowercase and lists come out without an empty item', () => {
    const s = socialNetworkOutput(draft('entrega', { tags: [' Backup ', 'fotos'] }))
    expect(s.campos.find((c) => c.campo === 'tags')!.valor).toEqual(['backup', 'fotos'])
    const c = socialNetworkOutput(draft('comunidade-criar', { categorias: ['  Dúvidas ', '', 'Dicas'] }))
    expect(c.campos.find((x) => x.campo === 'categorias')!.valor).toEqual(['Dúvidas', 'Dicas'])
  })
  it('the public effects: who will be notified, which tags it enters, which links appear', () => {
    const s = socialNetworkOutput(draft('topico', { titulo: 'Oi @max', texto: 'Veja https://exemplo.com/a e #Fio com @nina', enquete: ['quero @zeca', 'não'] }))
    expect(s.efeitos.mencoes.sort()).toEqual(['max', 'nina', 'zeca'])
    expect(s.efeitos.tags).toEqual(['fio'])
    expect(s.efeitos.links).toEqual(['https://exemplo.com/a'])
  })
  it('cleanField: reference and choice only lose whitespace; null and undefined become null', () => {
    const ref = SOCIAL_SCHEMA.recado[0]
    expect(cleanField(ref, ` ${U} `)).toBe(U)
    expect(cleanField(ref, undefined)).toBeNull()
    expect(cleanField(ref, null)).toBeNull()
  })
})

describe('aprovar, editar, recusar e selar', () => {
  it('approves the version the person saw and returns the object with a valid badge', () => {
    const r = approveSocial(draft('recado', { texto: '  Oi​!  ' }), 1, NOW)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.objeto.tipo).toBe('recado')
    expect(r.objeto.autor).toBe(rover.uid)
    expect(r.objeto.campos).toEqual({ alvo: U, texto: 'Oi!' })
    expect(r.objeto.aprovacao).toMatchObject({ origem: 'rascunho', rascunhoId: 'rsc_s1', versao: 1, em: NOW.toISOString() })
    expect(verifySocialBadge(r.objeto)).toBe(true)
    expect(r.rascunho).toMatchObject({ estado: 'aprovado', decidedAt: NOW.toISOString() })
  })
  it('refuses to approve a version the person did not see (editing knocks down the approval in progress)', () => {
    const r = draft('recado')
    expect(approveSocial(r, 2, NOW)).toEqual({ ok: false, motivo: 'versao-antiga', achados: [] })
    expect(approveSocial(r, 0, NOW)).toEqual({ ok: false, motivo: 'versao-antiga', achados: [] })
    const edited = editSocial(r, { texto: 'Mudei.' })
    expect(edited.versao).toBe(2)
    expect(approveSocial(edited, 1, NOW).ok).toBe(false)
    expect(approveSocial(edited, 2, NOW).ok).toBe(true)
  })
  it('only approves what is pending', () => {
    for (const state of ['aprovado', 'recusado'] as const) expect(approveSocial(draft('recado', {}, { estado: state }), 1, NOW)).toEqual({ ok: false, motivo: 'estado', achados: [] })
  })
  it('does not approve with a blocking finding, and returns the findings', () => {
    const r = approveSocial(draft('recado', { texto: 'ana@exemplo.com' }), 1, NOW)
    expect(r).toMatchObject({ ok: false, motivo: 'bloqueado' })
    if (!r.ok) expect(r.achados[0].codigo).toBe('email')
    for (const type of SOCIAL_TYPES) {
      const without = approveSocial(draft(type, { [SOCIAL_SCHEMA[type].find((c) => c.mandatory)!.nome]: null }), 1, NOW)
      expect(without, type).toMatchObject({ ok: false, motivo: 'bloqueado' })
    }
  })
  it('a warning (ordinary invisible) does not prevent approval', () => {
    expect(approveSocial(draft('recado', { texto: 'oi​mundo' }), 1, NOW).ok).toBe(true)
  })
  it('every valid type is approvable', () => {
    for (const type of SOCIAL_TYPES) expect(approveSocial(draft(type), 1, NOW).ok, type).toBe(true)
  })
  it('the badge ties the content: changing the text, author, type, version or draft invalidates it', () => {
    const r = approveSocial(draft('recado'), 1, NOW)
    if (!r.ok) throw new Error('esperava aprovado')
    const o = r.objeto
    expect(verifySocialBadge({ ...o, campos: { ...o.campos, texto: 'outra coisa' } })).toBe(false)
    expect(verifySocialBadge({ ...o, campos: { ...o.campos, alvo: demoId('rvr', 'max') } })).toBe(false)
    expect(verifySocialBadge({ ...o, autor: demoId('rvr', 'max') })).toBe(false)
    expect(verifySocialBadge({ ...o, tipo: 'depoimento' })).toBe(false)
    expect(verifySocialBadge({ ...o, aprovacao: { ...o.aprovacao, versao: 2 } })).toBe(false)
    expect(verifySocialBadge({ ...o, aprovacao: { ...o.aprovacao, rascunhoId: 'rsc_outro' } })).toBe(false)
    expect(verifySocialBadge({ ...o, aprovacao: { ...o.aprovacao, selo: '00000000' } })).toBe(false)
    expect(verifySocialBadge({ ...o, aprovacao: undefined as never })).toBe(false)
    expect(verifySocialBadge({ ...o, aprovacao: { ...o.aprovacao, origem: 'toque' as never } })).toBe(false)
    expect(verifySocialBadge(o)).toBe(true)
  })
  it('one type\'s badge does not hold for another even with the same fields (note x testimonial)', () => {
    const a = approveSocial(draft('recado', { texto: 'Igual.' }), 1, NOW)
    const b = approveSocial(draft('depoimento', { texto: 'Igual.' }), 1, NOW)
    if (!a.ok || !b.ok) throw new Error('esperava aprovados')
    expect(a.objeto.aprovacao.selo).not.toBe(b.objeto.aprovacao.selo)
  })
  it('refuse: only a pending one changes; the others come back unchanged', () => {
    expect(refuseSocial(draft('recado'), NOW)).toMatchObject({ estado: 'recusado', decidedAt: NOW.toISOString() })
    for (const state of ['aprovado', 'recusado'] as const) {
      const r = draft('recado', {}, { estado: state })
      expect(refuseSocial(r, NOW)).toBe(r)
    }
  })
  it('edit: only touches an editable field, cleans the text, bumps the version, and does not touch what is not pending', () => {
    const r = draft('recado')
    const e = editSocial(r, { texto: '  Novo​ texto  ', alvo: demoId('rvr', 'max') })
    expect(e.campos.alvo).toBe(U)
    expect(e.campos.texto).toBe('Novo texto')
    expect(e.versao).toBe(2)
    expect(r.versao).toBe(1)
    expect(r.campos.texto).toBe(VALID.recado.texto)
    for (const state of ['aprovado', 'recusado'] as const) {
      const x = draft('recado', {}, { estado: state })
      expect(editSocial(x, { texto: 'mudou' })).toBe(x)
    }
    // a field that did not come in `novos` stays as it was
    expect(editSocial(draft('entrega'), { titulo: 'Outro título' }).campos.descricao).toBe(VALID.entrega.descricao)
    // ownership has no editable field: nothing changes apart from the version
    const ownership = editSocial(draft('comunidade-posse'), { acao: 'encerrar', novoDono: null })
    expect(ownership.campos).toEqual(VALID['comunidade-posse'])
  })
  it('the appeal does not let the type or the target change', () => {
    const e = editSocial(draft('apelacao'), { tipo: 'banimento', alvo: O('outro'), texto: 'Novo texto.' })
    expect(e.campos.tipo).toBe('remocao')
    expect(e.campos.alvo).toBe(O('fparamoderar'))
    expect(e.campos.texto).toBe('Novo texto.')
  })
})

describe('rigor: gravidade, quantidade e valores malformados', () => {
  it('every finding, except the ordinary invisible, blocks', () => {
    const a = [
      ...findings('recado', { texto: 'ana@exemplo.com https://a.com https://b.com http://c.com 12345-678 -23.5505, -46.6333 <b>x</b> javascript:x @a1a @b2b @c3c @d4d @e5e @f6f #aa #bb #cc #dd #ee #ff' }),
      ...findings('topico', { texto: `#${'a'.repeat(25)}`, tags: ['A'], enquete: ['x'], enqueteDias: '9' }),
      ...findings('comunidade-criar', { nome: 'a', acesso: 'x', tema: 'X', categorias: ['a', 'a', 'a\nb'] }),
      ...findings('comunidade-posse', { novoDono: null }),
      ...findings('recado', { alvo: null, texto: '' }),
    ]
    expect(a.length).toBeGreaterThan(15)
    for (const x of a) expect(x.severity, x.codigo).toBe('bloqueia')
    for (const c of ['links-demais', 'tag-longa', 'cep', 'coordenadas', 'html', 'esquema-perigoso', 'email', 'link-esquema', 'mencoes-demais', 'hashtags-demais', 'opcao-invalida', 'tag-invalida', 'itens-poucos', 'item-curto', 'varias-linhas', 'repetido', 'sem-destino', 'vazio', 'curto']) {
      expect(a.some((x) => x.codigo === c), c).toBe(true)
    }
  })
  it('the quantity says how much went over, in items and in item characters', () => {
    expect(findings('entrega', { tags: ['aa', 'bb', 'cc', 'dd', 'ee'] })).toEqual([{ codigo: 'itens-demais', severity: 'bloqueia', campo: 'tags', quantity: 2 }])
    expect(findings('comunidade-criar', { categorias: [t(35)] })).toEqual([{ codigo: 'item-longo', severity: 'bloqueia', campo: 'categorias', quantity: 5 }])
    expect(findings('topico', { enquete: ['só uma'] })).toEqual([{ codigo: 'itens-poucos', severity: 'bloqueia', campo: 'enquete', quantity: 2 }])
    expect(findings('comunidade-criar', { nome: 'ab' })).toEqual([{ codigo: 'curto', severity: 'bloqueia', campo: 'nome', quantity: 1 }])
  })
  it('the excerpt of an invalid tag is shortened to 28 characters', () => {
    const a = findings('entrega', { tags: ['A'.repeat(40)] })
    expect(a).toEqual([{ codigo: 'tag-invalida', severity: 'bloqueia', campo: 'tags', trecho: 'A'.repeat(28) }])
  })
  it('a missing field (undefined) is like an empty field', () => {
    const { texto: _text, ...without } = VALID.recado
    void _text
    expect(codes(parseSocial({ tipo: 'recado', campos: without, destino: null }))).toEqual(['vazio@texto'])
    const { alvo: _target, ...withoutTarget } = VALID.recado
    void _target
    expect(codes(parseSocial({ tipo: 'recado', campos: withoutTarget, destino: null }))).toEqual(['sem-destino@alvo'])
  })
  it('a value of the wrong type (the browser lies) never passes: a number, a list in place of text, text in place of a list', () => {
    const bad = (fields: Record<string, unknown>) => parseSocial({ tipo: 'comunidade-criar', campos: { ...VALID['comunidade-criar'], ...fields } as Fields, destino: null })
    expect(codes(bad({ acesso: ['aberta'] }))).toEqual(['opcao-invalida@acesso'])
    expect(codes(bad({ acesso: 5 }))).toEqual(['opcao-invalida@acesso'])
    expect(codes(bad({ tema: ['arquivos'] }))).toEqual(['tag-invalida@tema'])
    expect(codes(bad({ tema: 7 }))).toEqual(['tag-invalida@tema'])
    expect(codes(bad({ nome: 123456 }))).toEqual(['curto@nome'])
    expect(codes(bad({ nome: ['Cinema de Sofá'] }))).toEqual(['curto@nome'])
    expect(codes(parseSocial({ tipo: 'recado', campos: { alvo: ['x'] as never, texto: 'oi' }, destino: null }))).toEqual(['sem-destino@alvo'])
    expect(codes(parseSocial({ tipo: 'recado', campos: { alvo: 123 as never, texto: 'oi' }, destino: null }))).toEqual(['sem-destino@alvo'])
    expect(codes(bad({ categorias: 'Dúvidas' }))).toEqual(['opcao-invalida@categorias'])
    expect(codes(parseSocial({ tipo: 'entrega', campos: { ...VALID.entrega, tags: 'arquivos' } as Fields, destino: null }))).toEqual(['opcao-invalida@tags'])
  })
  it('a field that does not belong to ownership is not treated as ownership\'s', () => {
    expect(findings('recado', { novoDono: U, acao: 'encerrar' })).toEqual([])
  })
  it('ownership without a new owner flags the right field', () => {
    expect(findings('comunidade-posse', { novoDono: null })).toEqual([{ codigo: 'sem-destino', severity: 'bloqueia', campo: 'novoDono' }])
    expect(findings('comunidade-posse', { acao: 'encerrar', novoDono: U })).toEqual([{ codigo: 'opcao-invalida', severity: 'bloqueia', campo: 'novoDono' }])
  })
  it('cleanField does not touch a reference, choice or tag beyond trimming the whitespace (an id silently altered would be another id)', () => {
    const ref = SOCIAL_SCHEMA.recado[0]
    const choice = SOCIAL_SCHEMA['comunidade-criar'].find((c) => c.nome === 'acesso')!
    const tag = SOCIAL_SCHEMA['comunidade-criar'].find((c) => c.nome === 'tema')!
    for (const c of [ref, choice, tag]) {
      expect(cleanField(c, '  a\u200bb  ')).toBe('a\u200bb')
      expect(cleanField(c, 'a\n\n\n\nb')).toBe('a\n\n\n\nb')
    }
  })
  it('the badge does not confuse the boundary between the draft id and the version', () => {
    const a = approveSocial(draft('recado', {}, { id: 'rsc_1', versao: 12 }), 12, NOW)
    const b = approveSocial(draft('recado', {}, { id: 'rsc_11', versao: 2 }), 2, NOW)
    if (!a.ok || !b.ok) throw new Error('esperava aprovados')
    expect(a.objeto.aprovacao.selo).not.toBe(b.objeto.aprovacao.selo)
  })
  it('the output gathers mention and tag from line fields, multiline fields and list fields (and only those)', () => {
    const s = socialNetworkOutput(draft('topico', { titulo: 'Titulo @max #umatag', texto: 'corpo', enquete: ['opção @zeca', 'outra #outra'], tags: ['fio'] }))
    expect(s.efeitos.mencoes.sort()).toEqual(['max', 'zeca'])
    expect(s.efeitos.tags.sort()).toEqual(['outra', 'umatag'])
    // reference and choice are not counted, even if they look like a mention
    const x = socialNetworkOutput({ tipo: 'comunidade-criar', campos: { ...VALID['comunidade-criar'], tema: 'x', acesso: '@abc' } })
    expect(x.efeitos.mencoes).toEqual([])
  })
})
