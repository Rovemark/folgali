// 0.6.0: o cliente de demonstração responde pelo emissor aberto como o de verdade (o contrato está em http-agentes-rele.test.ts), e o
// saneador do selo e dos dados do agente de fora não deixa passar nada além do contrato.

import { describe, expect, it } from 'vitest'
import { ClienteFalso } from '@/lib/cliente-falso'
import { FOLGA_AJUSTE, FOLGA_PADRAO } from '@/lib/entrar/limites'
import { AGENTES_DE_FORA } from '@/lib/folgali/demo'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { agenteDeFora, infoDosAgentes, perfilSocial, seloDeAgente } from '@/lib/social/sanear-social'

const UID = idDeDemonstracao('rvr', 'pipa')
const base = { uid: UID, handle: 'pipa', nome: 'Pipa', descricao: '', retrato: { corpo: 'bolinha', cor: 'ceu', veste: 'fone', acessorio: 'cachecol' }, seguindo: 0, seguidores: 0 }

describe('cliente falso: o emissor aberto da demonstração', () => {
  it('cada agente de fora da demonstração tem plataforma, folga e dono verificado, e nunca o dono', async () => {
    const c = new ClienteFalso()
    for (const a of Object.values(AGENTES_DE_FORA)) {
      const r = await c.agenteDeFora(a.uid)
      expect(r).toMatchObject({ uid: a.uid, handle: a.handle, nome: a.nome, plataforma: a.origem, folga: a.folga, donoVerificado: true })
      expect(Object.keys(r ?? {}).sort()).toEqual(['desde', 'donoVerificado', 'folga', 'handle', 'nome', 'plataforma', 'uid'])
    }
    expect(await c.agenteDeFora(UID)).toBeNull()
  })
  it('o limite padrão é o do pacote da folga', async () => {
    const info = await new ClienteFalso().infoDosAgentes()
    expect(info.padrao).toEqual(FOLGA_PADRAO)
    expect(info.ajuste).toEqual(FOLGA_AJUSTE)
    expect(info.pecas.veste).not.toContain('touca')
  })
})

describe('saneador do agente de fora', () => {
  it('o selo do perfil: só deFora === true vale; o resto do objeto é ignorado', () => {
    expect(seloDeAgente({ deFora: true, donoVerificado: true, plataforma: 'Claude', dono: 'x' })).toEqual({ deFora: true, donoVerificado: true })
    expect(seloDeAgente({ deFora: true })).toEqual({ deFora: true, donoVerificado: false })
    for (const torto of [undefined, null, 'sim', [], { deFora: 'true' }, { deFora: 1 }]) expect(seloDeAgente(torto)).toBeUndefined()
    expect(perfilSocial({ ...base, agente: { deFora: true, donoVerificado: true } }).agente).toEqual({ deFora: true, donoVerificado: true })
    expect('agente' in perfilSocial({ ...base, agente: { deFora: 'talvez' } })).toBe(false)
    expect('agente' in perfilSocial(base)).toBe(false)
  })
  it('os dados do emissor: plataforma é texto curto sem marcação, folga só liberada ou pausada, dono nunca lido', () => {
    const ok = { uid: UID, handle: 'pipa', nome: 'Pipa', plataforma: '  <b>Claude</b>  ', deFora: true, donoVerificado: true, folga: 'pausada', desde: 1900000000, dono: 'segredo' }
    const a = agenteDeFora(ok)
    expect(a).toEqual({ uid: UID, handle: 'pipa', nome: 'Pipa', plataforma: 'bClaude/b', folga: 'pausada', donoVerificado: true, desde: new Date(1900000000 * 1000).toISOString() })
    expect(agenteDeFora({ ...ok, plataforma: 'x'.repeat(60) }).plataforma).toHaveLength(24)
    expect(agenteDeFora({ ...ok, plataforma: null }).plataforma).toBeNull()
    expect(agenteDeFora({ ...ok, plataforma: 'x' }).plataforma).toBeNull()
    expect(() => agenteDeFora({ ...ok, folga: 'ligada' })).toThrow()
    expect(() => agenteDeFora({ ...ok, deFora: false })).toThrow()
    expect(() => agenteDeFora({ ...ok, uid: 'rvr_curto' })).toThrow()
  })
  it('a info: tetos inteiros de 1 a 1000, faixa com mínimo até o máximo, peças só em letras minúsculas', () => {
    const ok = { padrao: { postagensPorDia: 20, comentariosPorDia: 100 }, ajuste: { postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } }, pecas: { corpo: ['gota', '<x>', 3], cor: [], veste: ['fone'], acessorio: 'nada' } }
    expect(infoDosAgentes(ok).pecas).toEqual({ corpo: ['gota'], cor: [], veste: ['fone'], acessorio: [] })
    expect(() => infoDosAgentes({ ...ok, padrao: { postagensPorDia: 0, comentariosPorDia: 100 } })).toThrow()
    expect(() => infoDosAgentes({ ...ok, padrao: { postagensPorDia: 2.5, comentariosPorDia: 100 } })).toThrow()
    expect(() => infoDosAgentes({ ...ok, ajuste: { ...ok.ajuste, postagensPorDia: { min: 50, max: 40 } } })).toThrow()
  })
})
