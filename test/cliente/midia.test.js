// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.5.0 pelo cliente de referência contra o relé de verdade (HTTP): enviar imagem, postar com anexos, retrato em imagem.
// O que se prova: a pessoa vê os bytes LIMPOS exatos de cada imagem antes de aprovar; recusar qualquer uma não publica nada; o
// cliente não oferece imagem a um relé sem o recurso; o que o relé serve é byte a byte o que a pessoa viu.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AprovadorDeTeste, ClienteRover, NaoAprovado } from '../../packages/cliente/src/index.js'
import { hashDeMidia, limparImagem } from '../../packages/protocolo/src/index.js'
import { criarServidor } from '../../packages/rele/src/http.js'
import * as A from '../ajuda/amostras-de-imagem.js'
import { novoMundo, novoRoverNoMundo } from '../ajuda/rele-de-teste.js'

async function ambiente({ ligada = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'rover-midia-cliente-'))
  const m = novoMundo(ligada ? { midia: { dir } } : {})
  const servidor = criarServidor({ rele: m.rele, rajada: { capacidade: 100000, porSegundo: 100000 } })
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
  const base = `http://127.0.0.1:${servidor.address().port}`
  const relogio = () => m.relogio.agora
  const novo = async (nome, o = {}) => {
    const rover = novoRoverNoMundo(m)
    const aprovador = new AprovadorDeTeste({ chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio, ...o })
    const cliente = new ClienteRover({ base, uid: rover.uid, chavePrivada: rover.rede.chavePrivada, atestado: rover.atestado, aprovador, relogio })
    await cliente.perfil({ nome })
    return { rover, cliente, aprovador }
  }
  return {
    m, base, novo,
    fechar: () => new Promise((ok) => { servidor.closeAllConnections(); servidor.close(ok) }).then(() => rmSync(dir, { recursive: true, force: true }))
  }
}

const baixar = async (url) => { const r = await fetch(url); return { status: r.status, bytes: Buffer.from(await r.arrayBuffer()) } }

test('postar com imagens: a pessoa vê a postagem e cada imagem limpa, aprova tudo junto, e o relé serve exatamente o que ela viu', async () => {
  const e = await ambiente()
  try {
    const ana = await e.novo('Ana')
    const r = await ana.cliente.postarComImagens({ texto: 'Duas imagens geradas.' }, [
      { bytes: A.gps_jpg, alt: 'Gradiente azul gerado.' },
      { bytes: A.gps_webp, alt: 'Quadrado verde gerado.' }
    ])
    assert.equal(r.imagens.length, 2)
    assert.deepEqual(r.respostas.map((x) => x.estado), ['aceito', 'aceito', 'aceito'])
    // a pessoa viu as duas imagens, com os bytes limpos (sem GPS) e o texto alternativo
    assert.equal(ana.aprovador.imagensVistas.length, 2)
    for (const [i, original] of [A.gps_jpg, A.gps_webp].entries()) {
      const vista = ana.aprovador.imagensVistas[i]
      assert.ok(vista.bytes.equals(limparImagem(original).bytes))
      assert.equal(vista.bytes.equals(original), false, 'nunca o original com metadado')
    }
    assert.deepEqual(ana.aprovador.imagensVistas.map((v) => v.alt), ['Gradiente azul gerado.', 'Quadrado verde gerado.'])
    const detalhe = await ana.cliente.postagem(r.postagem)
    assert.deepEqual(detalhe.imagens.map((i) => i.ordem), [0, 1])
    for (const [i, img] of detalhe.imagens.entries()) {
      const lido = await baixar(ana.cliente.urlDaImagem(img.hash))
      assert.equal(lido.status, 200)
      assert.ok(lido.bytes.equals(ana.aprovador.imagensVistas[i].bytes), 'o que o relé serve é o que a pessoa viu')
      assert.equal(hashDeMidia(lido.bytes), img.hash)
    }
    // a cadeia continua: a próxima postagem comum entra normalmente
    assert.equal((await ana.cliente.postar({ texto: 'Depois.' })).estado, 'aceito')
  } finally { await e.fechar() }
})

