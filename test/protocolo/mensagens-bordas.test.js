// SPDX-License-Identifier: AGPL-3.0-or-later
// Bordas da cifra das mensagens privadas (0.4.0) que o medidor de mutação mostrou sem teste: a semente da chave de cifra, o código de
// erro de chave inválida, a forma exata do texto claro (lerClaro), cada campo do corpo que falta ou vem torto, e as funções que
// prometem "entrada torta dá false, nunca exceção". Para testar o texto claro por dentro, o teste cifra um claro ARBITRÁRIO com a
// chave da mensagem que o próprio `cifrarMensagem` devolve: assim só o claro muda, e a decifra chega até ele.
import test from 'node:test'
import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import {
  ErroDoProtocolo, LIMITES_DE_MENSAGEM as LM, assinarCarta, bytesCanonicos, canonicalizar, cartaConfere, chavePrivadaDeCifraDeSemente,
  chavePublicaDeCifraDe, cifraConfere, cifrarMensagem, criarObjeto, decifrarMensagem, gerarParDeCifra, gerarParDeChaves, paraB64u, segredoDeCifra
} from '../../packages/protocolo/src/index.js'
import { AGORA, novoUid } from '../ajuda/mundo.js'

const id = () => `ob_${paraB64u(randomBytes(32))}`
const pessoa = () => ({ uid: novoUid(), rede: gerarParDeChaves(), cifra: gerarParDeCifra() })
const objeto = (autor, tipo, corpo, { criadoEm = AGORA } = {}) =>
  criarObjeto({ v: '0.4', tipo, autor: autor.uid, criadoEm, previo: null, corpo, chavePrivada: autor.rede.chavePrivada })

/** Uma mensagem de verdade de `a` para `b`, e a função que troca o texto claro dentro dela por qualquer coisa, cifrada com a mesma chave. */
function cenario(texto = 'Combinamos amanhã?') {
  const a = pessoa()
  const b = pessoa()
  const conversa = id()
  const m = cifrarMensagem({ texto, conversa, de: a.uid, para: b.uid, criadoEm: AGORA, chavePrivadaDeRede: a.rede.chavePrivada, chavePrivadaDeCifra: a.cifra.chavePrivada, chavePublicaDeCifraDoOutro: b.cifra.chavePublica })
  const contexto = bytesCanonicos({ chaveDe: m.corpo.chaveDe, chavePara: m.corpo.chavePara, conversa, criadoEm: AGORA, de: a.uid, para: b.uid })
  const comClaro = (claro) => {
    const c = createCipheriv('aes-256-gcm', m.chaveDaMensagem, Buffer.from(m.corpo.iv, 'base64url'), { authTagLength: LM.etiquetaBytes })
    c.setAAD(contexto)
    const cifrado = paraB64u(Buffer.concat([c.update(claro), c.final(), c.getAuthTag()]))
    return objeto(a, 'mensagem', { ...m.corpo, cifrado })
  }
  /** A assinatura certa da carta para um texto qualquer (o claro tem de levar a assinatura do texto que ele diz). */
  const assinar = (t) => assinarCarta({ conversa, criadoEm: AGORA, de: a.uid, iv: m.corpo.iv, para: b.uid, texto: t }, a.rede.chavePrivada)
  const ler = (o) => decifrarMensagem(o, { chavePrivadaDeCifra: b.cifra.chavePrivada, chavePublicaDeRedeDoRemetente: a.rede.chavePublica })
  const completar = (buf) => Buffer.concat([buf, Buffer.alloc(Math.max(256, Math.ceil(buf.length / 256) * 256) - buf.length, 0x20)])
  return { a, b, m, conversa, comClaro, assinar, ler, completar }
}

test('a semente da chave de cifra: 32 bytes num Buffer, determinística; qualquer outra coisa é TypeError dito', () => {
  const s = randomBytes(32)
  const k1 = chavePrivadaDeCifraDeSemente(s)
  assert.equal(chavePublicaDeCifraDe(k1), chavePublicaDeCifraDe(chavePrivadaDeCifraDeSemente(Buffer.from(s))), 'a mesma semente dá a mesma chave')
  assert.notEqual(chavePublicaDeCifraDe(k1), chavePublicaDeCifraDe(chavePrivadaDeCifraDeSemente(randomBytes(32))))
  for (const ruim of [randomBytes(31), randomBytes(33), Buffer.alloc(0), 'x'.repeat(32), new Uint8Array(32), null, undefined]) {
    assert.throws(() => chavePrivadaDeCifraDeSemente(ruim), (e) => e instanceof TypeError && /a semente tem 32 bytes/.test(e.message), String(ruim?.length))
  }
})

