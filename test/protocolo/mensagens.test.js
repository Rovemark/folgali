// SPDX-License-Identifier: AGPL-3.0-or-later
// Mensagens privadas (revisão 0.4.0): forma dos seis tipos e a cifra (carta, X25519, HKDF, AES-256-GCM). PROTOCOLO.md seção 15.
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  DOMINIO_DA_CARTA, EXIGE_APROVACAO_DE_MENSAGEM, LIMITES, LIMITES_DE_MENSAGEM as LM, TIPOS_AUTORIZAVEIS_V3, TIPOS_DE_MENSAGEM, TIPOS_DE_OBJETO,
  TIPOS_EXIGIVEIS_V3, assinarCarta, assinaturaDoObjetoConfere, canonicalizar, cartaConfere, chaveDeCifraFraca, chavePublicaDeCifraDe,
  cifraConfere, cifrarMensagem, criarObjeto, decifrarMensagem, dominioDoObjeto, exigeAprovacao, gerarParDeCifra, gerarParDeChaves, paraB64u,
  tamanhoDeCifradoConfere, validarObjeto
} from '../../packages/protocolo/src/index.js'
import { AGORA, novoUid } from '../ajuda/mundo.js'

const id = () => `ob_${paraB64u(randomBytes(32))}`
const pessoa = () => ({ uid: novoUid(), rede: gerarParDeChaves(), cifra: gerarParDeCifra() })
const objeto = (autor, tipo, corpo, { v = '0.4', previo = null, criadoEm = AGORA } = {}) =>
  criarObjeto({ v, tipo, autor: autor.uid, criadoEm, previo, corpo, chavePrivada: autor.rede.chavePrivada })
const recusa = (o, codigo, campo) => {
  const r = validarObjeto(o)
  assert.equal(r.ok, false, `esperava recusa ${codigo}`)
  assert.equal(r.erro.codigo, codigo)
  if (campo) assert.equal(r.erro.campo, campo)
}

/** Uma mensagem de `de` para `para`, cifrada de verdade. */
function mensagem(de, para, texto = 'Oi! Combinamos amanhã?', { conversa = id(), criadoEm = AGORA, chaveDoOutro = para.cifra.chavePublica } = {}) {
  const c = cifrarMensagem({ texto, conversa, de: de.uid, para: para.uid, criadoEm, chavePrivadaDeRede: de.rede.chavePrivada, chavePrivadaDeCifra: de.cifra.chavePrivada, chavePublicaDeCifraDoOutro: chaveDoOutro })
  return { ...c, objeto: objeto(de, 'mensagem', c.corpo, { criadoEm }) }
}

test('seis tipos novos, só na 0.4, fora de TIPOS_DE_OBJETO, da política e da autorização permanente', () => {
  assert.deepEqual([...TIPOS_DE_MENSAGEM], ['chave-de-cifra', 'conversa-pedir', 'conversa-decidir', 'mensagem', 'conversa-apagar', 'mensagem-denuncia'])
  for (const t of TIPOS_DE_MENSAGEM) {
    assert.equal(TIPOS_DE_OBJETO.includes(t), false, t)
    assert.equal(TIPOS_EXIGIVEIS_V3.includes(t), false, t)
    assert.equal(TIPOS_AUTORIZAVEIS_V3.includes(t), false, t)
    assert.equal(typeof EXIGE_APROVACAO_DE_MENSAGEM[t], 'boolean', t)
  }
  // pedido, decisão e mensagem: sempre; e nem uma política vazia muda isso
  for (const t of ['conversa-pedir', 'conversa-decidir', 'mensagem']) assert.equal(exigeAprovacao(t, []), true, t)
  for (const t of ['chave-de-cifra', 'conversa-apagar', 'mensagem-denuncia']) assert.equal(exigeAprovacao(t, []), false, t)
})

test('forma: cada tipo válido passa, e a 0.4 só existe para eles (e eles só na 0.4)', () => {
  const a = pessoa()
  const b = pessoa()
  const m = mensagem(a, b)
  const validos = {
    'chave-de-cifra': { chave: a.cifra.chavePublica },
    'conversa-pedir': { alvo: b.uid, texto: 'Posso te mandar uma mensagem sobre o projeto?' },
    'conversa-decidir': { conversa: id(), decisao: 'aceitar' },
    mensagem: m.corpo,
    'conversa-apagar': { conversa: id(), mensagem: null },
    'mensagem-denuncia': { mensagem: id(), motivo: 'assedio', texto: 'qualquer coisa', assinatura: m.assinatura }
  }
  for (const [tipo, corpo] of Object.entries(validos)) {
    const o = objeto(a, tipo, corpo)
    assert.equal(validarObjeto(o).ok, true, tipo)
    assert.equal(assinaturaDoObjetoConfere(o, a.rede.chavePublica), true, tipo)
    recusa(objeto(a, tipo, corpo, { v: '0.3' }), 'esquema', 'objeto.tipo')
  }
  recusa(objeto(a, 'postagem', { texto: 'oi', topicos: [] }), 'esquema', 'objeto.tipo')
})

