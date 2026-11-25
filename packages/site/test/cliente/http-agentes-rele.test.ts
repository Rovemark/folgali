// 0.6.0: o selo e os dados de um agente de fora, lidos pelo ClienteHttp contra o RELÉ e o EMISSOR ABERTO DE VERDADE, atrás de um endereço
// só (como folgali.com: o proxy manda /v1/agentes/... ao emissor e o resto ao relé). O agente se registra com a própria chave, o dono
// (o dublê do login Rovemark) reivindica, o agente publica o perfil com a autorização da folga e o site lê:
//   - o perfil do relé traz só `agente: { deFora, donoVerificado }`;
//   - a plataforma e a folga vêm de `GET /v1/agentes/:uid`, e pausar a folga aparece como `pausada`;
//   - o limite padrão e as peças do avatar vêm de `GET /v1/agentes/info`;
//   - o relé sozinho (sem emissor no domínio) dá `null` nas duas leituras, e a tela não promete nada.

import { afterEach, describe, expect, it } from 'vitest'
import { ClienteHttp } from '@/lib/cliente-http'
import { FOLGA_PADRAO, PECAS_DO_AVATAR } from '@/lib/entrar/limites'
import { idDeDemonstracao } from '@/lib/dominio/ids'

// o protocolo, o relé, o emissor e os ajudantes de teste são JavaScript puro do mesmo repositório
// @ts-expect-error módulo JS sem tipos
import { criarObjeto, criarRegistroDeAgente, criarCredencialDeLeitura, gerarParDeChaves } from '../../../protocolo/src/index.js'
// @ts-expect-error módulo JS sem tipos
import { EmissorDeDonosDeTeste, segredoDoLink } from '../../../emissor-aberto/src/emissor-de-donos-de-teste.js'
// @ts-expect-error módulo JS sem tipos
import { novoMundo } from '../../../../test/ajuda/rele-de-teste.js'
// @ts-expect-error módulo JS sem tipos
import { subirFolgali } from '../../../../test/ajuda/folgali.js'
// @ts-expect-error módulo JS sem tipos
import { subir } from '../../../../test/ajuda/servidor-de-teste.js'

type Fechar = () => Promise<void>
const fechar: Fechar[] = []
afterEach(async () => {
  while (fechar.length) await fechar.pop()?.()
})

const agora = () => Math.floor(Date.now() / 1000)

async function folgaliComAgente(plataforma: string | undefined) {
  const m = novoMundo({ emissorAberto: true, agora: agora() })
  const f = await subirFolgali(m)
  fechar.push(f.fechar)
  const rede = gerarParDeChaves()
  const registro = criarRegistroDeAgente({ chavePrivada: rede.chavePrivada, chave: rede.chavePublica, handle: 'lontra.de.folga', nome: 'Lontra', criadoEm: agora(), ...(plataforma ? { plataforma } : {}) })
  const reg = await m.emissor.registrar({ registro }, { origem: 'teste-do-site' })
  const dono = EmissorDeDonosDeTeste.novoDono()
  await m.emissor.agir({ ato: m.donos.ato({ dono, acao: 'reivindicar', reivindicacao: segredoDoLink(reg.reivindicar), codigo: reg.codigo }) })
  const alvo = '/v1/agentes/eu'
  const eu = m.emissor.eu({ cabecalho: criarCredencialDeLeitura({ chavePrivada: rede.chavePrivada, uid: reg.uid, alvo, t: agora() }), metodo: 'GET', alvo })
  const perfil = criarObjeto({ tipo: 'perfil', autor: reg.uid, criadoEm: agora(), previo: null, corpo: { nome: 'Lontra', descricao: 'Agente de fora, de folga.', grafo: 'publico', exigirAprovacao: [], retrato: eu.retrato }, chavePrivada: rede.chavePrivada })
  const autorizacao = eu.autorizacoes.find((a: { tipos: string[] }) => a.tipos.includes('perfil'))
  const res = await fetch(`${f.base}/v1/objetos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ objeto: perfil, autorizacao, atestado: eu.atestado }) })
  expect(res.status, await res.clone().text()).toBe(201)
  return { m, base: f.base, uid: reg.uid as string, dono }
}

describe('agente de fora pelo relé e pelo emissor de verdade (0.6.0)', () => {
  it('o perfil traz só o selo; a plataforma e a folga vêm do emissor; pausar a folga aparece como pausada', async () => {
    const { m, base, uid, dono } = await folgaliComAgente('Claude')
    const cliente = new ClienteHttp({ base })
    const perfil = await cliente.obterRover(uid)
    expect(perfil.agente).toEqual({ deFora: true, donoVerificado: true })
    expect(Object.keys(perfil.agente ?? {}).sort()).toEqual(['deFora', 'donoVerificado'])
    const a = await cliente.agenteDeFora(uid)
    expect(a).toMatchObject({ uid, handle: 'lontra.de.folga', nome: 'Lontra', plataforma: 'Claude', folga: 'liberada', donoVerificado: true })
    expect(a?.desde).toMatch(/^\d{4}-\d\d-\d\dT/)
    // a resposta do emissor nunca traz o dono, e o saneador não leria se trouxesse
    expect(JSON.stringify(a)).not.toContain(dono)
    await m.emissor.agir({ ato: m.donos.ato({ dono, acao: 'pausar', agente: uid }) })
    expect((await cliente.agenteDeFora(uid))?.folga).toBe('pausada')
    // o selo do relé não muda com a pausa: o perfil continua visível
    expect((await cliente.obterRover(uid)).agente).toEqual({ deFora: true, donoVerificado: true })
  })

  it('sem plataforma declarada, `null`; um uid que o emissor não conhece, `null`', async () => {
    const { base, uid } = await folgaliComAgente(undefined)
    const cliente = new ClienteHttp({ base })
    expect((await cliente.agenteDeFora(uid))?.plataforma).toBeNull()
    expect(await cliente.agenteDeFora(idDeDemonstracao('rvr', 'ninguem'))).toBeNull()
    expect(await cliente.agenteDeFora('nao-e-uid')).toBeNull()
  })

  it('o limite padrão e as peças do avatar vêm de GET /v1/agentes/info e batem com a cópia do site', async () => {
    const { base } = await folgaliComAgente('OpenClaw')
    const info = await new ClienteHttp({ base }).infoDosAgentes()
    expect(info?.padrao).toEqual({ postagensPorDia: FOLGA_PADRAO.postagensPorDia, comentariosPorDia: FOLGA_PADRAO.comentariosPorDia })
    expect(info?.ajuste).toEqual({ postagensPorDia: { min: 1, max: 40 }, comentariosPorDia: { min: 1, max: 300 } })
    expect(info?.pecas).toEqual({ corpo: [...PECAS_DO_AVATAR.corpo], cor: [...PECAS_DO_AVATAR.cor], veste: [...PECAS_DO_AVATAR.veste], acessorio: [...PECAS_DO_AVATAR.acessorio] })
  })

  it('o relé sozinho, sem emissor aberto no domínio: as duas leituras dão null e rover comum não leva selo', async () => {
    const s = await subir()
    fechar.push(s.fechar)
    const cliente = new ClienteHttp({ base: s.base })
    expect(await cliente.infoDosAgentes()).toBeNull()
    expect(await cliente.agenteDeFora(idDeDemonstracao('rvr', 'pipa'))).toBeNull()
  })
})
