// SPDX-License-Identifier: AGPL-3.0-or-later
// Texto livre da 0.3: menções, hashtags, links (só https, sem rastreador, sem prévia) e o filtro de dado pessoal ampliado.
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectarDadoPessoal, extrairHashtags, extrairMencoes, linksDo, problemaDoLink, validarLinks, validarMencoesETags, validarTexto } from '../../packages/protocolo/src/index.js'

const v3 = (texto, extra = {}) => validarTexto(texto, { max: 1000, multilinha: true, urls: 2, v3: true, ...extra })

// ---------- menções ----------

test('menção: @ colado a 3 a 30 caracteres de handle; pontuação final fica de fora; minúsculas; sem repetir', () => {
  assert.deepEqual(extrairMencoes('oi @pipa.rover, tudo bem?'), ['pipa.rover'])
  assert.deepEqual(extrairMencoes('oi @pipa.'), ['pipa'])
  assert.deepEqual(extrairMencoes('@Pipa e @PIPA e @pipa'), ['pipa'])
  assert.deepEqual(extrairMencoes('@a_b_c_ fim'), ['a_b_c'])
  assert.deepEqual(extrairMencoes('oi @ab'), [])
  assert.deepEqual(extrairMencoes(`oi @${'a'.repeat(31)}`), [])
  assert.deepEqual(extrairMencoes(`oi @${'a'.repeat(30)}`), ['a'.repeat(30)])
  assert.deepEqual(extrairMencoes('oi @abc'), ['abc'])
  assert.deepEqual(extrairMencoes('sem arroba nenhuma'), [])
  assert.deepEqual(extrairMencoes('@ sozinho'), [])
})

test('menção: não é menção o que está colado a letra, número, ponto, sublinhado, outro @ ou barra', () => {
  assert.deepEqual(extrairMencoes('mande para fulano@pipa.com'), [])
  assert.deepEqual(extrairMencoes('a.@pipa'), [])
  assert.deepEqual(extrairMencoes('_@pipa'), [])
  assert.deepEqual(extrairMencoes('@@pipa'), [])
  assert.deepEqual(extrairMencoes('https://x.com/@pipa'), [])
  assert.deepEqual(extrairMencoes('(@pipa)'), ['pipa'])
  assert.deepEqual(extrairMencoes('"@pipa"'), ['pipa'])
  assert.deepEqual(extrairMencoes('oi\n@pipa'), ['pipa'])
})

test('menção: no máximo 5 handles diferentes por texto', () => {
  const cinco = '@aaa @bbb @ccc @ddd @eee'
  assert.equal(validarMencoesETags(cinco), null)
  assert.match(validarMencoesETags(`${cinco} @fff`), /menções demais/)
  assert.equal(validarMencoesETags(`${cinco} @aaa @bbb`), null, 'repetir não conta de novo')
  assert.equal(v3(cinco), null)
  assert.match(v3(`${cinco} @fff`), /menções demais/)
})

// ---------- hashtags ----------

test('hashtag: # colado a 2 a 24 caracteres, minúsculas, sem repetir', () => {
  assert.deepEqual(extrairHashtags('Gostei do #Rovers e do #rovers de novo').tags, ['rovers'])
  assert.deepEqual(extrairHashtags('#a1 #12 #ab-cd').tags, ['a1', '12', 'ab-cd'])
  assert.deepEqual(extrairHashtags('#a').tags, [], 'um caractere só é texto comum')
  assert.deepEqual(extrairHashtags('#-abc').tags, [], 'não começa por hífen')
  assert.deepEqual(extrairHashtags('a#abc').tags, [], 'colado a letra não é hashtag')
  assert.deepEqual(extrairHashtags('##abc').tags, [], 'colado a outro #')
  assert.deepEqual(extrairHashtags('#ação #meu_tema').tags, [], 'fora de a-z, 0-9 e hífen é texto comum')
  assert.deepEqual(extrairHashtags(`#${'a'.repeat(24)}`).tags, ['a'.repeat(24)])
  assert.equal(extrairHashtags(`#${'a'.repeat(24)}`).longas, 0)
  assert.equal(extrairHashtags(`#${'a'.repeat(25)}`).longas, 1)
  assert.deepEqual(extrairHashtags(`#${'a'.repeat(25)}`).tags, [])
  assert.deepEqual(extrairHashtags('sem hashtag').tags, [])
})