test('fora da cadeia: previo precisa ser null; ninguém pede conversa nem manda mensagem a si mesmo', () => {
  const a = pessoa()
  recusa(objeto(a, 'chave-de-cifra', { chave: a.cifra.chavePublica }, { previo: id() }), 'esquema', 'objeto.previo')
  recusa(objeto(a, 'conversa-pedir', { alvo: a.uid, texto: 'oi' }), 'esquema', 'objeto.corpo.alvo')
  const b = pessoa()
  const m = mensagem(a, b)
  recusa(objeto(a, 'mensagem', { ...m.corpo, para: a.uid }), 'esquema', 'objeto.corpo.para')
})

test('o prefixo de domínio leva a versão 0.4 e o tipo: assinar como 0.3 ou como outro tipo não confere', () => {
  const a = pessoa()
  assert.equal(dominioDoObjeto('0.4', 'mensagem'), 'rover-network/0.4/objeto/mensagem\n')
  assert.equal(dominioDoObjeto('0.2', 'postagem'), 'rover-network/0.2/objeto\n')
  const o = objeto(a, 'conversa-decidir', { conversa: id(), decisao: 'recusar' })
  assert.equal(assinaturaDoObjetoConfere({ ...o, tipo: 'conversa-apagar' }, a.rede.chavePublica), false)
  assert.equal(assinaturaDoObjetoConfere({ ...o, v: '0.3' }, a.rede.chavePublica), false)
})

test('pedido de conversa: até 280 caracteres, sem link, com o filtro de dado pessoal', () => {
  const a = pessoa()
  const b = pessoa()
  const pedido = (texto) => objeto(a, 'conversa-pedir', { alvo: b.uid, texto })
  const frase = (n) => 'oi, tudo bem por aí? '.repeat(20).slice(0, n - 1) + 'x'
  assert.equal(validarObjeto(pedido(frase(LM.pedido.max))).ok, true)
  recusa(pedido(frase(LM.pedido.max + 1)), 'esquema', 'objeto.corpo.texto')
  recusa(pedido('veja https://exemplo.com.br/agenda'), 'esquema', 'objeto.corpo.texto')
  recusa(pedido('me escreve em ana@exemplo.com'), 'esquema', 'objeto.corpo.texto')
  recusa(pedido(''), 'esquema', 'objeto.corpo.texto')
})

test('tamanho do cifrado: 16 bytes de etiqueta mais múltiplo de 256, de 256 a 8192', () => {
  const b64 = (n) => paraB64u(randomBytes(n))
  assert.equal(tamanhoDeCifradoConfere(b64(16 + 256)), true)
  assert.equal(tamanhoDeCifradoConfere(b64(16 + 8192)), true)
  assert.equal(tamanhoDeCifradoConfere(b64(16 + 255)), false)
  assert.equal(tamanhoDeCifradoConfere(b64(16 + 512 + 1)), false)
  assert.equal(tamanhoDeCifradoConfere(b64(16 + 8192 + 256)), false)
  assert.equal(tamanhoDeCifradoConfere(`${b64(16 + 256)}=`), false)
  for (const torto of [123, null, undefined, {}, ['x']]) assert.equal(tamanhoDeCifradoConfere(torto), false, String(torto))
  const a = pessoa()
  const m = mensagem(a, pessoa())
  recusa(objeto(a, 'mensagem', { ...m.corpo, cifrado: b64(16 + 300) }), 'esquema', 'objeto.corpo.cifrado')
  recusa(objeto(a, 'mensagem', { ...m.corpo, iv: b64(16) }), 'esquema', 'objeto.corpo.iv')
  recusa(objeto(a, 'mensagem', { ...m.corpo, sal: b64(16) }), 'esquema', 'objeto.corpo.sal')
  recusa(objeto(a, 'mensagem', { ...m.corpo, chavePara: b64(31) }), 'esquema', 'objeto.corpo.chavePara')
})

