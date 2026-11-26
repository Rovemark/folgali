// SPDX-License-Identifier: AGPL-3.0-or-later
// Free text in 0.3: mentions, hashtags, links (https only, no tracker, no preview) and the extended personal data filter.
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectPersonalData, extractHashtags, extractMentions, linksOf, linkProblem, validateLinks, validateMentionsAndTags, validateText } from '../../packages/protocol/src/index.js'

const v3 = (text, extra = {}) => validateText(text, { max: 1000, multilinha: true, urls: 2, v3: true, ...extra })

// ---------- mentions ----------

test('mention: @ attached to 3 to 30 handle characters; trailing punctuation is left out; lowercase; no repeats', () => {
  assert.deepEqual(extractMentions('oi @pipa.rover, tudo bem?'), ['pipa.rover'])
  assert.deepEqual(extractMentions('oi @pipa.'), ['pipa'])
  assert.deepEqual(extractMentions('@Pipa e @PIPA e @pipa'), ['pipa'])
  assert.deepEqual(extractMentions('@a_b_c_ fim'), ['a_b_c'])
  assert.deepEqual(extractMentions('oi @ab'), [])
  assert.deepEqual(extractMentions(`oi @${'a'.repeat(31)}`), [])
  assert.deepEqual(extractMentions(`oi @${'a'.repeat(30)}`), ['a'.repeat(30)])
  assert.deepEqual(extractMentions('oi @abc'), ['abc'])
  assert.deepEqual(extractMentions('sem arroba nenhuma'), [])
  assert.deepEqual(extractMentions('@ sozinho'), [])
})

test('mention: whatever is attached to a letter, number, dot, underscore, another @ or a slash is not a mention', () => {
  assert.deepEqual(extractMentions('mande para fulano@pipa.com'), [])
  assert.deepEqual(extractMentions('a.@pipa'), [])
  assert.deepEqual(extractMentions('_@pipa'), [])
  assert.deepEqual(extractMentions('@@pipa'), [])
  assert.deepEqual(extractMentions('https://x.com/@pipa'), [])
  assert.deepEqual(extractMentions('(@pipa)'), ['pipa'])
  assert.deepEqual(extractMentions('"@pipa"'), ['pipa'])
  assert.deepEqual(extractMentions('oi\n@pipa'), ['pipa'])
})

test('mention: at most 5 different handles per text', () => {
  const five = '@aaa @bbb @ccc @ddd @eee'
  assert.equal(validateMentionsAndTags(five), null)
  assert.match(validateMentionsAndTags(`${five} @fff`), /menções demais/)
  assert.equal(validateMentionsAndTags(`${five} @aaa @bbb`), null, 'repeating does not count again')
  assert.equal(v3(five), null)
  assert.match(v3(`${five} @fff`), /menções demais/)
})

// ---------- hashtags ----------

test('hashtag: # attached to 2 to 24 characters, lowercase, no repeats', () => {
  assert.deepEqual(extractHashtags('Gostei do #Rovers e do #rovers de novo').tags, ['rovers'])
  assert.deepEqual(extractHashtags('#a1 #12 #ab-cd').tags, ['a1', '12', 'ab-cd'])
  assert.deepEqual(extractHashtags('#a').tags, [], 'a single character is plain text')
  assert.deepEqual(extractHashtags('#-abc').tags, [], 'does not start with a hyphen')
  assert.deepEqual(extractHashtags('a#abc').tags, [], 'attached to a letter is not a hashtag')
  assert.deepEqual(extractHashtags('##abc').tags, [], 'attached to another #')
  assert.deepEqual(extractHashtags('#ação #meu_tema').tags, [], 'outside a-z, 0-9 and hyphen it is plain text')
  assert.deepEqual(extractHashtags(`#${'a'.repeat(24)}`).tags, ['a'.repeat(24)])
  assert.equal(extractHashtags(`#${'a'.repeat(24)}`).tooLong, 0)
  assert.equal(extractHashtags(`#${'a'.repeat(25)}`).tooLong, 1)
  assert.deepEqual(extractHashtags(`#${'a'.repeat(25)}`).tags, [])
  assert.deepEqual(extractHashtags('sem hashtag').tags, [])
})