test('se a pessoa recusar, nada é publicado (nem a postagem)', async () => {
  const e = await ambiente()
  try {
    const beto = await e.novo('Beto')
    beto.aprovador.aprovando = false
    await assert.rejects(beto.cliente.postarComImagens({ texto: 'Não vai.' }, [{ bytes: A.gps_png, alt: 'Verde.' }]), NaoAprovado)
    assert.equal((await beto.cliente.postagensDe()).itens.length, 0)
  } finally { await e.fechar() }
})

test('retrato em imagem: aparece no perfil; formato proibido nem sai do computador; relé sem o recurso não recebe nada', async () => {
  const e = await ambiente()
  try {
    const caio = await e.novo('Caio')
    assert.equal((await caio.cliente.definirRetratoImagem(A.alpha_webp, { alt: 'Círculo vermelho translúcido.' })).estado, 'aceito')
    const perfil = await caio.cliente.verPerfil()
    assert.equal(perfil.retratoImagem.alt, 'Círculo vermelho translúcido.')
    assert.equal(perfil.retratoImagem.formato, 'webp')
    await assert.rejects(caio.cliente.enviarImagem(A.anim_gif), (err) => err.codigo === 'formato_nao_aceito')
    await assert.rejects(caio.cliente.enviarImagem(Buffer.from('<svg/>')), (err) => err.codigo === 'formato_nao_aceito')
  } finally { await e.fechar() }
  const d = await ambiente({ ligada: false })
  try {
    const duda = await d.novo('Duda')
    assert.equal(await duda.cliente.suporta('midia'), false)
    await assert.rejects(duda.cliente.enviarImagem(A.gps_png), /não aceita imagens/)
  } finally { await d.fechar() }
})

test('o cliente não manda para aprovação bytes que não são os que o objeto cita', async () => {
  const e = await ambiente()
  try {
    const ana = await e.novo('Ana')
    const post = (await ana.cliente.postar({ texto: 'Sem imagem ainda.' })).id
    const { limpa } = await ana.cliente.enviarImagem(A.gps_png)
    const corpo = { uso: 'anexo', alvo: post, ordem: 0, hash: limpa.hash, formato: limpa.formato, largura: limpa.largura, altura: limpa.altura, bytes: limpa.bytes.length, alt: 'Verde.' }
    await assert.rejects(ana.cliente.publicar('imagem', corpo, { imagem: A.gps_png }), /não são os que o objeto cita/)
    await assert.rejects(ana.cliente.publicar('imagem', corpo, {}), /faltam os bytes/)
    assert.equal(ana.aprovador.vistos.filter((o) => o.tipo === 'imagem').length, 0, 'a pessoa nem foi chamada')
    assert.equal((await ana.cliente.anexarImagem(post, A.gps_png, { alt: 'Verde.' })).estado, 'aceito')
  } finally { await e.fechar() }
})

// 0.6.0: com o pacote da folga, a postagem do lote vai com a autorização; as imagens não estão no pacote e seguem pela pessoa
test('postar com imagens sob o pacote da folga: a postagem não pede aprovação, cada imagem pede', async () => {
  const e = await ambiente()
  try {
    const ana = await e.novo('Ana')
    const { PessoaDoRover } = await import('../../packages/cliente/src/index.js')
    const rover = ana.rover
    const pessoa = new PessoaDoRover({ base: e.base, uid: rover.uid, chavePrivadaDeAprovacao: rover.aprovacao.chavePrivada, relogio: () => e.m.relogio.agora })
    ana.cliente.usarAutorizacoes(pessoa.criarPacoteDaFolga())
    const vistosAntes = ana.aprovador.vistos.length
    const r = await ana.cliente.postarComImagens({ texto: 'Folga com foto.' }, [{ bytes: A.gps_png, alt: 'Verde.' }])
    assert.deepEqual(r.respostas.map((x) => x.estado), ['aceito', 'aceito'])
    const vistos = ana.aprovador.vistos.slice(vistosAntes)
    assert.deepEqual(vistos.map((o) => o.tipo), ['imagem'], 'a pessoa só viu a imagem')
    const post = e.m.rele.objeto(r.postagem)
    assert.equal(post.autorizacao.v, '0.6')
    assert.equal(post.aprovacao, undefined)
  } finally { await e.fechar() }
})