test('segredoDeCifra: chave pública que não importa, ou de ordem pequena, é ErroDoProtocolo `chave_fraca` no campo `chave`', () => {
  const p = gerarParDeCifra()
  const um = Buffer.alloc(32)
  um[0] = 1
  for (const ruim of ['curta', '', paraB64u(Buffer.alloc(31)), paraB64u(Buffer.alloc(32)), paraB64u(um), 42, null]) {
    assert.throws(() => segredoDeCifra(p.chavePrivada, ruim), (e) => e instanceof ErroDoProtocolo && e.codigo === 'chave_fraca' && e.campo === 'chave', String(ruim))
  }
  const q = gerarParDeCifra()
  assert.ok(segredoDeCifra(p.chavePrivada, q.chavePublica).equals(segredoDeCifra(q.chavePrivada, p.chavePublica)), 'o segredo é o mesmo dos dois lados')
})

test('cartaConfere: entrada que nem se serializa ou assinatura que não é texto dá false, nunca exceção', () => {
  const a = pessoa()
  const carta = { conversa: id(), criadoEm: AGORA, de: a.uid, iv: paraB64u(randomBytes(12)), para: novoUid(), texto: 'oi' }
  const sig = assinarCarta(carta, a.rede.chavePrivada)
  assert.equal(cartaConfere(carta, sig, a.rede.chavePublica), true, 'controle')
  for (const [nome, c, s, k] of [
    ['criadoEm BigInt', { ...carta, criadoEm: 1n }, sig, a.rede.chavePublica],
    ['texto que é função', { ...carta, texto: () => 'oi' }, sig, a.rede.chavePublica],
    ['assinatura número', carta, 5, a.rede.chavePublica],
    ['chave nula', carta, sig, null],
    ['campos nulos', null, sig, a.rede.chavePublica]
  ]) assert.equal(cartaConfere(c, s, k), false, nome)
})

test('decifrar: só objeto do tipo mensagem com corpo de objeto simples', () => {
  const { m, a, ler } = cenario()
  const certo = objeto(a, 'mensagem', m.corpo)
  assert.equal(ler(certo).ok, true, 'controle')
  assert.deepEqual(ler({ ...certo, tipo: 'postagem' }), { ok: false, motivo: 'nao_e_mensagem' }, 'corpo de mensagem perfeito, tipo errado')
  assert.deepEqual(ler({ ...certo, corpo: null }), { ok: false, motivo: 'nao_e_mensagem' })
  assert.deepEqual(ler({ ...certo, corpo: [m.corpo] }), { ok: false, motivo: 'nao_e_mensagem' })
  assert.deepEqual(ler(null), { ok: false, motivo: 'nao_e_mensagem' })
  assert.deepEqual(ler(undefined), { ok: false, motivo: 'nao_e_mensagem' })
})

test('decifrar: sal, iv e cifrado tortos ou do tamanho errado são `forma`, cada um sozinho', () => {
  const { m, a, ler } = cenario()
  const com = (troca) => ler(objeto(a, 'mensagem', { ...m.corpo, ...troca }))
  assert.deepEqual(com({ sal: 'não é base64url' }), { ok: false, motivo: 'forma' }, 'só o sal torto')
  assert.deepEqual(com({ sal: paraB64u(randomBytes(LM.salBytes - 1)) }), { ok: false, motivo: 'forma' }, 'sal curto')
  assert.deepEqual(com({ iv: 'não é base64url' }), { ok: false, motivo: 'forma' }, 'só o iv torto')
  assert.deepEqual(com({ iv: paraB64u(randomBytes(LM.ivBytes + 1)) }), { ok: false, motivo: 'forma' }, 'iv longo')
  assert.deepEqual(com({ cifrado: 'não é base64url' }), { ok: false, motivo: 'forma' }, 'só o cifrado torto')
  assert.deepEqual(com({ cifrado: paraB64u(randomBytes(LM.etiquetaBytes)) }), { ok: false, motivo: 'forma' }, 'só a etiqueta, sem nada cifrado')
  assert.deepEqual(com({ cifrado: paraB64u(randomBytes(LM.etiquetaBytes + 1)) }), { ok: false, motivo: 'cifra' }, 'um byte além da etiqueta já é cifra (que não confere)')
})