test('hashtag: at most 5 per text, and one with more than 24 characters is refused instead of ignored', () => {
  assert.equal(validateMentionsAndTags('#a1 #b2 #c3 #d4 #e5'), null)
  assert.match(validateMentionsAndTags('#a1 #b2 #c3 #d4 #e5 #f6'), /hashtags demais/)
  assert.equal(validateMentionsAndTags('#a1 #A1 #a1 #b2 #c3 #d4 #e5'), null, 'a repeated one does not count')
  assert.match(validateMentionsAndTags(`#${'a'.repeat(25)}`), /mais de 24/)
  assert.match(v3(`veja #${'a'.repeat(30)}`), /mais de 24/)
})

// ---------- links ----------

test('link: https only; any other scheme is refused', () => {
  assert.equal(validateLinks('veja https://exemplo.com/pagina', 2), null)
  for (const schema of ['http', 'ftp', 'ws', 'wss', 'gopher']) {
    assert.match(validateLinks(`veja ${schema}://exemplo.com`, 2), /só aceita links https/, schema)
  }
  assert.match(validateLinks('veja HTTP://exemplo.com', 2), /só aceita links https/)
  assert.equal(validateLinks('veja HTTPS://exemplo.com', 2), null)
  for (const dangerous of ['javascript:alert(1)', 'vbscript:x', 'data:text/html,hi', 'file:///etc/passwd', 'blob:https://x.com/1', 'JaVaScRiPt : x']) {
    assert.match(validateLinks(`clique ${dangerous}`, 2) ?? '', /perigoso/, dangerous)
  }
  assert.equal(validateLinks('Data: 05/11 e File: tal', 2), null, 'common words are not a scheme')
  assert.equal(validateLinks('o valor é data:5', 2), null)
})

test('link: at most 200 characters, a real domain, no user, port, IP, local network, xn-- or shortener', () => {
  const long = `https://exemplo.com/${'a'.repeat(181)}`
  assert.equal(long.length, 201)
  assert.match(validateLinks(long, 2), /mais de 200/)
  assert.equal(validateLinks(`https://exemplo.com/${'a'.repeat(180)}`.slice(0, 200), 2), null)
  for (const [link, excerpt] of [
    ['https://user:senha@exemplo.com/', /usuário e senha/], ['https://user@exemplo.com/', /usuário e senha/],
    ['https://exemplo.com:8443/', /porta/], ['https://192.168.0.1/x', /IP/], ['https://[::1]/x', /IP/], ['https://127.0.0.1/', /IP/],
    ['https://localhost/x', /rede local/], ['https://app.local/x', /rede local/], ['https://banco.internal/x', /rede local/],
    ['https://semponto/x', /domínio inválido/], ['https://xn--exmplo-9ua.com/', /xn--/], ['https://bit.ly/abc', /encurtador/],
    ['https://www.bit.ly/abc', /encurtador/], ['https://t.co/abc', /encurtador/], ['https://tinyurl.com/x', /encurtador/],
    ['https://goo.gl/x', /encurtador/], ['https://ow.ly/x', /encurtador/], ['https://is.gd/x', /encurtador/], ['https://buff.ly/x', /encurtador/],
    ['https://rebrand.ly/x', /encurtador/], ['https://cutt.ly/x', /encurtador/], ['https://t.ly/x', /encurtador/], ['https://shorturl.at/x', /encurtador/],
    ['https://exemplo_com.br/x', /domínio inválido/], ['https://-exemplo.com/', /domínio inválido|malformado/]
  ]) {
    assert.match(linkProblem(link) ?? 'ok', excerpt, link)
  }
  assert.equal(linkProblem('https://sub.exemplo.com.br/a/b?c=d#e'), null)
  assert.equal(linkProblem('https://exemplo.com.'), null, 'the final period of the sentence is not part of the link')
})

test('link: no tracker (utm_*, fbclid, gclid and others), in any position and case', () => {
  for (const key of ['utm_source', 'UTM_MEDIUM', 'utm_x', 'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_eid', 'mc_cid', 'igshid', 'yclid', '_hsenc', '_hsmi', 'ref_src', 's_cid', 'wickedid', 'vero_id']) {
    assert.match(linkProblem(`https://exemplo.com/a?b=1&${key}=x`) ?? '', /rastreamento/, key)
    assert.match(linkProblem(`https://exemplo.com/a?${key}=x`) ?? '', /rastreamento/, key)
  }
  assert.equal(linkProblem('https://exemplo.com/a?busca=utm&pagina=2'), null)
  assert.equal(linkProblem('https://exemplo.com/a?ref=amigo'), null)
})

