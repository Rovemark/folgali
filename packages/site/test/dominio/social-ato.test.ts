// O navegador é um estranho: nada que ele manda vira ato sem passar por validarAto.
import { describe, expect, it } from 'vitest'
import { validarAto } from '@/lib/dominio/ato'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { ESTADOS_ROVER, MOTIVOS_DENUNCIA_SOCIAL, MOTIVOS_MODERACAO, SELOS } from '@/lib/social/tipos'

const U = idDeDemonstracao('rvr', 'pipa')
const O = idDeDemonstracao('ob', 'c1')
const O2 = idDeDemonstracao('ob', 'c2')

describe('validarAto: formas que nem chegam a ser um ato', () => {
  it('lixo, nulo, lista, tipo desconhecido ou ausente', () => {
    for (const x of [null, undefined, 1, 'amizade', [], [{ tipo: 'estado' }], {}, { tipo: 'apagar-tudo' }, { tipo: 42 }, { tipo: 'seguir', alvo: U }]) expect(validarAto(x), JSON.stringify(x)).toBeNull()
  })
  it('devolve só os campos do ato: campo extra do navegador é descartado', () => {
    expect(validarAto({ tipo: 'amizade', alvo: U, acao: 'pedir', admin: true, uid: U })).toEqual({ tipo: 'amizade', alvo: U, acao: 'pedir' })
  })
})

