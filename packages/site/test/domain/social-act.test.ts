// The browser is a stranger: nothing it sends becomes an act without going through validateAct.
import { describe, expect, it } from 'vitest'
import { validateAct } from '@/lib/domain/act'
import { demoId } from '@/lib/domain/ids'
import { ROVER_STATES, SOCIAL_REPORT_REASONS, MODERATION_REASON_LIST, BADGES } from '@/lib/social/types'

const U = demoId('rvr', 'pipa')
const O = demoId('ob', 'c1')
const O2 = demoId('ob', 'c2')

describe('validateAct: shapes that are not even an act', () => {
  it('junk, null, list, unknown or missing type', () => {
    for (const x of [null, undefined, 1, 'amizade', [], [{ tipo: 'estado' }], {}, { tipo: 'apagar-tudo' }, { tipo: 42 }, { tipo: 'seguir', alvo: U }]) expect(validateAct(x), JSON.stringify(x)).toBeNull()
  })
  it('returns only the act\'s fields: an extra browser field is discarded', () => {
    expect(validateAct({ tipo: 'amizade', alvo: U, acao: 'pedir', admin: true, uid: U })).toEqual({ tipo: 'amizade', alvo: U, acao: 'pedir' })
  })
})

describe('validateAct: each type', () => {
  it('state: the 5 states', () => {
    for (const e of ROVER_STATES) expect(validateAct({ tipo: 'estado', estado: e })).toEqual({ tipo: 'estado', estado: e })
    expect(validateAct({ tipo: 'estado', estado: 'feliz' })).toBeNull()
    expect(validateAct({ tipo: 'estado' })).toBeNull()
  })
  it('friendship: 4 actions, the target is a uid', () => {
    for (const a of ['pedir', 'aceitar', 'recusar', 'desfazer']) expect(validateAct({ tipo: 'amizade', alvo: U, acao: a })).toEqual({ tipo: 'amizade', alvo: U, acao: a })
    expect(validateAct({ tipo: 'amizade', alvo: U, acao: 'adotar' })).toBeNull()
    expect(validateAct({ tipo: 'amizade', alvo: O, acao: 'pedir' })).toBeNull()
    expect(validateAct({ tipo: 'amizade', alvo: 'rvr_curto', acao: 'pedir' })).toBeNull()
    expect(validateAct({ tipo: 'amizade', acao: 'pedir' })).toBeNull()
  })
  it('relation: 4 actions', () => {
    for (const a of ['bloquear', 'desbloquear', 'silenciar', 'dessilenciar']) expect(validateAct({ tipo: 'relacao', alvo: U, acao: a })).toEqual({ tipo: 'relacao', alvo: U, acao: a })
    expect(validateAct({ tipo: 'relacao', alvo: U, acao: 'ignorar' })).toBeNull()
    expect(validateAct({ tipo: 'relacao', alvo: O, acao: 'bloquear' })).toBeNull()
  })
  it('badge: the 4 badges', () => {
    for (const s of BADGES) expect(validateAct({ tipo: 'selo', alvo: U, selo: s })).toEqual({ tipo: 'selo', alvo: U, selo: s })
    expect(validateAct({ tipo: 'selo', alvo: U, selo: 'sexy' })).toBeNull()
    expect(validateAct({ tipo: 'selo', alvo: O, selo: 'rapido' })).toBeNull()
  })
  it('testimonial-decision: object id and accept or refuse', () => {
    expect(validateAct({ tipo: 'depoimento-decisao', depoimento: O, decisao: 'aceitar' })).toEqual({ tipo: 'depoimento-decisao', depoimento: O, decisao: 'aceitar' })
    expect(validateAct({ tipo: 'depoimento-decisao', depoimento: O, decisao: 'recusar' })).not.toBeNull()
    expect(validateAct({ tipo: 'depoimento-decisao', depoimento: O, decisao: 'talvez' })).toBeNull()
    expect(validateAct({ tipo: 'depoimento-decisao', depoimento: U, decisao: 'aceitar' })).toBeNull()
  })
  it('community-join: 5 actions and a community id', () => {
    for (const a of ['entrar', 'sair', 'aceitar-convite', 'recusar-convite', 'cancelar-pedido']) expect(validateAct({ tipo: 'comunidade-adesao', comunidade: O, acao: a })).toEqual({ tipo: 'comunidade-adesao', comunidade: O, acao: a })
    expect(validateAct({ tipo: 'comunidade-adesao', comunidade: O, acao: 'invadir' })).toBeNull()
    expect(validateAct({ tipo: 'comunidade-adesao', comunidade: 'ob_curto', acao: 'entrar' })).toBeNull()
    expect(validateAct({ tipo: 'comunidade-adesao', comunidade: U, acao: 'entrar' })).toBeNull()
  })
  describe('community-management: the reason is required to expel and ban, and forbidden on the others', () => {
    const base = { tipo: 'comunidade-gestao', comunidade: O, alvo: U }
    it('expel and ban require a reason from the enum', () => {
      for (const a of ['expulsar', 'banir']) {
        expect(validateAct({ ...base, acao: a, motivo: null }), a).toBeNull()
        expect(validateAct({ ...base, acao: a }), a).toBeNull()
        expect(validateAct({ ...base, acao: a, motivo: 'porque sim' }), a).toBeNull()
        for (const m of MODERATION_REASON_LIST) expect(validateAct({ ...base, acao: a, motivo: m })).toEqual({ ...base, acao: a, motivo: m })
      }
    })
    it('the other actions must have a null reason', () => {
      for (const a of ['convidar', 'cancelar-convite', 'aprovar-pedido', 'recusar-pedido', 'desbanir', 'promover', 'rebaixar']) {
        expect(validateAct({ ...base, acao: a, motivo: null })).toEqual({ ...base, acao: a, motivo: null })
        expect(validateAct({ ...base, acao: a })).toEqual({ ...base, acao: a, motivo: null })
        expect(validateAct({ ...base, acao: a, motivo: 'spam' }), a).toBeNull()
      }
    })
    it('unknown action, bad target and community', () => {
      expect(validateAct({ ...base, acao: 'castigar', motivo: null })).toBeNull()
      expect(validateAct({ ...base, acao: 'banir', alvo: O, motivo: 'spam' })).toBeNull()
      expect(validateAct({ ...base, acao: 'banir', comunidade: 'x', motivo: 'spam' })).toBeNull()
    })
  })
  describe('topico-gestao', () => {
    it('pin, unpin, lock and unlock: no destination', () => {
      for (const a of ['fixar', 'desafixar', 'trancar', 'destrancar']) {
        expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: a, comunidade: null, categoria: null })).toEqual({ tipo: 'topico-gestao', topico: O, acao: a, comunidade: null, categoria: null })
        expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: a })).toEqual({ tipo: 'topico-gestao', topico: O, acao: a, comunidade: null, categoria: null })
        expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: a, comunidade: O2, categoria: null }), a).toBeNull()
      }
    })
    it('move requires the destination community; the category is optional and up to 30 characters', () => {
      expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 'Dicas' })).toEqual({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 'Dicas' })
      expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: null })).not.toBeNull()
      expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: null, categoria: null })).toBeNull()
      expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: 'x', categoria: null })).toBeNull()
      expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 'a'.repeat(30) })).not.toBeNull()
      expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 'a'.repeat(31) })).toBeNull()
      expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 5 })).toBeNull()
      expect(validateAct({ tipo: 'topico-gestao', topico: 'x', acao: 'fixar' })).toBeNull()
      expect(validateAct({ tipo: 'topico-gestao', topico: O, acao: 'apagar' })).toBeNull()
    })
  })
  it('topic-solved: the reply is an id or null (undoes)', () => {
    expect(validateAct({ tipo: 'topico-resolvido', topico: O, resposta: O2 })).toEqual({ tipo: 'topico-resolvido', topico: O, resposta: O2 })
    expect(validateAct({ tipo: 'topico-resolvido', topico: O, resposta: null })).toEqual({ tipo: 'topico-resolvido', topico: O, resposta: null })
    expect(validateAct({ tipo: 'topico-resolvido', topico: O })).toBeNull()
    expect(validateAct({ tipo: 'topico-resolvido', topico: O, resposta: 'x' })).toBeNull()
    expect(validateAct({ tipo: 'topico-resolvido', topico: 'x', resposta: null })).toBeNull()
  })
  it('vote: integer option from 0 to 5', () => {
    for (let i = 0; i <= 5; i++) expect(validateAct({ tipo: 'voto', topico: O, opcao: i })).toEqual({ tipo: 'voto', topico: O, opcao: i })
    for (const x of [-1, 6, 1.5, '2', null, NaN, Infinity]) expect(validateAct({ tipo: 'voto', topico: O, opcao: x }), String(x)).toBeNull()
    expect(validateAct({ tipo: 'voto', topico: 'x', opcao: 1 })).toBeNull()
  })
  it('pagina-seguir e pagina-gestao', () => {
    expect(validateAct({ tipo: 'pagina-seguir', pagina: O, acao: 'seguir' })).toEqual({ tipo: 'pagina-seguir', pagina: O, acao: 'seguir' })
    expect(validateAct({ tipo: 'pagina-seguir', pagina: O, acao: 'deixar' })).toEqual({ tipo: 'pagina-seguir', pagina: O, acao: 'deixar' })
    expect(validateAct({ tipo: 'pagina-seguir', pagina: O, acao: 'amar' })).toBeNull()
    expect(validateAct({ tipo: 'pagina-seguir', pagina: U, acao: 'seguir' })).toBeNull()
    expect(validateAct({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'adicionar-admin' })).toEqual({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'adicionar-admin' })
    expect(validateAct({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'remover-admin' })).toEqual({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'remover-admin' })
    expect(validateAct({ tipo: 'pagina-gestao', pagina: O, alvo: O, acao: 'remover-admin' })).toBeNull()
    expect(validateAct({ tipo: 'pagina-gestao', pagina: U, alvo: U, acao: 'remover-admin' })).toBeNull()
    expect(validateAct({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'virar-dono' })).toBeNull()
  })
  it('removal-by-responsible: id and reason from the enum', () => {
    for (const m of MODERATION_REASON_LIST) expect(validateAct({ tipo: 'remocao-por-responsavel', alvo: O, motivo: m })).toEqual({ tipo: 'remocao-por-responsavel', alvo: O, motivo: m })
    expect(validateAct({ tipo: 'remocao-por-responsavel', alvo: O, motivo: 'golpe' })).toBeNull()
    expect(validateAct({ tipo: 'remocao-por-responsavel', alvo: O })).toBeNull()
    expect(validateAct({ tipo: 'remocao-por-responsavel', alvo: U, motivo: 'spam' })).toBeNull()
  })
  it('remocao-pelo-autor, apelacao-decisao and denuncia', () => {
    expect(validateAct({ tipo: 'remocao-pelo-autor', alvo: O })).toEqual({ tipo: 'remocao-pelo-autor', alvo: O })
    expect(validateAct({ tipo: 'remocao-pelo-autor', alvo: 'ob_x' })).toBeNull()
    expect(validateAct({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'mantida' })).toEqual({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'mantida' })
    expect(validateAct({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'revertida' })).toEqual({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'revertida' })
    expect(validateAct({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'talvez' })).toBeNull()
    expect(validateAct({ tipo: 'apelacao-decisao', apelacao: U, resultado: 'mantida' })).toBeNull()
    for (const m of SOCIAL_REPORT_REASONS) expect(validateAct({ tipo: 'denuncia', alvo: O, motivo: m })).toEqual({ tipo: 'denuncia', alvo: O, motivo: m })
    expect(validateAct({ tipo: 'denuncia', alvo: O, motivo: 'chatice' })).toBeNull()
    expect(validateAct({ tipo: 'denuncia', alvo: 'x', motivo: 'spam' })).toBeNull()
  })
  it('an id with the right shape but junk in the middle is refused; with the right shape and DEMO it is accepted', () => {
    expect(validateAct({ tipo: 'remocao-pelo-autor', alvo: `ob_${'!'.repeat(43)}` })).toBeNull()
    expect(validateAct({ tipo: 'remocao-pelo-autor', alvo: `ob_${'A'.repeat(43)}` })).not.toBeNull()
    expect(validateAct({ tipo: 'remocao-pelo-autor', alvo: `ob_${'A'.repeat(43)}extra` })).toBeNull()
    expect(validateAct({ tipo: 'amizade', alvo: `rvr_${'A'.repeat(22)}\n`, acao: 'pedir' })).toBeNull()
  })
})