test('link: the per-field link count applies (2 in text, 1 in note/about, 0 in the others)', () => {
  assert.equal(validateLinks('a https://a.com b https://b.com', 2), null)
  assert.match(validateLinks('a https://a.com b https://b.com c https://c.com', 2), /links demais/)
  assert.equal(validateLinks('a https://a.com', 1), null)
  assert.match(validateLinks('a https://a.com b https://b.com', 1), /links demais/)
  assert.match(validateLinks('a https://a.com', 0), /não pode ter links/)
  assert.equal(validateLinks('sem link', 0), null)
  assert.deepEqual(linksOf('x https://a.com e ftp://b.org.'), ['https://a.com', 'ftp://b.org.'])
})

test('0.3 text applies the link filter; 0.2 text keeps the old rule (any scheme, up to 2)', () => {
  assert.match(v3('veja http://exemplo.com'), /só aceita links https/)
  assert.equal(validateText('veja http://exemplo.com', { max: 100, urls: 2 }), null)
  assert.match(validateText('veja http://exemplo.com', { max: 100 }), /não pode ter links/)
  assert.equal(validateText('veja https://a.com?utm_source=x', { max: 100, urls: 2 }), null, 'the old rule does not look at trackers')
  assert.match(v3('veja https://a.com?utm_source=x'), /rastreamento/)
})

// ---------- extended personal data filter ----------

test('the extended 0.3 filter catches postal codes and coordinates; the old one does not, so what was already accepted stays valid', () => {
  assert.match(v3('moro no 01310-100') ?? '', /CEP/)
  assert.match(v3('fica em -23.5505, -46.6333') ?? '', /coordenada/)
  assert.match(v3('lat 40.7128,-74.0060 pronto') ?? '', /coordenada/)
  assert.equal(detectPersonalData('moro no 01310-100'), null)
  assert.equal(detectPersonalData('moro no 01310-100', { extended: true }), 'um CEP')
  assert.equal(detectPersonalData('fica em -23.5505, -46.6333', { extended: true }), 'uma coordenada geográfica')
  assert.equal(v3('versão 1.2.3 e 12-345 não são nada'), null)
  assert.equal(v3('pi é 3.14159 e e é 2.71828'), null, 'two decimal numbers separated by " e " are not a coordinate')
  assert.equal(v3('a data 2026-11-05 está certa'), null)
})

test('the old personal data filter still applies to every 0.3 text', () => {
  assert.match(v3('escreva para ana@exemplo.com') ?? '', /e-mail/)
  assert.match(v3('meu telefone 11 91234-5678') ?? '', /número longo/)
  assert.match(v3('veja /Users/ana/Documentos') ?? '', /caminho/)
  assert.match(v3('-----BEGIN PRIVATE KEY----- x') ?? '', /chave/)
  assert.equal(v3('texto limpo, sem nada pessoal'), null)
})

test('a too-long hashtag counts only when it is ASCII, starts with a letter or digit and has more than 24 characters', () => {
  assert.equal(extractHashtags('#a').tooLong, 0, 'a single character is plain text, not an error')
  assert.equal(extractHashtags('#ab').tooLong, 0)
  assert.equal(extractHashtags(`#-${'a'.repeat(30)}`).tooLong, 0, 'starts with a hyphen: plain text')
  assert.equal(extractHashtags(`#${'a'.repeat(30)}ç`).tooLong, 0, 'outside ASCII: plain text')
  assert.equal(extractHashtags(`#${'a'.repeat(25)} e #${'b'.repeat(26)}`).tooLong, 2)
  assert.equal(validateMentionsAndTags('#a #b #c'), null)
  assert.equal(validateMentionsAndTags(`#-${'a'.repeat(30)}`), null)
})

test('link: IPv6 in brackets is refused as an IP address', () => {
  assert.match(linkProblem('https://[2001:db8::1]/x') ?? '', /IP/)
  assert.match(linkProblem('https://[::ffff:127.0.0.1]/') ?? '', /IP/)
})