describe('validarAto: cada tipo', () => {
  it('estado: os 5 estados', () => {
    for (const e of ESTADOS_ROVER) expect(validarAto({ tipo: 'estado', estado: e })).toEqual({ tipo: 'estado', estado: e })
    expect(validarAto({ tipo: 'estado', estado: 'feliz' })).toBeNull()
    expect(validarAto({ tipo: 'estado' })).toBeNull()
  })
  it('amizade: 4 ações, alvo é um uid', () => {
    for (const a of ['pedir', 'aceitar', 'recusar', 'desfazer']) expect(validarAto({ tipo: 'amizade', alvo: U, acao: a })).toEqual({ tipo: 'amizade', alvo: U, acao: a })
    expect(validarAto({ tipo: 'amizade', alvo: U, acao: 'adotar' })).toBeNull()
    expect(validarAto({ tipo: 'amizade', alvo: O, acao: 'pedir' })).toBeNull()
    expect(validarAto({ tipo: 'amizade', alvo: 'rvr_curto', acao: 'pedir' })).toBeNull()
    expect(validarAto({ tipo: 'amizade', acao: 'pedir' })).toBeNull()
  })
  it('relacao: 4 ações', () => {
    for (const a of ['bloquear', 'desbloquear', 'silenciar', 'dessilenciar']) expect(validarAto({ tipo: 'relacao', alvo: U, acao: a })).toEqual({ tipo: 'relacao', alvo: U, acao: a })
    expect(validarAto({ tipo: 'relacao', alvo: U, acao: 'ignorar' })).toBeNull()
    expect(validarAto({ tipo: 'relacao', alvo: O, acao: 'bloquear' })).toBeNull()
  })
  it('selo: os 4 selos', () => {
    for (const s of SELOS) expect(validarAto({ tipo: 'selo', alvo: U, selo: s })).toEqual({ tipo: 'selo', alvo: U, selo: s })
    expect(validarAto({ tipo: 'selo', alvo: U, selo: 'sexy' })).toBeNull()
    expect(validarAto({ tipo: 'selo', alvo: O, selo: 'rapido' })).toBeNull()
  })
  it('depoimento-decisao: id de objeto e aceitar ou recusar', () => {
    expect(validarAto({ tipo: 'depoimento-decisao', depoimento: O, decisao: 'aceitar' })).toEqual({ tipo: 'depoimento-decisao', depoimento: O, decisao: 'aceitar' })
    expect(validarAto({ tipo: 'depoimento-decisao', depoimento: O, decisao: 'recusar' })).not.toBeNull()
    expect(validarAto({ tipo: 'depoimento-decisao', depoimento: O, decisao: 'talvez' })).toBeNull()
    expect(validarAto({ tipo: 'depoimento-decisao', depoimento: U, decisao: 'aceitar' })).toBeNull()
  })
  it('comunidade-adesao: 5 ações e id de comunidade', () => {
    for (const a of ['entrar', 'sair', 'aceitar-convite', 'recusar-convite', 'cancelar-pedido']) expect(validarAto({ tipo: 'comunidade-adesao', comunidade: O, acao: a })).toEqual({ tipo: 'comunidade-adesao', comunidade: O, acao: a })
    expect(validarAto({ tipo: 'comunidade-adesao', comunidade: O, acao: 'invadir' })).toBeNull()
    expect(validarAto({ tipo: 'comunidade-adesao', comunidade: 'ob_curto', acao: 'entrar' })).toBeNull()
    expect(validarAto({ tipo: 'comunidade-adesao', comunidade: U, acao: 'entrar' })).toBeNull()
  })
  describe('comunidade-gestao: o motivo é obrigatório para expulsar e banir, e proibido nas demais', () => {
    const base = { tipo: 'comunidade-gestao', comunidade: O, alvo: U }
    it('expulsar e banir exigem motivo do enum', () => {
      for (const a of ['expulsar', 'banir']) {
        expect(validarAto({ ...base, acao: a, motivo: null }), a).toBeNull()
        expect(validarAto({ ...base, acao: a }), a).toBeNull()
        expect(validarAto({ ...base, acao: a, motivo: 'porque sim' }), a).toBeNull()
        for (const m of MOTIVOS_MODERACAO) expect(validarAto({ ...base, acao: a, motivo: m })).toEqual({ ...base, acao: a, motivo: m })
      }
    })
    it('as demais ações têm de ter motivo nulo', () => {
      for (const a of ['convidar', 'cancelar-convite', 'aprovar-pedido', 'recusar-pedido', 'desbanir', 'promover', 'rebaixar']) {
        expect(validarAto({ ...base, acao: a, motivo: null })).toEqual({ ...base, acao: a, motivo: null })
        expect(validarAto({ ...base, acao: a })).toEqual({ ...base, acao: a, motivo: null })
        expect(validarAto({ ...base, acao: a, motivo: 'spam' }), a).toBeNull()
      }
    })
    it('ação desconhecida, alvo e comunidade ruins', () => {
      expect(validarAto({ ...base, acao: 'castigar', motivo: null })).toBeNull()
      expect(validarAto({ ...base, acao: 'banir', alvo: O, motivo: 'spam' })).toBeNull()
      expect(validarAto({ ...base, acao: 'banir', comunidade: 'x', motivo: 'spam' })).toBeNull()
    })
  })
  describe('topico-gestao', () => {
    it('fixar, desafixar, trancar e destrancar: sem destino', () => {
      for (const a of ['fixar', 'desafixar', 'trancar', 'destrancar']) {
        expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: a, comunidade: null, categoria: null })).toEqual({ tipo: 'topico-gestao', topico: O, acao: a, comunidade: null, categoria: null })
        expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: a })).toEqual({ tipo: 'topico-gestao', topico: O, acao: a, comunidade: null, categoria: null })
        expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: a, comunidade: O2, categoria: null }), a).toBeNull()
      }
    })
    it('mover exige a comunidade de destino; a categoria é opcional e até 30 caracteres', () => {
      expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 'Dicas' })).toEqual({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 'Dicas' })
      expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: null })).not.toBeNull()
      expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: null, categoria: null })).toBeNull()
      expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: 'x', categoria: null })).toBeNull()
      expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 'a'.repeat(30) })).not.toBeNull()
      expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 'a'.repeat(31) })).toBeNull()
      expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: 'mover', comunidade: O2, categoria: 5 })).toBeNull()
      expect(validarAto({ tipo: 'topico-gestao', topico: 'x', acao: 'fixar' })).toBeNull()
      expect(validarAto({ tipo: 'topico-gestao', topico: O, acao: 'apagar' })).toBeNull()
    })
  })
  it('topico-resolvido: resposta é um id ou null (desfaz)', () => {
    expect(validarAto({ tipo: 'topico-resolvido', topico: O, resposta: O2 })).toEqual({ tipo: 'topico-resolvido', topico: O, resposta: O2 })
    expect(validarAto({ tipo: 'topico-resolvido', topico: O, resposta: null })).toEqual({ tipo: 'topico-resolvido', topico: O, resposta: null })
    expect(validarAto({ tipo: 'topico-resolvido', topico: O })).toBeNull()
    expect(validarAto({ tipo: 'topico-resolvido', topico: O, resposta: 'x' })).toBeNull()
    expect(validarAto({ tipo: 'topico-resolvido', topico: 'x', resposta: null })).toBeNull()
  })
  it('voto: opção inteira de 0 a 5', () => {
    for (let i = 0; i <= 5; i++) expect(validarAto({ tipo: 'voto', topico: O, opcao: i })).toEqual({ tipo: 'voto', topico: O, opcao: i })
    for (const x of [-1, 6, 1.5, '2', null, NaN, Infinity]) expect(validarAto({ tipo: 'voto', topico: O, opcao: x }), String(x)).toBeNull()
    expect(validarAto({ tipo: 'voto', topico: 'x', opcao: 1 })).toBeNull()
  })
  it('pagina-seguir e pagina-gestao', () => {
    expect(validarAto({ tipo: 'pagina-seguir', pagina: O, acao: 'seguir' })).toEqual({ tipo: 'pagina-seguir', pagina: O, acao: 'seguir' })
    expect(validarAto({ tipo: 'pagina-seguir', pagina: O, acao: 'deixar' })).toEqual({ tipo: 'pagina-seguir', pagina: O, acao: 'deixar' })
    expect(validarAto({ tipo: 'pagina-seguir', pagina: O, acao: 'amar' })).toBeNull()
    expect(validarAto({ tipo: 'pagina-seguir', pagina: U, acao: 'seguir' })).toBeNull()
    expect(validarAto({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'adicionar-admin' })).toEqual({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'adicionar-admin' })
    expect(validarAto({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'remover-admin' })).toEqual({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'remover-admin' })
    expect(validarAto({ tipo: 'pagina-gestao', pagina: O, alvo: O, acao: 'remover-admin' })).toBeNull()
    expect(validarAto({ tipo: 'pagina-gestao', pagina: U, alvo: U, acao: 'remover-admin' })).toBeNull()
    expect(validarAto({ tipo: 'pagina-gestao', pagina: O, alvo: U, acao: 'virar-dono' })).toBeNull()
  })
  it('remocao-por-responsavel: id e motivo do enum', () => {
    for (const m of MOTIVOS_MODERACAO) expect(validarAto({ tipo: 'remocao-por-responsavel', alvo: O, motivo: m })).toEqual({ tipo: 'remocao-por-responsavel', alvo: O, motivo: m })
    expect(validarAto({ tipo: 'remocao-por-responsavel', alvo: O, motivo: 'golpe' })).toBeNull()
    expect(validarAto({ tipo: 'remocao-por-responsavel', alvo: O })).toBeNull()
    expect(validarAto({ tipo: 'remocao-por-responsavel', alvo: U, motivo: 'spam' })).toBeNull()
  })
  it('remocao-pelo-autor, apelacao-decisao e denuncia', () => {
    expect(validarAto({ tipo: 'remocao-pelo-autor', alvo: O })).toEqual({ tipo: 'remocao-pelo-autor', alvo: O })
    expect(validarAto({ tipo: 'remocao-pelo-autor', alvo: 'ob_x' })).toBeNull()
    expect(validarAto({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'mantida' })).toEqual({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'mantida' })
    expect(validarAto({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'revertida' })).toEqual({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'revertida' })
    expect(validarAto({ tipo: 'apelacao-decisao', apelacao: O, resultado: 'talvez' })).toBeNull()
    expect(validarAto({ tipo: 'apelacao-decisao', apelacao: U, resultado: 'mantida' })).toBeNull()
    for (const m of MOTIVOS_DENUNCIA_SOCIAL) expect(validarAto({ tipo: 'denuncia', alvo: O, motivo: m })).toEqual({ tipo: 'denuncia', alvo: O, motivo: m })
    expect(validarAto({ tipo: 'denuncia', alvo: O, motivo: 'chatice' })).toBeNull()
    expect(validarAto({ tipo: 'denuncia', alvo: 'x', motivo: 'spam' })).toBeNull()
  })
  it('id com a forma certa mas lixo no meio é recusado; com a forma certa e DEMO é aceito', () => {
    expect(validarAto({ tipo: 'remocao-pelo-autor', alvo: `ob_${'!'.repeat(43)}` })).toBeNull()
    expect(validarAto({ tipo: 'remocao-pelo-autor', alvo: `ob_${'A'.repeat(43)}` })).not.toBeNull()
    expect(validarAto({ tipo: 'remocao-pelo-autor', alvo: `ob_${'A'.repeat(43)}extra` })).toBeNull()
    expect(validarAto({ tipo: 'amizade', alvo: `rvr_${'A'.repeat(22)}\n`, acao: 'pedir' })).toBeNull()
  })
})
