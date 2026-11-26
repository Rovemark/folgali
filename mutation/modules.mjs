// SPDX-License-Identifier: AGPL-3.0-or-later
// Which modules the mutation run covers, which test suite belongs to each, and which survivors are equivalent.
// Equivalent = a defect that no test can tell apart from the original, with the REASON written down. A short, honest list:
// every other survivor is a test hole and gets fixed in the test.
const P = 'packages/protocol/src'
const T = 'test/protocol'
const R = 'packages/relay/src'
const TR = 'test/relay'
// 0.6.0: the open issuer, a separate service
const E = 'packages/open-issuer/src'
const TE = 'test/issuer'
// The 0.3 modules run the suite one file at a time, in the given order, and stop at the first that fails (`sequencial`): a defect
// that dies early costs little, and one that survives goes through all of them, the same verdict as running everything together.
const RELAY_SOCIALS = ['base', 'relay', 'write', 'read', 'profile', 'friendship', 'community', 'forum', 'pages', 'moderation', 'search', 'notifications', 'abuse', 'compat', 'revision', 'revision-http', 'http'].map((n) => `${TR}/social-${n}.test.js`)
const order = (...first) => [...first.map((n) => `${TR}/social-${n}.test.js`), ...RELAY_SOCIALS.filter((t) => !first.some((n) => t.endsWith(`social-${n}.test.js`)))]