test('o texto claro: a forma canônica exata de { assinatura, texto } completada com espaços, e nada além disso', () => {
  const c = cenario()
  const texto = 'Combinamos amanhã?'
  const claro = (v) => c.completar(Buffer.from(typeof v === 'string' ? v : canonicalizar(v), 'utf8'))
  // controle: o claro montado pelo teste do mesmo jeito que o protocolo monta é lido
  assert.deepEqual(c.ler(c.comClaro(claro({ assinatura: c.assinar(texto), texto }))), { ok: true, texto, assinatura: c.assinar(texto), dentroDasRegras: true })
  const formaDoClaro = { ok: false, motivo: 'forma_do_claro' }
  // chave a mais, chave a menos, lista, texto solto
  assert.deepEqual(c.ler(c.comClaro(claro({ assinatura: c.assinar(texto), texto, x: 1 }))), formaDoClaro, 'campo a mais')
  assert.deepEqual(c.ler(c.comClaro(claro({ texto }))), formaDoClaro, 'sem assinatura')
  assert.deepEqual(c.ler(c.comClaro(claro([c.assinar(texto), texto]))), formaDoClaro, 'lista')
  assert.deepEqual(c.ler(c.comClaro(claro('"só um texto"'))), formaDoClaro, 'texto JSON solto')
  // tipos errados dentro: assinatura número, texto número
  assert.deepEqual(c.ler(c.comClaro(claro({ assinatura: 5, texto }))), formaDoClaro, 'assinatura que não é texto')
  assert.deepEqual(c.ler(c.comClaro(claro({ assinatura: c.assinar(texto), texto: 5 }))), formaDoClaro, 'texto que não é texto')
  // JSON válido mas fora da forma canônica (chaves fora de ordem, espaço depois dos dois-pontos)
  const sig = c.assinar(texto)
  assert.deepEqual(c.ler(c.comClaro(claro(`{"texto":${JSON.stringify(texto)},"assinatura":"${sig}"}`))), formaDoClaro, 'chaves fora de ordem')
  assert.deepEqual(c.ler(c.comClaro(claro(`{"assinatura": "${sig}","texto":${JSON.stringify(texto)}}`))), formaDoClaro, 'espaço a mais')
  // não é JSON, só espaços, vazio
  assert.deepEqual(c.ler(c.comClaro(claro('isto não é JSON'))), formaDoClaro)
  assert.deepEqual(c.ler(c.comClaro(Buffer.alloc(256, 0x20))), formaDoClaro, 'só espaços')
})

test('o texto claro tem de ser UTF-8 válido: um byte solto não vira o caractere de substituição', () => {
  const c = cenario()
  // a carta é assinada para "a�b" e o claro leva o byte 0xFF no lugar do U+FFFD: um decodificador frouxo leria a mesma carta
  const texto = 'a�b'
  const valido = Buffer.from(canonicalizar({ assinatura: c.assinar(texto), texto }), 'utf8')
  assert.equal(c.ler(c.comClaro(c.completar(valido))).ok, true, 'controle: com o U+FFFD em UTF-8 de verdade, a carta confere')
  const posicao = valido.indexOf(Buffer.from('�', 'utf8'))
  const torto = Buffer.concat([valido.subarray(0, posicao), Buffer.from([0xff]), valido.subarray(posicao + 3)])
  assert.deepEqual(c.ler(c.comClaro(c.completar(torto))), { ok: false, motivo: 'forma_do_claro' })
})

test('cifraConfere: objeto sem corpo, iv torto ou cifrado ausente dá false, nunca exceção', () => {
  const { m, a } = cenario('Pode ser às 15h.')
  const certo = objeto(a, 'mensagem', m.corpo)
  const aprovado = { texto: 'Pode ser às 15h.', assinatura: m.assinatura, chaveDaMensagem: m.chaveDaMensagem }
  assert.equal(cifraConfere(certo, aprovado), true, 'controle')
  assert.equal(cifraConfere({}, aprovado), false, 'sem corpo')
  assert.equal(cifraConfere(null, aprovado), false)
  assert.equal(cifraConfere({ ...certo, corpo: { ...m.corpo, iv: 'torto' } }, aprovado), false, 'iv torto')
  assert.equal(cifraConfere({ ...certo, corpo: { ...m.corpo, cifrado: undefined } }, aprovado), false, 'sem cifrado')
  assert.equal(cifraConfere(certo, { ...aprovado, chaveDaMensagem: Buffer.alloc(5) }), false, 'chave de tamanho errado')
})