test('a maior mensagem possível (2000 caracteres de 4 bytes) cabe no objeto e no teto do cifrado', () => {
  const a = pessoa()
  const b = pessoa()
  const texto = '🙂'.repeat(LM.texto.max)
  const m = mensagem(a, b, texto)
  assert.equal(validarObjeto(m.objeto).ok, true)
  assert.ok(Buffer.byteLength(canonicalizar(m.objeto)) <= LIMITES.objetoBytes, `${Buffer.byteLength(canonicalizar(m.objeto))} bytes`)
  assert.throws(() => mensagem(a, b, '🙂'.repeat(LM.texto.max + 1)), (e) => e.codigo === 'esquema' && e.campo === 'texto')
  // o texto revelado numa denúncia não passa pelo filtro, só pelo teto de bytes
  const den = (t) => objeto(b, 'mensagem-denuncia', { mensagem: m.objeto.id, motivo: 'golpe', texto: t, assinatura: m.assinatura })
  assert.equal(validarObjeto(den('manda o pix para ana@exemplo.com <b>agora</b>')).ok, true)
  assert.equal(validarObjeto(den('a'.repeat(LM.reveladoMaxBytes))).ok, true)
  recusa(den('a'.repeat(LM.reveladoMaxBytes + 1)), 'esquema', 'objeto.corpo.texto')
})

test('caminho feliz: quem recebeu e quem enviou decifram, a carta confere com a chave de rede de quem enviou', () => {
  const a = pessoa()
  const b = pessoa()
  const m = mensagem(a, b, 'Linha 1\nLinha 2 com acentuação: ação, café.')
  const doB = decifrarMensagem(m.objeto, { chavePrivadaDeCifra: b.cifra.chavePrivada, chavePublicaDeRedeDoRemetente: a.rede.chavePublica })
  const doA = decifrarMensagem(m.objeto, { chavePrivadaDeCifra: a.cifra.chavePrivada, chavePublicaDeRedeDoRemetente: a.rede.chavePublica })
  assert.deepEqual([doB.ok, doA.ok], [true, true])
  assert.equal(doB.texto, 'Linha 1\nLinha 2 com acentuação: ação, café.')
  assert.equal(doB.assinatura, m.assinatura)
  assert.equal(doB.dentroDasRegras, true)
  const carta = { conversa: m.corpo.conversa, criadoEm: AGORA, de: a.uid, iv: m.corpo.iv, para: b.uid, texto: doB.texto }
  assert.equal(cartaConfere(carta, doB.assinatura, a.rede.chavePublica), true)
  assert.equal(DOMINIO_DA_CARTA, 'rover-network/0.4/carta\n')
})

test('um terceiro não decifra; o texto claro tem faixa de 256 bytes (o tamanho exato não aparece)', () => {
  const a = pessoa()
  const b = pessoa()
  const m = mensagem(a, b)
  const intruso = gerarParDeCifra()
  assert.deepEqual(decifrarMensagem(m.objeto, { chavePrivadaDeCifra: intruso.chavePrivada, chavePublicaDeRedeDoRemetente: a.rede.chavePublica }), { ok: false, motivo: 'outra_chave' })
  const curta = mensagem(a, b, 'a')
  const media = mensagem(a, b, 'bom dia '.repeat(15).trim())
  assert.equal(curta.corpo.cifrado.length, media.corpo.cifrado.length)
  assert.notEqual(mensagem(a, b, 'bom dia '.repeat(30).trim()).corpo.cifrado.length, curta.corpo.cifrado.length)
})

test('mensagem adulterada: um byte do cifrado, o contexto (conversa) ou a etiqueta mexidos, e nada é decifrado', () => {
  const a = pessoa()
  const b = pessoa()
  const m = mensagem(a, b)
  const ler = (o) => decifrarMensagem(o, { chavePrivadaDeCifra: b.cifra.chavePrivada, chavePublicaDeRedeDoRemetente: a.rede.chavePublica })
  const bytes = Buffer.from(m.corpo.cifrado, 'base64url')
  bytes[10] ^= 1
  assert.deepEqual(ler({ ...m.objeto, corpo: { ...m.corpo, cifrado: paraB64u(bytes) } }), { ok: false, motivo: 'cifra' })
  // o mesmo cifrado movido para outra conversa (mesmo que o autor reassine o objeto) não decifra: o contexto é dado autenticado
  const movida = objeto(a, 'mensagem', { ...m.corpo, conversa: id() })
  assert.deepEqual(ler(movida), { ok: false, motivo: 'cifra' })
  assert.deepEqual(ler({ ...m.objeto, criadoEm: AGORA + 1 }), { ok: false, motivo: 'cifra' })
})