export const MODULES = [
  {
    rotulo: 'protocol/canonical',
    alvos: [{ arquivo: `${P}/canonical.js` }],
    testes: [`${T}/canonical.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocol/keys',
    alvos: [{ arquivo: `${P}/keys.js` }],
    testes: [`${T}/keys.test.js`, `${T}/social-schemas.test.js`],
    equivalentes: new Map([
      [P + '/keys.js:const MENSAGENS_DE_SONDA = Array.from({ length: 128 }, (_, i) => Buffer.from(`sonda-chave-fraca-${i}`))|128->129@48',
        'the number of probes only changes the chance of a false negative (under 1 in 10^7), so there is no observable behavior to test'],
      [P + '/keys.js:const MENSAGENS_DE_SONDA = Array.from({ length: 128 }, (_, i) => Buffer.from(`sonda-chave-fraca-${i}`))|128->127@48',
        'same: 127 probes give the same answer; the statistical margin is the same order of magnitude']
    ])
  },
  {
    rotulo: 'protocol/text',
    alvos: [{ arquivo: `${P}/text.js` }, { arquivo: `${P}/pii.js` }],
    testes: [`${T}/text.test.js`, `${T}/social-text.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocol/objects',
    alvos: [{ arquivo: `${P}/objects.js` }, { arquivo: `${P}/schema.js` }],
    testes: [`${T}/objects.test.js`, `${T}/old-bodies.test.js`, `${T}/social-schemas.test.js`, `${T}/declarations.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocol/declarations',
    alvos: [{ arquivo: `${P}/declarations.js` }, { arquivo: `${P}/policy.js` }, { arquivo: `${P}/read.js` }],
    testes: [`${T}/declarations.test.js`, `${T}/social-declarations.test.js`, `${T}/policy.test.js`, `${T}/read.test.js`, `${T}/agents.test.js`],
    equivalentes: new Map()
  },
  // ---------- 0.6.0 (proposal 0008): folgali ----------
  {
    rotulo: 'protocol/agents',
    alvos: [{ arquivo: `${P}/agents.js` }, { arquivo: `${P}/limits.js`, desde: '// ---------- 0.6.0: folgali', ate: 'export const OWNER_ACTIONS' }],
    testes: [`${T}/agents.test.js`, `${TE}/issuer.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'issuer/issuer',
    alvos: [{ arquivo: `${E}/issuer.js` }, { arquivo: `${P}/origin.js` }],
    testes: [`${TE}/origin.test.js`, `${TE}/edges.test.js`, `${TE}/issuer.test.js`, `${TE}/http.test.js`, `${TE}/integration.test.js`, 'test/client/agent.test.js'],
    equivalentes: new Map([
      [E + '/issuer.js:' + "const lista = (this._origins.get(origem) ?? []).filter((t) => t > agora - 86400)" + '|>->>=@67',
        "the stored list is filtered again, with `>`, in _originWait; an instant at exactly 1 day that is kept one extra time is never counted"],
      [E + '/issuer.js:' + "_newCode() { return `${PALAVRAS_DO_CODIGO[randomInt(PALAVRAS_DO_CODIGO.length)]}-${String(randomInt(10000)).padStart(4, '0')}` }" + '|10000->10001@105',
        "a draw from 0 to 10000 differs from 0 to 9999 only with a chance of 1 in 10001 per registration; the code is still accepted by the format in every other case"],
      [E + '/issuer.js:' + "_newCode() { return `${PALAVRAS_DO_CODIGO[randomInt(PALAVRAS_DO_CODIGO.length)]}-${String(randomInt(10000)).padStart(4, '0')}` }" + '|10000->9999@105',
        "same: dropping 9999 from the draw cannot be observed in a deterministic test"],
      [E + '/issuer.js:' + "this._execute('UPDATE agentes SET atestado = :atestado WHERE uid = :uid', { uid: a.uid, atestado: JSON.stringify(this._attestation(a, Math.max(agora, atestado.emitidoEm + 1))) })" + '|1->2@175',
        "renewal only happens days after issuing, so Math.max(agora, emitidoEm + 1) is always `agora`, with +1 or +2"],
      [E + '/issuer.js:' + "this._execute('UPDATE agentes SET atestado = :atestado WHERE uid = :uid', { uid: a.uid, atestado: JSON.stringify(this._attestation(a, Math.max(agora, atestado.emitidoEm + 1))) })" + '|1->0@175',
        "same: with +0 the maximum is still `agora`"],
      [E + '/issuer.js:' + "this._execute('UPDATE agentes SET atestado = :atestado WHERE uid = :uid', { uid: a.uid, atestado: JSON.stringify(this._attestation(a, Math.max(agora, atestado.emitidoEm + 1))) })" + '|+->-@172',
        "same: emitidoEm - 1 is even smaller than `agora`"],
      [E + '/issuer.js:' + "const a = typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? this._one(\"SELECT * FROM agentes WHERE token_hash = :h AND situacao = 'aguardando-dono'\", { h: sha256(token) }) : null" + '|&&->||@40',
        "the secret always arrives as text (it comes from the route); with `||`, a text outside the format only looks up its hash in the database, which never exists, and the answer is the same"],
      [E + '/issuer.js:' + "const a = typeof uid === 'string' && UID_RE.test(uid) ? this._one(`SELECT * FROM agentes WHERE uid = :uid AND ${ATIVOS}`, { uid }) : null" + '|&&->||@38',
        "same for the uid: a text outside the format looks up a uid that does not exist, and the answer is the same"]
,
      [E + '/issuer.js:' + "if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo) || Object.keys(corpo).join(',') !== nome) {" + '|||->&&@50',
        "a string or a list that gets past this part of the guard falls into the last one (the keys of a string or a list are never exactly the requested name), with the same answer"],
      [E + '/issuer.js:' + "this._approvalSecret = Buffer.from(hkdfSync('sha256', segredo, Buffer.alloc(0), 'rover-network/0.6/emissor-aberto/aprovacao', 32))" + '|0->1@84',
        "HKDF (RFC 5869) uses the salt as the HMAC key, which pads the key with zeros up to the block size: an empty salt and a one-byte zero salt give the same result (the test's fixed vector checks it)"],
      [E + '/issuer.js:' + "this._ownerSecret = Buffer.from(hkdfSync('sha256', segredo, Buffer.alloc(0), 'rover-network/0.6/emissor-aberto/dono', 32))" + '|0->1@79',
        "same for the owners' HMAC"],
      [E + '/issuer.js:' + "const antes = (this._origins.get(origem) ?? []).filter((t) => t > agora - 86400)" + '|>->>=@67',
        "a registration that is exactly one day old would give a wait of 0 seconds, and a wait of 0 lets it through: counting it or not gives the same answer"],
      [E + '/issuer.js:' + "const antes = (this._origins.get(origem) ?? []).filter((t) => t > agora - 86400)" + '|86400->86401@78',
        "same: the extra registration that the 86401 window sees is exactly one day old, and the wait computed from it is 0"],
      [E + '/issuer.js:' + "const naHora = antes.filter((t) => t > agora - 3600)" + '|>->>=@40',
        "same for the hour: a registration exactly one hour old would give a wait of 0, and a wait of 0 lets it through"],
      [E + '/issuer.js:' + "const naHora = antes.filter((t) => t > agora - 3600)" + '|3600->3601@51',
        "same: the 3601 window only sees one extra registration, the one exactly an hour old, which gives a wait of 0"],
      [E + '/issuer.js:' + "const lista = (this._origins.get(origem) ?? []).filter((t) => t > agora - 86400)" + '|86400->86401@78',
        "the stored list is filtered again, with 86400, at check time: keeping one registration that is exactly one day old for longer changes no calculation"]
    ])
  },  {
    rotulo: 'issuer/service',
    alvos: [{ arquivo: `${E}/http.js` }, { arquivo: `${E}/configuration.js` }, { arquivo: `${E}/backup.js` }, { arquivo: `${E}/relay.js` }],
    testes: [`${TE}/http.test.js`, `${TE}/service.test.js`, `${TE}/edges.test.js`, `${TE}/integration.test.js`],
    equivalentes: new Map()
  },

  {
    rotulo: 'protocol/links',
    alvos: [{ arquivo: `${P}/links.js` }],
    testes: [`${T}/social-text.test.js`, `${T}/social-schemas.test.js`],
    equivalentes: new Map([
      [P + "/links.js:if (IPV4.test(host) || host.includes(':') || host.startsWith('[')) return 'tem um link para endereço IP'|||->&&@44",
        'the hostname of an IPv6 address comes from `new URL` always in brackets and with colons, so both conditions are true together; `||` and `&&` give the same result for any host the URL accepts']
    ])
  },
  {
    rotulo: 'protocol/mentions',
    alvos: [{ arquivo: `${P}/mentions.js` }],
    testes: [`${T}/social-text.test.js`],
    equivalentes: new Map([
      [P + '/mentions.js:else if (SO_ASCII_DE_TAG.test(corrida) && /^[A-Za-z0-9]/.test(corrida) && corrida.length > 24) longas++|24->23@95',
        'this branch only runs when the run is NOT a valid tag; an ASCII run that starts with a letter or digit, has 24 characters and is not a valid tag does not exist (24 characters like that always match TAG_VALIDA), so 23 and 24 behave the same'],
      [P + '/mentions.js:else if (SO_ASCII_DE_TAG.test(corrida) && /^[A-Za-z0-9]/.test(corrida) && corrida.length > 24) longas++|>->>=@92',
        'same: with 24 characters the branch is never reached, so `> 24` and `>= 24` give the same result']
    ])
  },
  {
    rotulo: 'protocol/social-bodies',
    alvos: [{ arquivo: `${P}/social-bodies.js` }],
    testes: [`${T}/social-schemas.test.js`, `${T}/social-declarations.test.js`, `${T}/objects.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocol/limits',
    alvos: [
      { arquivo: `${P}/limits.js`, desde: 'export function ageFactor', ate: 'export const capWithFactor' },
      { arquivo: `${P}/limits.js`, desde: 'export function typeExistsInVersion', ate: '}' },
      { arquivo: `${P}/limits.js`, desde: 'export function requirableTypesOf', ate: '}' },
      { arquivo: `${P}/limits.js`, desde: 'export function authorizableTypesOf', ate: '}' }
    ],
    testes: [`${T}/social-declarations.test.js`, `${T}/social-schemas.test.js`, 'test/relay/social-abuse.test.js'],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocol/attestations',
    alvos: [{ arquivo: `${P}/attestations.js` }],
    testes: [`${T}/attestations.test.js`],
    equivalentes: new Map([
      [P + '/attestations.js:return erro(\'atestado_invalido\', { campo: \'atestado.expiraEm\', detalhe: `A validade precisa ser positiva e de no máximo ${Math.floor(validadeMax / 86400)} dias.` })|86400->86399@151',
        'it only changes the message text, and dividing by 86399 instead of 86400 gives the same floor in days for any realistic validity']
    ])
  },
  {
    rotulo: 'relay/relay',
    alvos: [{ arquivo: `${R}/relay.js` }],
    testes: [`${TR}/social-revision.test.js`, `${TR}/social-revision-http.test.js`, `${TR}/social-relay.test.js`, `${TR}/accept.test.js`, `${TR}/read.test.js`, `${TR}/moderation.test.js`, `${TR}/rate.test.js`, `${TR}/edges.test.js`, `${TR}/declarations.test.js`, `${TR}/authorization.test.js`, `${TR}/requirement.test.js`, ...order('compat', 'abuse'), `${TR}/graph.test.js`, `${TR}/issuer-revoked.test.js`, `${TE}/issuer.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + '/relay.js:if (this._revocationsVersion === this.provedor.versao) return|guarda-desligada',
        'rereading the revoked list on every request gives the same result (the swap is idempotent); the guard only avoids repeated work'],
      [R + '/relay.js:const linhas = this.armazem.todos(sql, { ...params, limite: limite + 1 })|1->2@73',
        'fetching one extra row still tells whether there is a next page; the returned page and the cursor do not change'],
      [R + '/relay.js:const fator = this.semFatorDeIdade || SEM_FATOR_DE_IDADE.includes(obj.tipo) ? 1 : fatorDeIdade(guardado ? agora - guardado.criado_em : 0)|0->1@139',
        'a rover with no earlier record (stored is null) has an age of 0 or 1 second: both fall in the same factor band (under 1 day)']
    ])
  },
  {
    // Only the part of the operator option `semFatorDeIdade` (the constructor and the factor line in `_checkRate`). The rest of the file
    // is measured in `relay/relay`.
    rotulo: 'relay/without-age-factor',
    alvos: [
      { arquivo: `${R}/relay.js`, desde: 'this.semFatorDeIdade = semFatorDeIdade === true', ate: 'this.rates = {' },
      { arquivo: `${R}/relay.js`, desde: 'const fator = this.semFatorDeIdade', ate: '(o fator só entra onde' }
    ],
    // the parameter default lives on the constructor line, which has other parameters measured in `relay/relay`: a hand-planted defect
    extras: [['padrao-ligado', `${R}/relay.js`, 'semFatorDeIdade = false }) {', 'semFatorDeIdade = true }) {']],
    testes: [`${TR}/without-age-factor.test.js`, `${TR}/rate.test.js`, `${TR}/social-abuse.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + '/relay.js:const fator = this.semFatorDeIdade || SEM_FATOR_DE_IDADE.includes(obj.tipo) ? 1 : fatorDeIdade(guardado ? agora - guardado.criado_em : 0)|0->1@139',
        'a rover with no earlier record (stored is null) has an age of 0 or 1 second: both fall in the same factor band (under 1 day)']
    ])
  },
  {
    // The validation of the RELAY_WITHOUT_AGE_FACTOR variable in the hosted relay binary (fails closed) and passing it on to the relay.
    rotulo: 'relay/hosted-factor',
    alvos: [{ arquivo: 'packages/relay/bin/hosted-relay.js', desde: "if (!['', undefined, 'sim', 'nao']", ate: 'const withoutAgeFactor = env' }],
    testes: [`${TR}/hosted.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/store',
    alvos: [{ arquivo: `${R}/store.js` }, { arquivo: `${R}/rate-limit.js` }, { arquivo: `${R}/provider.js` }],
    testes: [`${TR}/accept.test.js`, `${TR}/read.test.js`, `${TR}/moderation.test.js`, `${TR}/rate.test.js`, `${TR}/edges.test.js`, `${TR}/provider.test.js`, `${TR}/declarations.test.js`, `${TR}/authorization.test.js`, `${TR}/requirement.test.js`, `${TR}/migration.test.js`, ...order('compat'), `${TR}/graph.test.js`, `${TR}/issuer-revoked.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + '/provider.js:this._version = 1|1->2@19', 'the initial value of the version is arbitrary; what matters is that it changes on every change, and that is tested'],
      [R + '/provider.js:this._version = 1|1->0@19', 'same']
    ])
  },
  {
    // The issuers' revoked list read by the hosted relay (docs/RELAY-OPERATIONS.md, section 15).
    rotulo: 'relay/issuer-revoked',
    alvos: [{ arquivo: `${R}/issuer-revoked.js` }],
    testes: [`${TR}/issuer-revoked.test.js`],
    equivalentes: new Map([
      [R + '/issuer-revoked.js:if (terminado) return|guarda-desligada',
        'the promise settles only once: a second call to finish (or the end of the body after an error) does not change the result; repeated clearTimeout and destroy have no effect'],
      [R + '/issuer-revoked.js:terminado = true|true->false@18',
        'same: after the first outcome, a second resolve or reject of the same promise is ignored by JavaScript itself'],
      [R + '/issuer-revoked.js:const status = res.statusCode ?? 0|0->1@39',
        'the Node https client always fills statusCode in a response; the fallback value is never used'],
      [R + '/issuer-revoked.js:this._version = 1|1->2@19', 'the initial value of the version is arbitrary; what matters is that it changes on every change, and that is tested'],
      [R + '/issuer-revoked.js:this._version = 1|1->0@19', 'same'],
      [R + '/issuer-revoked.js:if (lista.geradoEm > p.ate) p.ate = lista.geradoEm|>->>=@24',
        'with geradoEm equal to ate the assignment writes the same number'],
      [R + '/issuer-revoked.js:try { rmSync(temporario, { force: true }) } catch { /* nada a limpar */ }|true->false@40',
        'without force, deleting a temporary file that does not exist throws, and the catch on the same line swallows it: the result is the same']
    ])
  },
  {
    // What the remembered revocation (`ate`) and the revoked party's read credential changed outside the new module: the store query,
    // visibility, the read refusal, the own-profile route, the /v1/info field and the admin route.
    rotulo: 'relay/revoked-in-relay',
    alvos: [
      { arquivo: `${R}/store.js`, desde: 'AND NOT EXISTS (SELECT 1 FROM revogacoes v', ate: '// O grafo de seguir de um rover é público' },
      { arquivo: `${R}/store.js`, desde: '  revogado(emissor, uid, emitidoEm) {', ate: '  replaceRevocations(list) {' },
      { arquivo: `${R}/store.js`, desde: '  replaceRevocations(list) {', ate: 'INSERT OR IGNORE INTO revogacoes' },
      { arquivo: `${R}/relay.js`, desde: '  _refuseRevokedRead(credential, now) {', ate: "throw new ErroDoProtocolo('atestado_revogado')" },
      { arquivo: `${R}/relay.js`, desde: "...(typeof this.provedor.estadoDosRevogados === 'function'", ate: 'limites: {' },
      { arquivo: `${R}/social-read.js`, desde: '  requireOwn(uid, credential, now) {', ate: "if (l !== uid) throw new ErroDoProtocolo('sem_permissao')" },
      { arquivo: `${R}/http.js`, desde: "...(typeof rele.provedor.limpar === 'function'", ate: '}]] : []),' }
    ],
    testes: [`${TR}/issuer-revoked.test.js`, `${TR}/accept.test.js`, `${TR}/read.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + "/http.js:const chaves = corpo !== null && typeof corpo === 'object' && !Array.isArray(corpo) ? Object.keys(corpo).sort().join(',') : ''|&&->||@65",
        'for a body that is not an object (string, number, boolean, list) Object.keys returns indexes or nothing, and none of those matches "tudo" or "emissor,uid": the refusal is the same']
    ])
  },
  {
    rotulo: 'relay/social-base',
    alvos: [{ arquivo: `${R}/social-base.js` }],
    testes: order('base', 'community', 'abuse'),
    sequential: true,
    equivalentes: new Map([
      [R + '/social-base.js:export const parDe = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)|<-><=@33',
        'a = b only happens in a pair of a rover with itself, which the schema refuses; with a different from b both operators pick the same side']
    ])
  },
  {
    rotulo: 'relay/social-notifications',
    alvos: [{ arquivo: `${R}/social-notifications.js` }],
    testes: order('revision', 'notifications', 'abuse'),
    sequential: true,
    equivalentes: new Map([
      [R + '/social-notifications.js:{ uid, antes, limite: limite + 1 }|1->2@37',
        'fetching one extra row still tells whether there is a next page (more than `limite` rows): the returned page and the cursor do not change']
    ])
  },
  {
    rotulo: 'relay/social-index',
    alvos: [{ arquivo: `${R}/social-index.js` }],
    testes: order('search', 'forum'),
    sequential: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/social-write',
    alvos: [{ arquivo: `${R}/social-write.js` }],
    testes: order('revision', 'write', 'profile', 'friendship', 'community', 'forum', 'pages'),
    sequential: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/social-moderation',
    alvos: [{ arquivo: `${R}/social-moderation.js` }],
    testes: order('moderation', 'community'),
    sequential: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/social-search',
    alvos: [{ arquivo: `${R}/social-search.js` }],
    testes: order('revision', 'search', 'abuse'),
    sequential: true,
    equivalentes: new Map([
      [R + '/social-search.js:const base = { m: consulta, limite: limite + 1, desloc: deslocamento }|1->2@49',
        'fetching one extra row still tells whether there is a next page (more than `limite` rows): the returned page and the cursor do not change']
    ])
  },
  {
    rotulo: 'relay/social-read',
    alvos: [{ arquivo: `${R}/social-read.js` }],
    testes: [...order('revision', 'revision-http', 'read', 'profile', 'community', 'forum', 'friendship', 'pages', 'moderation', 'abuse', 'notifications', 'http'), `${TR}/issuer-revoked.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + '/social-read.js:const linhas = this.a.todos(sql, { ...params, limite: limite + 1 })|1->2@67',
        'fetching one extra row still tells whether there is a next page (more than `limite` rows): the returned page and the cursor do not change'],
      [R + '/social-read.js:const linhas = this.a.todos(`${sql} LIMIT :limite OFFSET :desloc`, { ...params, limite: limite + 1, desloc })|1->2@101',
        'fetching one extra row still tells whether there is a next page (more than `limite` rows): the returned page and the cursor do not change'],
      [R + '/social-read.js:if (leitor === null || leitor === undefined) return null|guarda-desligada',
        'with no reader the next query (a reaction with a null author) also returns null: the guard only saves one database query'],
      [R + '/social-read.js:if (leitor === null || leitor === undefined) return null|||->&&@24',
        'with `&&` the guard never fires and the query with a null author returns the same null: no test can tell (the guard only saves the query)']
    ])
  },
  {
    rotulo: 'relay/http',
    alvos: [{ arquivo: `${R}/http.js` }],
    testes: [`${TR}/social-revision-http.test.js`, `${TR}/social-http.test.js`, `${TR}/http.test.js`, `${TR}/http-edges.test.js`, `${TR}/http-graph.test.js`, `${TR}/issuer-revoked.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + '/http.js:' + "['GET', new RegExp(`^/v1/rovers/${u}/notificacoes/contagem$`), '/v1/rovers/:uid/notificacoes/contagem', (req, m, q) => [200, s.contagemDeNotificacoes(m[1], { desde: numero(q, 'desde', 0), credencial: cred(req) })]]," + '|0->1@190',
        'the default of `desde` in the notice count is 0 or 1: no notice is born at second 0 or 1 of the epoch, so both counts are equal']
    ])
  },
  // 0.8.0 (proposal 0010): the five post reactions and the reaction switch. Only the reaction code of relay.js and social-read.js
  // (the whole of relay.js is relay/relay); the schema line is in protocol/social-bodies
  {
    rotulo: 'relay/reactions',
    alvos: [
      { arquivo: `${R}/relay.js`, desde: "case 'reacao': {", ate: "case 'postagem':" },
      { arquivo: `${R}/relay.js`, desde: '// 0.8.0: a reaction that replaces', ate: 'const inserted' },
      { arquivo: `${R}/social-read.js`, desde: 'reactionsOf(id, now) {', ate: 'minhaReacao(id, leitor) {' }
    ],
    testes: [`${TR}/post-reactions.test.js`, `${TR}/accept.test.js`, `${TR}/social-forum.test.js`, `${TR}/social-revision-http.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + '/relay.js:' + "return { alvo: obj.corpo.alvo, ctx: alvo.tipo === 'topico' ? alvo.id : alvo.ctx, ...(anterior ? { substitui: anterior.id } : {}) }" + '|===->!==@54',
        "the `ctx` of a reaction (older than 0.8.0) is only read when moderation hides a whole context (oculto_em), and no read of reactions looks at oculto_em: counts and minhaReacao use removido_em only"]
    ])
  },
  // Behind Cloudflare (fixes-1, 2026-11-25): the real client address, shared by the relay and the open issuer
  {
    rotulo: 'protocol/cloudflare',
    alvos: [{ arquivo: `${P}/cloudflare.js` }],
    testes: ['test/protocol/cloudflare.test.js', `${TR}/operations.test.js`, `${TE}/http.test.js`, `${TE}/edges.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/operations',
    alvos: [{ arquivo: `${R}/operations.js` }],
    // the env helpers at the end of operations.js (0.6.0, 0.7.0) are tested in edges.test.js and people.test.js
    testes: [`${TR}/operations.test.js`, `${TE}/edges.test.js`, `${TR}/people.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/backup',
    alvos: [{ arquivo: `${R}/backup.js` }],
    testes: [`${TR}/backup.test.js`, `${TR}/backup-media.test.js`],
    equivalentes: new Map([
      [R + '/backup.js:const db = new DatabaseSync(caminho, { readOnly: true })|true->false@51',
        'opening for writing a file that is only read changes nothing: the check only runs SELECT and PRAGMA, and a database in plain journal mode (the one in the backup) is not altered by opening it'],
      [R + '/backup.js:rmSync(parcial, { force: true })|true->false@29',
        'on the error path the partial file always exists (it was just created by VACUUM INTO), and `force` only changes what happens when it does NOT exist'],
      [R + '/backup.js:rmSync(join(pasta, n), { force: true })|true->false@36',
        'the name comes from readdirSync an instant earlier, so the file exists; `force` only changes what happens when it does not exist (the .sha256 next to it, which may be missing, is proven in a test)'],
      [R + '/backup.js:if ((parcial || pastaSemBanco) && velho(n)) rmSync(join(pasta, n), { recursive: true, force: true })|true->false@97',
        'the name just went through statSync (in `velho`), so it exists; `force` only changes what happens when it does not exist'],
      [R + '/backup.js:if (ausentes.length) {|if-sempre-verdadeiro',
        'with nothing missing, opening and closing the copy without running any DELETE does not change a byte of it (the journal is the plain one, not WAL, and the hash is computed afterwards); the condition only avoids the work']
    ])
  },
  {
    rotulo: 'demo/seeder',
    alvos: [
      { arquivo: 'packages/relay/scripts/demo/seeder.mjs' },
      { arquivo: 'packages/relay/scripts/demo/phases-03.mjs' },
      { arquivo: 'packages/relay/scripts/seed-demo.mjs' }
    ],
    testes: ['test/relay/seeder-03.test.js', 'test/relay/seeder-client.test.js', 'test/relay/demo-catalog.test.js'],
    equivalentes: new Map([
      ["packages/relay/scripts/demo/seeder.mjs:let ultimo = 0|0->1@15",
        "the first request never waits (Date.now() minus 0 or minus 1 gives a huge difference, and the wait is negative in both cases)"],
      ["packages/relay/scripts/demo/seeder.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|-->+@95",
        "unreachable safety net: the normal exits (network failure, 5xx, 429) stop at 4 or 12 attempts, well before 50; the ceiling only prevents an endless loop, and no test path reaches it"],
      ["packages/relay/scripts/demo/seeder.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|>->>=@19",
        "unreachable safety net: the normal exits (network failure, 5xx, 429) stop at 4 or 12 attempts, well before 50; the ceiling only prevents an endless loop, and no test path reaches it"],
      ["packages/relay/scripts/demo/seeder.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|50->51@22",
        "unreachable safety net: the normal exits (network failure, 5xx, 429) stop at 4 or 12 attempts, well before 50; the ceiling only prevents an endless loop, and no test path reaches it"],
      ["packages/relay/scripts/demo/seeder.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|50->49@22",
        "unreachable safety net: the normal exits (network failure, 5xx, 429) stop at 4 or 12 attempts, well before 50; the ceiling only prevents an endless loop, and no test path reaches it"],
      ["packages/relay/scripts/demo/seeder.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|1->2@98",
        "unreachable safety net: the normal exits (network failure, 5xx, 429) stop at 4 or 12 attempts, well before 50; the ceiling only prevents an endless loop, and no test path reaches it"],
      ["packages/relay/scripts/demo/seeder.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|1->0@98",
        "unreachable safety net: the normal exits (network failure, 5xx, 429) stop at 4 or 12 attempts, well before 50; the ceiling only prevents an endless loop, and no test path reaches it"],
      ["packages/relay/scripts/demo/seeder.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|0->1@146",
        "unreachable safety net: the normal exits (network failure, 5xx, 429) stop at 4 or 12 attempts, well before 50; the ceiling only prevents an endless loop, and no test path reaches it"],
      ["packages/relay/scripts/demo/seeder.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|guarda-desligada",
        "unreachable safety net: the normal exits (network failure, 5xx, 429) stop at 4 or 12 attempts, well before 50; the ceiling only prevents an endless loop, and no test path reaches it"],
      ["packages/relay/scripts/demo/seeder.mjs:if (falta > 0) await esperar(falta)|0->1@18",
        "falta > 0 against falta > 1: they only differ when exactly 1 ms is missing, which the clock does not let a test pin down"],
      ["packages/relay/scripts/demo/seeder.mjs:if (res.status === 429 && tentativa <= 12 && (retryAfter ?? 1) <= ESPERA_MAXIMA_NO_LUGAR_S) {|1->2@66",
        "the 1 in (retryAfter ?? 1) is only compared with 120: 0, 1 or 2 give the same answer"],
      ["packages/relay/scripts/demo/seeder.mjs:if (res.status === 429 && tentativa <= 12 && (retryAfter ?? 1) <= ESPERA_MAXIMA_NO_LUGAR_S) {|1->0@66",
        "the 1 in (retryAfter ?? 1) is only compared with 120: 0, 1 or 2 give the same answer"],
      ["packages/relay/scripts/demo/seeder.mjs:const espera = Math.min(30, Math.max(1, retryAfter || 1))|1->0@45",
        "Math.max(1, x) is already the 1 second floor: changing the inner 1 to 0 does not change the result (retryAfter || 0 falls to the floor)"],
      ["packages/relay/scripts/demo/seeder.mjs:const espera = Math.min(30, Math.max(1, retryAfter || 1))|1->0@62",
        "Math.max(1, x) is already the 1 second floor: changing the inner 1 to 0 does not change the result (retryAfter || 0 falls to the floor)"],
      ["packages/relay/scripts/demo/seeder.mjs:const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))|<-><=@158",
        "the key comparator is only read for its negative sign in the V8 sort (for distinct keys): -1 against 0, 2 or <= gives the same order"],
      ["packages/relay/scripts/demo/seeder.mjs:const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))|1->2@166",
        "the key comparator is only read for its negative sign in the V8 sort (for distinct keys): -1 against 0, 2 or <= gives the same order"],
      ["packages/relay/scripts/demo/seeder.mjs:const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))|1->2@170",
        "the key comparator is only read for its negative sign in the V8 sort (for distinct keys): -1 against 0, 2 or <= gives the same order"],
      ["packages/relay/scripts/demo/seeder.mjs:const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))|1->0@170",
        "the key comparator is only read for its negative sign in the V8 sort (for distinct keys): -1 against 0, 2 or <= gives the same order"],
      ["packages/relay/scripts/demo/seeder.mjs:relogio = () => Math.floor(Date.now() / 1000), fetchFn = fetch, esperar = dormir, intervaloMs = 130, registrar = () => {}|130->131@98",
        "tuning of the default pace between requests (130 ms): 129 or 131 changes no observable behavior"],
      ["packages/relay/scripts/demo/seeder.mjs:relogio = () => Math.floor(Date.now() / 1000), fetchFn = fetch, esperar = dormir, intervaloMs = 130, registrar = () => {}|130->129@98",
        "tuning of the default pace between requests (130 ms): 129 or 131 changes no observable behavior"],
      ["packages/relay/scripts/demo/seeder.mjs:rovers.set(r.slug, { ...r, ...chaves, cabeca: null, ultimoCriado: 0, estado: null, indice: {} })|0->1@70",
        "initial value of ultimoCriado: it is overwritten by the time of the head read, by the ledger or by now, and Math.max with the floor of now minus 300 s cancels 0 against 1"],
      ["packages/relay/scripts/demo/seeder.mjs:r.ultimoCriado = ledger.rovers[r.slug]?.ultimoCriado ?? 0|0->1@60",
        "initial value of ultimoCriado: it is overwritten by the time of the head read, by the ledger or by now, and Math.max with the floor of now minus 300 s cancels 0 against 1"],
      ["packages/relay/scripts/demo/seeder.mjs:if (primeiro) { r.ultimoCriado = Math.max(r.ultimoCriado, obj.criadoEm); primeiro = false }|false->true@90",
        "primeiro=false against true: ultimoCriado is already the maximum (idempotent) and the unreadable-head branch requires a head with no ledger, which the test covers"],
      ["packages/relay/scripts/demo/seeder.mjs:if (fase.adia?.includes(codigo) || (res.status === 429 && (res.retryAfter ?? 0) > ESPERA_MAXIMA_NO_LUGAR_S) || (res.status === 429 && codigo === 'limite_de_taxa')) {|0->1@81",
        "the 0 in (retryAfter ?? 0) is only compared with 120: 0 and 1 give the same answer"],
      ["packages/relay/scripts/demo/seeder.mjs:if (tentarEm && (relatorio.proximaRodada === null || tentarEm < relatorio.proximaRodada)) relatorio.proximaRodada = tentarEm|<-><=@65",
        "< against <=: with equal times the assigned result is the same value"],
      ["packages/relay/scripts/demo/phases-03.mjs:chave: (i) => `${i[0]}|${i[1]}`,|0->1@23",
        "the ledger key already carries the author as a prefix (autor|chave), and the changed piece only repeats or loses what the prefix already tells apart: the item's identity does not change"],
      ["packages/relay/scripts/demo/phases-03.mjs:chave: (i) => `${i[0]}>${i[1]}`,|0->1@23",
        "the ledger key already carries the author as a prefix (autor|chave), and the changed piece only repeats or loses what the prefix already tells apart: the item's identity does not change"],
      ["packages/relay/scripts/demo/phases-03.mjs:chave: (i) => `${i[0]}>${i[1]}`,|1->2@31",
        "the ledger key already carries the author as a prefix (autor|chave), and the changed piece only repeats or loses what the prefix already tells apart: the item's identity does not change"],
      ["packages/relay/scripts/demo/phases-03.mjs:chave: (i) => `${i[0]}>${i[1]}`,|1->0@31",
        "the ledger key already carries the author as a prefix (autor|chave), and the changed piece only repeats or loses what the prefix already tells apart: the item's identity does not change"],
      ["packages/relay/scripts/demo/phases-03.mjs:chave: (i, ctx) => `${ctx.idDe(i[1])}|${i[0]}`,|0->1@46",
        "the ledger key already carries the author as a prefix (autor|chave), and the changed piece only repeats or loses what the prefix already tells apart: the item's identity does not change"],
      ["packages/relay/scripts/demo/phases-03.mjs:chave: (i, ctx) => `${ctx.idDe(i[1])}|${i[0]}`,|0->1@46",
        "the ledger key already carries the author as a prefix (autor|chave), and the changed piece only repeats or loses what the prefix already tells apart: the item's identity does not change"],
      ["packages/relay/scripts/demo/phases-03.mjs:chave: (i, ctx) => `${i[0]}>${ctx.uidDe(i[1])}|${i[2]}`,|0->1@28",
        "the ledger key already carries the author as a prefix (autor|chave), and the changed piece only repeats or loses what the prefix already tells apart: the item's identity does not change"],
      ["packages/relay/scripts/demo/phases-03.mjs:chave: (i, ctx) => `${i[0]}>${ctx.uidDe(i[1])}|${i[2]}`,|0->1@28",
        "the ledger key already carries the author as a prefix (autor|chave), and the changed piece only repeats or loses what the prefix already tells apart: the item's identity does not change"],
      ["packages/relay/scripts/seed-demo.mjs:const args = process.argv.slice(2)|2->1@32",
        "process.argv.slice(1) against slice(2): the first extra argument is the script path, which is never an option; valor() and includes() find the same options"],
      ["packages/relay/scripts/seed-demo.mjs:url: url.origin, semente, simular, geracao, aceitarSemLedger: args.includes('--aceitar-sem-estado'), intervaloMs: Number(valor('--intervalo-ms') ?? 130), ledger, aoProgredir: gravar,|130->131@152",
        "tuning of the default pace between requests (130 ms)"],
      ["packages/relay/scripts/seed-demo.mjs:url: url.origin, semente, simular, geracao, aceitarSemLedger: args.includes('--aceitar-sem-estado'), intervaloMs: Number(valor('--intervalo-ms') ?? 130), ledger, aoProgredir: gravar,|130->129@152",
        "tuning of the default pace between requests (130 ms)"]
    ])
  },
  {
    rotulo: 'client/client',
    alvos: [{ arquivo: 'packages/client/src/client.js' }, { arquivo: 'packages/client/src/person.js' }, { arquivo: 'packages/client/src/agent.js' }],
    // the suite covers every client section (0.3.2, 0.5.0 images, 0.4.0 messages, Retry-After); only the tests left out are those
    // that do not exercise client behavior (types, package) and the skill examples, which are slow and already covered by the others
    testes: ['test/client/retry-after.test.js', 'test/client/public-read.test.js', 'test/client/social.test.js', 'test/client/client.test.js', 'test/client/person.test.js',
      'test/client/media.test.js', 'test/client/messages.test.js', 'test/client/messages-edges.test.js', 'test/client/revision.test.js', 'test/client/revision-032.test.js', 'test/client/reader-and-bin.test.js', 'test/client/agent.test.js'],
    sequential: true,
    equivalentes: new Map([
      ['packages/client/src/person.js:this.ultima = 0 // a política vale pela data: duas no mesmo segundo precisam de datas diferentes|0->1@18',
        'the policy only uses `ultima` inside Math.max(hora, ultima + 1), and the real time is 1.7 billion seconds: starting at 0 or at 1 gives the same date on the first policy; it would only change with a clock below 1 second, which the schema refuses anyway (minimum instant 1,700,000,000)']
    ])
  },
  // ---------- 0.3.2 (proposal 0007) ----------
  {
    rotulo: 'protocol/vocabulary',
    alvos: [
      { arquivo: `${P}/social-bodies.js`, desde: '// 0.3.2 (proposal 0007): closed vocabulary of labels and status', ate: 'categorias: ou_nulo(lista(categoria, { min: 1, max: L.categoriasPorStatus, unicos: true }))' },
      { arquivo: `${P}/social-bodies.js`, desde: "case 'comunidade-vocabulario': {", ate: 'tem rótulos repetidos' },
      { arquivo: `${P}/limits.js`, desde: 'const OUTSIDE_REQUIRABLE', ate: '!OUTSIDE_REQUIRABLE.includes(t)' }
    ],
    testes: [`${T}/social-vocabulary.test.js`, `${T}/social-schemas.test.js`, `${T}/social-declarations.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/social-points',
    alvos: [{ arquivo: `${R}/social-points.js` }],
    testes: [`${TR}/social-points.test.js`, `${TR}/social-order.test.js`, `${TR}/social-032-http.test.js`, `${TR}/social-forum.test.js`],
    sequential: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/social-announcements',
    alvos: [{ arquivo: `${R}/social-announcements.js` }],
    testes: [`${TR}/social-home.test.js`, `${TR}/social-032-http.test.js`],
    sequential: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/social-home',
    alvos: [{ arquivo: `${R}/social-home.js` }],
    testes: [`${TR}/social-home.test.js`, `${TR}/social-032-http.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + '/social-home.js:inicio({ desde = 0, credencial = null }) {|0->1@19',
        'the relay clock never shows second 0 or 1 (the timestamp is from 2020 onward), so "desde" 0 or 1 filters the same set']
    ])
  },
  {
    rotulo: 'relay/vocabulary',
    alvos: [
      { arquivo: `${R}/social-write.js`, desde: '// ---------- 0.3.2: vocabulário e marcas (proposta 0007) ----------', ate: "depois: () => this.a.executar('UPDATE topicos SET etiquetas = :e, status = :s WHERE id = :id', { e: JSON.stringify(c.etiquetas), s: c.status, id: t.id })" },
      { arquivo: `${R}/social-base.js`, desde: '0.3.2 (proposta 0007): o vocabulário vigente', ate: 'return s !== undefined && (s.categorias === null' },
      { arquivo: `${R}/social-read.js`, desde: '  marksOf(t) {', ate: 'return etiquetas.length > 0 || status !== null ? { marcas: { etiquetas, status } } : {}' }
    ],
    testes: [`${TR}/social-vocabulary.test.js`, `${TR}/social-032-http.test.js`, `${TR}/social-forum.test.js`, `${TR}/social-community.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + '/social-write.js:if (depois.length !== antes.length || status !== t.status) {|if-sempre-verdadeiro',
        'always running the UPDATE writes the same values when nothing changed: idempotent, with no observable effect (the condition only avoids a pointless write)']
    ])
  },
  {
    rotulo: 'relay/order',
    alvos: [
      { arquivo: `${R}/social-read.js`, desde: '  topicsOf(id, {', ate: '    return page' },
      { arquivo: `${R}/social-read.js`, desde: '  repliesOf(id, {', ate: '{ t: t.id, pai: paiId, antes, ...this.paramsDeVisibilidade(agora) }, limite, (l) => this._forumReply(l)' },
      { arquivo: `${R}/social-read.js`, desde: '  postReplies(id, {', ate: '{ post: post.id, antes, ...this.paramsDeVisibilidade(agora) }, limite, mapa' },
      { arquivo: `${R}/social-search.js`, desde: "  buscar({ q, tipo = 'todos'", ate: 'ordem === \'em-alta\' ? janelaDe(janela) : null)' },
      { arquivo: `${R}/social-search.js`, desde: '  _topicSearchOrder(order, duration) {', ate: "return 'bm25(busca, 0, 0, 0, 5.0, 1.0), t.id'" }
    ],
    testes: [`${TR}/social-order.test.js`, `${TR}/social-vocabulary.test.js`, `${TR}/social-032-http.test.js`, `${TR}/social-forum.test.js`, `${TR}/social-search.test.js`, `${TR}/social-revision.test.js`],
    sequential: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/http-032',
    alvos: [
      { arquivo: `${R}/http.js`, desde: '// 0.3.2: um instante em segundos', ate: 'return Number(value)' },
      { arquivo: `${R}/http.js`, desde: '// 0.3.2 (proposta 0007): o painel de início (credencial', ate: "'/v1/anuncios/:id'" },
      { arquivo: `${R}/http.js`, desde: '// 0.3.2 (proposta 0007): só o operador publica', ate: 'return [200, relay.social.removeAnnouncement(m[1])]' }
    ],
    testes: [`${TR}/social-032-http.test.js`, `${TR}/social-revision-http.test.js`],
    sequential: true,
    equivalentes: new Map([
      [R + "/http.js:['GET', /^\\/v1\\/inicio$/, '/v1/inicio', (req, m, q) => [200, s.inicio({ desde: carimboDaQuery(q.get('desde'), { nome: 'desde', padrao: 0 }), credencial: cred(req) })]],|0->1@141",
        'same reason as social-inicio.js: without "desde", 0 and 1 filter the same set because no event has a timestamp that old']
    ])
  },
  // ---------- 0.4.0 (proposal 0004): private messages ----------
  {
    rotulo: 'protocol/messages',
    alvos: [{ arquivo: `${P}/messages.js` }],
    testes: [`${T}/messages-edges.test.js`, `${T}/messages.test.js`, 'test/client/messages.test.js'],
    sequential: true,
    equivalentes: new Map([
      [P + '/messages.js:if (!cru) return null|guarda-desligada',
        'without the guard, `Buffer.concat` with null throws INSIDE the try right below, and the catch returns the same null; the guard only makes the reason explicit'],
      [P + '/messages.js:if (!z || z.every((b) => b === 0)) throw new ErroDoProtocolo(\'chave_fraca\', { campo: \'chave\' })|0->1@33',
        'OpenSSL already refuses an X25519 derivation that would give an all-zero secret (ERR_OSSL_FAILED_DURING_DERIVATION, a case proven in messages-edges.test.js with the zero key and the small-order key), so z never arrives here all zero; the check stays as a defense for another crypto engine'],
      [P + '/messages.js:while (fim > 0 && claro[fim - 1] === 0x20) fim--|>->>=@12',
        'with fim 0, claro[-1] is undefined and the loop stops the same way'],
      [P + '/messages.js:while (fim > 0 && claro[fim - 1] === 0x20) fim--|0->1@15',
        'it only changes when the plaintext is ALL spaces: " " is left instead of "", and JSON.parse rejects both (forma_do_claro in both cases, tested)']
    ])
  },
  {
    rotulo: 'relay/messages',
    alvos: [{ arquivo: `${R}/messages.js` }],
    testes: [`${TR}/messages-edges.test.js`, `${TR}/messages.test.js`, `${TR}/messages-http.test.js`, 'test/client/messages.test.js'],
    sequential: true,
    equivalentes: new Map([
      [R + '/messages.js:{ uid: leitor, estados: JSON.stringify(estados), antes, limite: limite + 1 }|1->2@79',
        'fetching one extra row still tells whether there is a next page; the returned page and the cursor do not change (the same reason as relay/relay)'],
      [R + '/messages.js:{ c: c.id, antes, limite: limite + 1 }|1->2@41',
        'same, on the messages page']
    ])
  },
  {
    // the 0.4.0 section of the reference client (encryption, checking what the relay serves, retry with the key read again, reading, reporting)
    rotulo: 'client/messages',
    alvos: [{ arquivo: 'packages/client/src/client.js', desde: '// 0.4.0: private messages (PROTOCOL.md section 15)', ate: 'function query(params) {' }],
    testes: ['test/client/messages-edges.test.js', 'test/client/messages.test.js'],
    sequential: true,
    equivalentes: new Map()
  },
  // ---------- 0.7.0 (proposal 0009): people on the network and the leak detector ----------
  {
    rotulo: 'protocol/leak',
    alvos: [{ arquivo: `${P}/leak.js` }],
    testes: [`${T}/leak.test.js`, `${T}/leak-false-positives.test.js`],
    equivalentes: new Map([
      [P + '/leak.js:if (n > 9) n -= 9|>->>=@11',
        'the doubled Luhn digit is always even (0 to 18): 9 never occurs, so `> 9` and `>= 9` pick the same numbers'],
      [P + '/leak.js:if (n > 9) n -= 9|9->8@14',
        'same: the even numbers greater than 8 are the same as those greater than 9 (10 to 18)'],
      [P + '/leak.js:for (let i = 0; i < valor.length; i++) {|<-><=@23',
        'the extra turn reads `valor[valor.length]`, which is undefined and is not a string, a list or an object: it returns null and the result does not change']
    ])
  },
  {
    rotulo: 'protocol/people',
    alvos: [{ arquivo: `${P}/people.js` }, { arquivo: `${P}/limits.js`, desde: '// ---------- 0.7.0: people on the network' }],
    // the person's rate table is checked against PROTOCOL.md: the copy needs the docs folder
    copiar: ['package.json', 'packages', 'test', 'docs'],
    testes: [`${T}/people.test.js`, `${TR}/people.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'relay/people',
    alvos: [
      { arquivo: `${R}/people.js` },
      { arquivo: `${R}/leak.js` },
      { arquivo: `${R}/operations.js`, desde: '0.7.0: `RELAY_PEOPLE_ISSUERS`' },
      { arquivo: `${R}/social-base.js`, desde: '  resumo(uid) {', ate: '  accountAge(uid, now) {' },
      { arquivo: `${R}/relay.js`, desde: '    // 0.7.0 (proposta 0009): quem atesta pessoas', ate: '    this.aoRecusarVazamento = aoRecusarVazamento' },
      { arquivo: `${R}/relay.js`, desde: '    // 0.7.0: o filtro de vazamento roda ANTES da forma', ate: '    conferirVazamento(envelope.objeto' },
      { arquivo: `${R}/relay.js`, desde: '    // 0.7.0: o que só vale para pessoa', ate: '      if (e) throw e' },
      { arquivo: `${R}/relay.js`, desde: '        const { atestado: a, especie } = verificarAtestadoAnexado', ate: '        return { newAttestation: a, effective:' },
      { arquivo: `${R}/relay.js`, desde: '    // 0.7.0: a pessoa vale enquanto o emissor dela', ate: '      efetivo: { chave: guardado.chave, chaveAprovacao: guardado.chave_aprovacao || null' },
      { arquivo: `${R}/relay.js`, desde: '    // 0.7.0: a pessoa escreve por si', ate: "    if (efetivo.especie === 'pessoa') return {}" },
      { arquivo: `${R}/relay.js`, desde: '  _checkRate(obj, issuer, now, authorization', ate: '    const taxas = taxasDoAutor(especie, this.taxas)' },
      { arquivo: `${R}/relay.js`, desde: "    checar('autor', obj.autor, obj.tipo, taxas.porTipo", ate: "    checar('emissor', emissor, null, taxas.emissor" },
      { arquivo: `${R}/relay.js`, desde: '        `INSERT INTO rovers (uid, chave, chave_aprovacao', ate: "          uid: obj.autor, chave: atestadoNovo.chave, chaveAprovacao: atestadoNovo.chaveAprovacao ?? '', handle: atestadoNovo.handle, especie" },
      { arquivo: `${R}/relay.js`, desde: '      // 0.7.0: quem escreve. `pessoa`', ate: '      especie: especieDaLinha(r, this.emissoresDeAgentes),' },
      { arquivo: `${R}/relay.js`, desde: '      // 0.7.0: quem atesta pessoas (só com emissores', ate: '      filtroDeVazamento: { ligado' },
      { arquivo: `${R}/relay.js`, desde: '    // 0.7.0: a pessoa não tem chave de aprovação, então', ate: "    if (r.especie === 'pessoa') throw" }
    ],
    testes: [`${TR}/people.test.js`, `${TR}/leak.test.js`, `${TR}/social-base.test.js`, `${TR}/read.test.js`, `${TR}/accept.test.js`, `${TR}/authorization.test.js`, 'test/client/person-in-network.test.js'],
    sequential: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'client/person',
    alvos: [
      { arquivo: 'packages/client/src/client.js', desde: '    // 0.7.0: on `422 vazamento`', ate: 'export class NotApproved extends Error {' },
      { arquivo: 'packages/client/src/client.js', desde: '    // 0.7.0: with a PERSON attestation', ate: '  /** `assinar`: read request' },
      { arquivo: 'packages/client/src/client.js', desde: '    // 0.7.0: the leak filter runs here', ate: '    } else if (exigeAprovacao(tipo, this.exigidos)) {' },
      { arquivo: 'packages/client/src/client.js', desde: '// The person has no approver' }
    ],
    testes: ['test/client/person-in-network.test.js', 'test/client/client.test.js', 'test/client/agent.test.js'],
    sequential: true,
    equivalentes: new Map()
  }
]
