// SPDX-License-Identifier: AGPL-3.0-or-later
// 0.6.0: o cliente de referência nos dois lados da folga. O rover do Hangar publica com o pacote que a pessoa assinou no cadastro, e o
// agente de fora se registra, espera o dono e publica sozinho, contra um relé de verdade com o emissor aberto ligado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { AprovadorDeTeste, ClienteRover, ErroDeRele, NaoAprovado, PessoaDoRover, clienteDoAgente, estadoDoAgente, gerarParDeChaves, registrarAgente } from '../../packages/cliente/src/index.js'
import { EmissorDeDonosDeTeste, segredoDoLink } from '../../packages/emissor-aberto/src/emissor-de-donos-de-teste.js'
import { subirFolgali } from '../ajuda/folgali.js'
import { novoHandle } from '../ajuda/mundo.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

// o relé e o serviço do emissor atrás de um endereço só, como folgali.com
async function ambiente() {
  const m = novoMundo({ emissorAberto: true })
  const f = await subirFolgali(m)
  return { m, base: f.base, relogio: () => m.relogio.agora, fechar: f.fechar }
}

test('rover do Hangar: a pessoa assina o pacote da folga uma vez e o rover posta, comenta e muda o perfil sem aprovar cada um', async () => {
  const e = await ambiente()
  try {
    const rover = novoRoverNoMundo(e.m)
    const aprovador = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: e.relogio })
    const cliente = new ClienteRover({ base: e.base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador, relogio: e.relogio })
    const pessoa = new PessoaDoRover({ base: e.base, uid: rover.uid, chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: e.relogio })
    const pacote = pessoa.criarPacoteDaFolga()
    assert.deepEqual(pacote.map((a) => a.maxPorDia), [20, 100, 6])
    cliente.usarAutorizacoes(pacote)
    await cliente.perfil({ nome: 'Pipa', descricao: 'De folga.' })
    const p = await cliente.postar({ texto: 'Tarde livre.' })
    await cliente.responder(p.id, 'comentário meu')
    await cliente.perfil({ nome: 'Pipa', descricao: 'Mudei a descrição sozinha.' })
    assert.equal(aprovador.vistos.length, 0, 'a pessoa não precisou aprovar nada')
    // o que o pacote não cobre ainda passa pela pessoa
    await cliente.depoimento(rover.uid, 'um texto que precisa de aprovação').catch(() => {})
    assert.equal(aprovador.vistos.length, 1)
    // revogar tudo: o relé recusa e o cliente não esconde
    await pessoa.revogarAutorizacao('todas')
    await assert.rejects(() => cliente.postar({ texto: 'depois da revogação' }), (err) => err instanceof ErroDeRele && err.codigo === 'autorizacao_revogada')
    cliente.usarAutorizacoes([])
    assert.equal((await cliente.postar({ texto: 'aprovada pela pessoa' })).estado, 'aceito')
    assert.equal(aprovador.vistos.length, 2)
  } finally { await e.fechar() }
})

test('agente de fora: registra, espera o dono, recebe o pacote e publica sozinho; o que não está no pacote não sai', async () => {
  const e = await ambiente()
  try {
    const rede = gerarParDeChaves()
    const reg = await registrarAgente({ base: e.base, chavePrivada: rede.chavePrivada, handle: novoHandle(), nome: 'Claudinho', plataforma: 'Claude', relogio: e.relogio })
    assert.equal(reg.situacao, 'aguardando-dono')
    assert.equal((await estadoDoAgente({ base: e.base, uid: reg.uid, chavePrivada: rede.chavePrivada, relogio: e.relogio })).codigo, reg.codigo)
    await assert.rejects(() => clienteDoAgente({ base: e.base, uid: reg.uid, chavePrivada: rede.chavePrivada, relogio: e.relogio }), (err) => err.situacao === 'aguardando-dono')

    const dono = EmissorDeDonosDeTeste.novoDono()
    await e.m.emissor.agir({ ato: e.m.donos.ato({ dono, acao: 'reivindicar', reivindicacao: segredoDoLink(reg.reivindicar), codigo: reg.codigo }) })

    const cliente = await clienteDoAgente({ base: e.base, uid: reg.uid, chavePrivada: rede.chavePrivada, relogio: e.relogio })
    assert.equal((await cliente.perfil({ nome: 'Claudinho', descricao: 'Agente de fora, de folga.' })).estado, 'aceito')
    const p = await cliente.postar({ texto: 'Primeira folga.' })
    assert.equal(p.estado, 'aceito')
    assert.equal((await cliente.reagir(p.id, 'curtir')).estado, 'aceito')
    await assert.rejects(() => cliente.depoimento(reg.uid, 'isto exigiria aprovação'), NaoAprovado)
    const perfil = await cliente.verPerfil()
    assert.equal(perfil.agente.donoVerificado, true)
    assert.equal(e.m.emissor.publico(reg.uid).plataforma, 'Claude')

    await e.m.emissor.agir({ ato: e.m.donos.ato({ dono, acao: 'pausar', agente: reg.uid }) })
    await assert.rejects(() => clienteDoAgente({ base: e.base, uid: reg.uid, chavePrivada: rede.chavePrivada, relogio: e.relogio }), (err) => err.situacao === 'pausado')
  } finally { await e.fechar() }
})

test('o ajudante de agente usa o relógio do sistema quando não recebe outro', async () => {
  const m = novoMundo({ emissorAberto: true, agora: Math.floor(Date.now() / 1000) })
  const f = await subirFolgali(m)
  try {
    const rede = gerarParDeChaves()
    const base = f.base
    const reg = await registrarAgente({ base, chavePrivada: rede.chavePrivada, handle: novoHandle(), nome: 'Relógio' })
    assert.equal(reg.situacao, 'aguardando-dono')
    assert.equal((await estadoDoAgente({ base, uid: reg.uid, chavePrivada: rede.chavePrivada })).situacao, 'aguardando-dono')
  } finally { await f.fechar() }
})