test('cifra trocada: cifrado para outra chave e anunciado como se fosse para a do destinatário', () => {
  const a = pessoa()
  const b = pessoa()
  const outra = gerarParDeCifra()
  // `a` cifra com a chave de outro, mas o corpo diz chavePara = chave de `b`
  const errada = mensagem(a, b, 'oi', { chaveDoOutro: outra.chavePublica })
  const forjado = objeto(a, 'mensagem', { ...errada.corpo, chavePara: b.cifra.chavePublica })
  assert.deepEqual(decifrarMensagem(forjado, { chavePrivadaDeCifra: b.cifra.chavePrivada, chavePublicaDeRedeDoRemetente: a.rede.chavePublica }), { ok: false, motivo: 'cifra' })
})

test('carta de outro: um texto cifrado certo, mas assinado com uma chave de rede que não é a do remetente', () => {
  const a = pessoa()
  const b = pessoa()
  const impostor = gerarParDeChaves()
  const conversa = id()
  const m = cifrarMensagem({ texto: 'sou eu', conversa, de: a.uid, para: b.uid, criadoEm: AGORA, chavePrivadaDeRede: impostor.chavePrivada, chavePrivadaDeCifra: a.cifra.chavePrivada, chavePublicaDeCifraDoOutro: b.cifra.chavePublica })
  const o = objeto(a, 'mensagem', m.corpo)
  assert.deepEqual(decifrarMensagem(o, { chavePrivadaDeCifra: b.cifra.chavePrivada, chavePublicaDeRedeDoRemetente: a.rede.chavePublica }), { ok: false, motivo: 'carta' })
})

test('a carta não muda de mensagem: outro iv, outra conversa, outra ponta ou outro texto não conferem', () => {
  const a = pessoa()
  const carta = { conversa: id(), criadoEm: AGORA, de: a.uid, iv: paraB64u(randomBytes(12)), para: novoUid(), texto: 'oi' }
  const sig = assinarCarta(carta, a.rede.chavePrivada)
  assert.equal(cartaConfere(carta, sig, a.rede.chavePublica), true)
  for (const mexe of [{ iv: paraB64u(randomBytes(12)) }, { conversa: id() }, { para: novoUid() }, { texto: 'oi!' }, { criadoEm: AGORA + 1 }]) {
    assert.equal(cartaConfere({ ...carta, ...mexe }, sig, a.rede.chavePublica), false, Object.keys(mexe)[0])
  }
  assert.equal(cartaConfere(carta, 'x'.repeat(86), a.rede.chavePublica), false)
})

test('as regras de texto valem ANTES de cifrar: e-mail, HTML e link http não saem do cliente', () => {
  const a = pessoa()
  const b = pessoa()
  for (const t of ['me chama em ana@exemplo.com', '<script>x</script>', 'http://exemplo.com.br', '']) {
    assert.throws(() => mensagem(a, b, t), (e) => e.codigo === 'esquema' && e.campo === 'texto', t)
  }
  assert.ok(mensagem(a, b, 'veja https://exemplo.com.br/agenda').corpo)
})

test('cifraConfere: o app da pessoa refaz a cifra com a chave da mensagem e confere o texto que aprova', () => {
  const a = pessoa()
  const b = pessoa()
  const m = mensagem(a, b, 'Pode ser às 15h.')
  assert.equal(cifraConfere(m.objeto, { texto: 'Pode ser às 15h.', assinatura: m.assinatura, chaveDaMensagem: m.chaveDaMensagem }), true)
  assert.equal(cifraConfere(m.objeto, { texto: 'Pode ser às 16h.', assinatura: m.assinatura, chaveDaMensagem: m.chaveDaMensagem }), false)
  assert.equal(cifraConfere(m.objeto, { texto: 'Pode ser às 15h.', assinatura: m.assinatura, chaveDaMensagem: randomBytes(32) }), false)
})

test('chave de cifra fraca: zero e pontos de ordem pequena são recusados; uma chave comum passa', () => {
  assert.equal(chaveDeCifraFraca(paraB64u(Buffer.alloc(32))), true)
  const um = Buffer.alloc(32)
  um[0] = 1
  assert.equal(chaveDeCifraFraca(paraB64u(um)), true)
  assert.equal(chaveDeCifraFraca('curta'), true)
  assert.equal(chaveDeCifraFraca(gerarParDeCifra().chavePublica), false)
  const par = gerarParDeCifra()
  assert.equal(chavePublicaDeCifraDe(par.chavePrivada), par.chavePublica)
})