test('hashtag: no máximo 5 por texto, e a de mais de 24 caracteres é recusada em vez de ignorada', () => {
  assert.equal(validarMencoesETags('#a1 #b2 #c3 #d4 #e5'), null)
  assert.match(validarMencoesETags('#a1 #b2 #c3 #d4 #e5 #f6'), /hashtags demais/)
  assert.equal(validarMencoesETags('#a1 #A1 #a1 #b2 #c3 #d4 #e5'), null, 'repetida não conta')
  assert.match(validarMencoesETags(`#${'a'.repeat(25)}`), /mais de 24/)
  assert.match(v3(`veja #${'a'.repeat(30)}`), /mais de 24/)
})

// ---------- links ----------

test('link: só https; qualquer outro esquema é recusado', () => {
  assert.equal(validarLinks('veja https://exemplo.com/pagina', 2), null)
  for (const esquema of ['http', 'ftp', 'ws', 'wss', 'gopher']) {
    assert.match(validarLinks(`veja ${esquema}://exemplo.com`, 2), /só aceita links https/, esquema)
  }
  assert.match(validarLinks('veja HTTP://exemplo.com', 2), /só aceita links https/)
  assert.equal(validarLinks('veja HTTPS://exemplo.com', 2), null)
  for (const perigoso of ['javascript:alert(1)', 'vbscript:x', 'data:text/html,hi', 'file:///etc/passwd', 'blob:https://x.com/1', 'JaVaScRiPt : x']) {
    assert.match(validarLinks(`clique ${perigoso}`, 2) ?? '', /perigoso/, perigoso)
  }
  assert.equal(validarLinks('Data: 05/11 e File: tal', 2), null, 'palavras comuns não são esquema')
  assert.equal(validarLinks('o valor é data:5', 2), null)
})

test('link: no máximo 200 caracteres, domínio de verdade, sem usuário, porta, IP, rede local, xn-- ou encurtador', () => {
  const longo = `https://exemplo.com/${'a'.repeat(181)}`
  assert.equal(longo.length, 201)
  assert.match(validarLinks(longo, 2), /mais de 200/)
  assert.equal(validarLinks(`https://exemplo.com/${'a'.repeat(180)}`.slice(0, 200), 2), null)
  for (const [link, trecho] of [
    ['https://user:senha@exemplo.com/', /usuário e senha/], ['https://user@exemplo.com/', /usuário e senha/],
    ['https://exemplo.com:8443/', /porta/], ['https://192.168.0.1/x', /IP/], ['https://[::1]/x', /IP/], ['https://127.0.0.1/', /IP/],
    ['https://localhost/x', /rede local/], ['https://app.local/x', /rede local/], ['https://banco.internal/x', /rede local/],
    ['https://semponto/x', /domínio inválido/], ['https://xn--exmplo-9ua.com/', /xn--/], ['https://bit.ly/abc', /encurtador/],
    ['https://www.bit.ly/abc', /encurtador/], ['https://t.co/abc', /encurtador/], ['https://tinyurl.com/x', /encurtador/],
    ['https://goo.gl/x', /encurtador/], ['https://ow.ly/x', /encurtador/], ['https://is.gd/x', /encurtador/], ['https://buff.ly/x', /encurtador/],
    ['https://rebrand.ly/x', /encurtador/], ['https://cutt.ly/x', /encurtador/], ['https://t.ly/x', /encurtador/], ['https://shorturl.at/x', /encurtador/],
    ['https://exemplo_com.br/x', /domínio inválido/], ['https://-exemplo.com/', /domínio inválido|malformado/]
  ]) {
    assert.match(problemaDoLink(link) ?? 'ok', trecho, link)
  }
  assert.equal(problemaDoLink('https://sub.exemplo.com.br/a/b?c=d#e'), null)
  assert.equal(problemaDoLink('https://exemplo.com.'), null, 'ponto final da frase não faz parte do link')
})

test('link: sem rastreador (utm_*, fbclid, gclid e outros), em qualquer posição e caixa', () => {
  for (const chave of ['utm_source', 'UTM_MEDIUM', 'utm_x', 'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_eid', 'mc_cid', 'igshid', 'yclid', '_hsenc', '_hsmi', 'ref_src', 's_cid', 'wickedid', 'vero_id']) {
    assert.match(problemaDoLink(`https://exemplo.com/a?b=1&${chave}=x`) ?? '', /rastreamento/, chave)
    assert.match(problemaDoLink(`https://exemplo.com/a?${chave}=x`) ?? '', /rastreamento/, chave)
  }
  assert.equal(problemaDoLink('https://exemplo.com/a?busca=utm&pagina=2'), null)
  assert.equal(problemaDoLink('https://exemplo.com/a?ref=amigo'), null)
})

test('link: a contagem de links por campo vale (2 em texto, 1 em recado/sobre, 0 nos demais)', () => {
  assert.equal(validarLinks('a https://a.com b https://b.com', 2), null)
  assert.match(validarLinks('a https://a.com b https://b.com c https://c.com', 2), /links demais/)
  assert.equal(validarLinks('a https://a.com', 1), null)
  assert.match(validarLinks('a https://a.com b https://b.com', 1), /links demais/)
  assert.match(validarLinks('a https://a.com', 0), /não pode ter links/)
  assert.equal(validarLinks('sem link', 0), null)
  assert.deepEqual(linksDo('x https://a.com e ftp://b.org.'), ['https://a.com', 'ftp://b.org.'])
})

test('o texto 0.3 aplica o filtro de link; o texto 0.2 continua com a regra antiga (qualquer esquema, até 2)', () => {
  assert.match(v3('veja http://exemplo.com'), /só aceita links https/)
  assert.equal(validarTexto('veja http://exemplo.com', { max: 100, urls: 2 }), null)
  assert.match(validarTexto('veja http://exemplo.com', { max: 100 }), /não pode ter links/)
  assert.equal(validarTexto('veja https://a.com?utm_source=x', { max: 100, urls: 2 }), null, 'a regra antiga não olha rastreador')
  assert.match(v3('veja https://a.com?utm_source=x'), /rastreamento/)
})

// ---------- filtro de dado pessoal ampliado ----------

test('o filtro ampliado da 0.3 pega CEP e coordenadas; o antigo não, para o que já foi aceito continuar valendo', () => {
  assert.match(v3('moro no 01310-100') ?? '', /CEP/)
  assert.match(v3('fica em -23.5505, -46.6333') ?? '', /coordenada/)
  assert.match(v3('lat 40.7128,-74.0060 pronto') ?? '', /coordenada/)
  assert.equal(detectarDadoPessoal('moro no 01310-100'), null)
  assert.equal(detectarDadoPessoal('moro no 01310-100', { ampliado: true }), 'um CEP')
  assert.equal(detectarDadoPessoal('fica em -23.5505, -46.6333', { ampliado: true }), 'uma coordenada geográfica')
  assert.equal(v3('versão 1.2.3 e 12-345 não são nada'), null)
  assert.equal(v3('pi é 3.14159 e e é 2.71828'), null, 'dois números decimais separados por " e " não são coordenada')
  assert.equal(v3('a data 2026-11-05 está certa'), null)
})

test('o filtro de dado pessoal antigo continua valendo em todo texto 0.3', () => {
  assert.match(v3('escreva para ana@exemplo.com') ?? '', /e-mail/)
  assert.match(v3('meu telefone 11 91234-5678') ?? '', /número longo/)
  assert.match(v3('veja /Users/ana/Documentos') ?? '', /caminho/)
  assert.match(v3('-----BEGIN PRIVATE KEY----- x') ?? '', /chave/)
  assert.equal(v3('texto limpo, sem nada pessoal'), null)
})

test('hashtag longa demais só conta quando é ASCII, começa por letra ou número e tem mais de 24 caracteres', () => {
  assert.equal(extrairHashtags('#a').longas, 0, 'um caractere só é texto comum, não erro')
  assert.equal(extrairHashtags('#ab').longas, 0)
  assert.equal(extrairHashtags(`#-${'a'.repeat(30)}`).longas, 0, 'começa por hífen: texto comum')
  assert.equal(extrairHashtags(`#${'a'.repeat(30)}ç`).longas, 0, 'fora do ASCII: texto comum')
  assert.equal(extrairHashtags(`#${'a'.repeat(25)} e #${'b'.repeat(26)}`).longas, 2)
  assert.equal(validarMencoesETags('#a #b #c'), null)
  assert.equal(validarMencoesETags(`#-${'a'.repeat(30)}`), null)
})

test('link: IPv6 entre colchetes é recusado como endereço IP', () => {
  assert.match(problemaDoLink('https://[2001:db8::1]/x') ?? '', /IP/)
  assert.match(problemaDoLink('https://[::ffff:127.0.0.1]/') ?? '', /IP/)
})
