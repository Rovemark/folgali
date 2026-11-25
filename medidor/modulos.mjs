// SPDX-License-Identifier: AGPL-3.0-or-later
// Quais módulos o medidor cobre, qual bateria de testes é a dele e quais sobreviventes são equivalentes.
// Equivalente = defeito que nenhum teste pode distinguir do original, com o MOTIVO escrito. Lista curta e honesta:
// o resto que sobrevive é furo de teste e se conserta no teste.
const P = 'packages/protocolo/src'
const T = 'test/protocolo'
const R = 'packages/rele/src'
const TR = 'test/rele'
// 0.6.0: o emissor aberto, serviço à parte
const E = 'packages/emissor-aberto/src'
const TE = 'test/emissor'
// Os módulos da 0.3 rodam a bateria um arquivo por vez, na ordem dada, e param no primeiro que cai (`sequencial`): o defeito
// morto cedo custa pouco, e o que sobrevive passa por todos, o mesmo veredito de rodar tudo junto.
const SOCIAIS_DO_RELE = ['base', 'rele', 'escrita', 'leitura', 'perfil', 'amizade', 'comunidade', 'forum', 'paginas', 'moderacao', 'busca', 'notificacoes', 'abuso', 'compat', 'revisao', 'revisao-http', 'http'].map((n) => `${TR}/social-${n}.test.js`)
const ordem = (...primeiros) => [...primeiros.map((n) => `${TR}/social-${n}.test.js`), ...SOCIAIS_DO_RELE.filter((t) => !primeiros.some((n) => t.endsWith(`social-${n}.test.js`)))]

export const MODULOS = [
  {
    rotulo: 'protocolo/canonico',
    alvos: [{ arquivo: `${P}/canonico.js` }],
    testes: [`${T}/canonico.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocolo/chaves',
    alvos: [{ arquivo: `${P}/chaves.js` }],
    testes: [`${T}/chaves.test.js`, `${T}/social-esquemas.test.js`],
    equivalentes: new Map([
      [P + '/chaves.js:const MENSAGENS_DE_SONDA = Array.from({ length: 128 }, (_, i) => Buffer.from(`sonda-chave-fraca-${i}`))|128->129@48',
        'o número de sondas só muda a chance de falso negativo (menos de 1 em 10^7), não há comportamento observável a testar'],
      [P + '/chaves.js:const MENSAGENS_DE_SONDA = Array.from({ length: 128 }, (_, i) => Buffer.from(`sonda-chave-fraca-${i}`))|128->127@48',
        'idem: 127 sondas dão a mesma resposta; a margem estatística é a mesma ordem de grandeza']
    ])
  },
  {
    rotulo: 'protocolo/texto',
    alvos: [{ arquivo: `${P}/texto.js` }, { arquivo: `${P}/pii.js` }],
    testes: [`${T}/texto.test.js`, `${T}/social-texto.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocolo/objetos',
    alvos: [{ arquivo: `${P}/objetos.js` }, { arquivo: `${P}/esquema.js` }],
    testes: [`${T}/objetos.test.js`, `${T}/corpos-antigos.test.js`, `${T}/social-esquemas.test.js`, `${T}/declaracoes.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocolo/declaracoes',
    alvos: [{ arquivo: `${P}/declaracoes.js` }, { arquivo: `${P}/politica.js` }, { arquivo: `${P}/leitura.js` }],
    testes: [`${T}/declaracoes.test.js`, `${T}/social-declaracoes.test.js`, `${T}/politica.test.js`, `${T}/leitura.test.js`, `${T}/agentes.test.js`],
    equivalentes: new Map()
  },
  // ---------- 0.6.0 (proposta 0008): folgali ----------
  {
    rotulo: 'protocolo/agentes',
    alvos: [{ arquivo: `${P}/agentes.js` }, { arquivo: `${P}/limites.js`, desde: '// ---------- 0.6.0: folgali', ate: 'export const ACOES_DE_DONO' }],
    testes: [`${T}/agentes.test.js`, `${TE}/emissor.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'emissor/emissor',
    alvos: [{ arquivo: `${E}/emissor.js` }, { arquivo: `${E}/origem.js` }],
    testes: [`${TE}/origem.test.js`, `${TE}/bordas.test.js`, `${TE}/emissor.test.js`, `${TE}/http.test.js`, `${TE}/integracao.test.js`, 'test/cliente/agente.test.js'],
    equivalentes: new Map([
      [E + '/emissor.js:' + "const lista = (this._origens.get(origem) ?? []).filter((t) => t > agora - 86400)" + '|>->>=@67',
        "a lista guardada é filtrada de novo, com `>`, em _esperaDaOrigem; um instante a exatamente 1 dia guardado a mais nunca é contado"],
      [E + '/emissor.js:' + "_novoCodigo() { return `${PALAVRAS_DO_CODIGO[randomInt(PALAVRAS_DO_CODIGO.length)]}-${String(randomInt(10000)).padStart(4, '0')}` }" + '|10000->10001@105',
        "o sorteio de 0 a 10000 só difere de 0 a 9999 com chance de 1 em 10001 por registro; o código continua aceito pelo formato em todos os outros casos"],
      [E + '/emissor.js:' + "_novoCodigo() { return `${PALAVRAS_DO_CODIGO[randomInt(PALAVRAS_DO_CODIGO.length)]}-${String(randomInt(10000)).padStart(4, '0')}` }" + '|10000->9999@105',
        "idem: tirar o 9999 do sorteio não é observável num teste determinístico"],
      [E + '/emissor.js:' + "this._executar('UPDATE agentes SET atestado = :atestado WHERE uid = :uid', { uid: a.uid, atestado: JSON.stringify(this._atestado(a, Math.max(agora, atestado.emitidoEm + 1))) })" + '|1->2@175',
        "a renovação só acontece com dias de folga depois da emissão, então Math.max(agora, emitidoEm + 1) é sempre `agora`, com +1 ou +2"],
      [E + '/emissor.js:' + "this._executar('UPDATE agentes SET atestado = :atestado WHERE uid = :uid', { uid: a.uid, atestado: JSON.stringify(this._atestado(a, Math.max(agora, atestado.emitidoEm + 1))) })" + '|1->0@175',
        "idem: com +0 o máximo continua sendo `agora`"],
      [E + '/emissor.js:' + "this._executar('UPDATE agentes SET atestado = :atestado WHERE uid = :uid', { uid: a.uid, atestado: JSON.stringify(this._atestado(a, Math.max(agora, atestado.emitidoEm + 1))) })" + '|+->-@172',
        "idem: emitidoEm - 1 é ainda menor que `agora`"],
      [E + '/emissor.js:' + "const a = typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? this._um(\"SELECT * FROM agentes WHERE token_hash = :h AND situacao = 'aguardando-dono'\", { h: sha256(token) }) : null" + '|&&->||@40',
        "o segredo chega sempre como texto (vem da rota); com `||`, um texto fora do formato só consulta o hash dele no banco, que nunca existe, e a resposta é a mesma"],
      [E + '/emissor.js:' + "const a = typeof uid === 'string' && UID_RE.test(uid) ? this._um(`SELECT * FROM agentes WHERE uid = :uid AND ${ATIVOS}`, { uid }) : null" + '|&&->||@38',
        "idem para o uid: um texto fora do formato consulta um uid que não existe, e a resposta é a mesma"]
,
      [E + '/emissor.js:' + "if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo) || Object.keys(corpo).join(',') !== nome) {" + '|||->&&@50',
        "um texto ou uma lista que passem por esta parte da guarda caem na última (as chaves de um texto ou de uma lista nunca são exatamente o nome pedido), com a mesma resposta"],
      [E + '/emissor.js:' + "this._segredoDeAprovacao = Buffer.from(hkdfSync('sha256', segredo, Buffer.alloc(0), 'rover-network/0.6/emissor-aberto/aprovacao', 32))" + '|0->1@84',
        "HKDF (RFC 5869) usa o sal como chave do HMAC, que completa a chave com zeros até o bloco: sal vazio e sal de um byte zero dão o mesmo resultado (o vetor fixo do teste confere)"],
      [E + '/emissor.js:' + "this._segredoDeDono = Buffer.from(hkdfSync('sha256', segredo, Buffer.alloc(0), 'rover-network/0.6/emissor-aberto/dono', 32))" + '|0->1@79',
        "idem para o HMAC dos donos"],
      [E + '/emissor.js:' + "const antes = (this._origens.get(origem) ?? []).filter((t) => t > agora - 86400)" + '|>->>=@67',
        "o registro que faz exatamente um dia daria espera de 0 segundos, e espera 0 libera: contar ou não contar esse registro dá a mesma resposta"],
      [E + '/emissor.js:' + "const antes = (this._origens.get(origem) ?? []).filter((t) => t > agora - 86400)" + '|86400->86401@78',
        "idem: o registro a mais que a janela de 86401 enxerga tem exatamente um dia, e a espera calculada com ele é 0"],
      [E + '/emissor.js:' + "const naHora = antes.filter((t) => t > agora - 3600)" + '|>->>=@40',
        "idem para a hora: o registro de exatamente uma hora daria espera 0, e espera 0 libera"],
      [E + '/emissor.js:' + "const naHora = antes.filter((t) => t > agora - 3600)" + '|3600->3601@51',
        "idem: a janela de 3601 só enxerga a mais o registro de exatamente uma hora, que dá espera 0"],
      [E + '/emissor.js:' + "const lista = (this._origens.get(origem) ?? []).filter((t) => t > agora - 86400)" + '|86400->86401@78',
        "a lista guardada é filtrada de novo, com 86400, na conferência: guardar um registro de exatamente um dia a mais não muda nenhuma conta"]
    ])
  },  {
    rotulo: 'emissor/servico',
    alvos: [{ arquivo: `${E}/http.js` }, { arquivo: `${E}/configuracao.js` }, { arquivo: `${E}/backup.js` }, { arquivo: `${E}/rele.js` }],
    testes: [`${TE}/http.test.js`, `${TE}/servico.test.js`, `${TE}/bordas.test.js`, `${TE}/integracao.test.js`],
    equivalentes: new Map()
  },

  {
    rotulo: 'protocolo/links',
    alvos: [{ arquivo: `${P}/links.js` }],
    testes: [`${T}/social-texto.test.js`, `${T}/social-esquemas.test.js`],
    equivalentes: new Map([
      [P + "/links.js:if (IPV4.test(host) || host.includes(':') || host.startsWith('[')) return 'tem um link para endereço IP'|||->&&@44",
        'o hostname de um IPv6 vem de `new URL` sempre entre colchetes e com dois-pontos, então as duas condições são verdadeiras juntas; `||` e `&&` dão o mesmo resultado para qualquer host que a URL aceita']
    ])
  },
  {
    rotulo: 'protocolo/mencoes',
    alvos: [{ arquivo: `${P}/mencoes.js` }],
    testes: [`${T}/social-texto.test.js`],
    equivalentes: new Map([
      [P + '/mencoes.js:else if (SO_ASCII_DE_TAG.test(corrida) && /^[A-Za-z0-9]/.test(corrida) && corrida.length > 24) longas++|24->23@95',
        'este ramo só roda quando a corrida NÃO é uma tag válida; uma corrida ASCII que começa por letra ou número, tem 24 caracteres e não é tag válida não existe (24 caracteres assim sempre casam com TAG_VALIDA), então 23 e 24 se comportam igual'],
      [P + '/mencoes.js:else if (SO_ASCII_DE_TAG.test(corrida) && /^[A-Za-z0-9]/.test(corrida) && corrida.length > 24) longas++|>->>=@92',
        'idem: com 24 caracteres o ramo nunca é alcançado, então `> 24` e `>= 24` dão o mesmo resultado']
    ])
  },
  {
    rotulo: 'protocolo/corpos-sociais',
    alvos: [{ arquivo: `${P}/corpos-sociais.js` }],
    testes: [`${T}/social-esquemas.test.js`, `${T}/social-declaracoes.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocolo/limites',
    alvos: [
      { arquivo: `${P}/limites.js`, desde: 'export function fatorDeIdade', ate: 'export const tetoComFator' },
      { arquivo: `${P}/limites.js`, desde: 'export function tipoExisteNaVersao', ate: '}' },
      { arquivo: `${P}/limites.js`, desde: 'export function tiposExigiveisDe', ate: '}' },
      { arquivo: `${P}/limites.js`, desde: 'export function tiposAutorizaveisDe', ate: '}' }
    ],
    testes: [`${T}/social-declaracoes.test.js`, `${T}/social-esquemas.test.js`, 'test/rele/social-abuso.test.js'],
    equivalentes: new Map()
  },
  {
    rotulo: 'protocolo/atestados',
    alvos: [{ arquivo: `${P}/atestados.js` }],
    testes: [`${T}/atestados.test.js`],
    equivalentes: new Map([
      [P + '/atestados.js:return erro(\'atestado_invalido\', { campo: \'atestado.expiraEm\', detalhe: `A validade precisa ser positiva e de no máximo ${Math.floor(validadeMax / 86400)} dias.` })|86400->86399@151',
        'só altera o texto da mensagem, e dividir por 86399 em vez de 86400 dá o mesmo piso em dias para qualquer validade realista']
    ])
  },
  {
    rotulo: 'rele/rele',
    alvos: [{ arquivo: `${R}/rele.js` }],
    testes: [`${TR}/social-revisao.test.js`, `${TR}/social-revisao-http.test.js`, `${TR}/social-rele.test.js`, `${TR}/aceitar.test.js`, `${TR}/leitura.test.js`, `${TR}/moderacao.test.js`, `${TR}/taxa.test.js`, `${TR}/bordas.test.js`, `${TR}/declaracoes.test.js`, `${TR}/autorizacao.test.js`, `${TR}/exigencia.test.js`, ...ordem('compat', 'abuso'), `${TR}/grafo.test.js`, `${TR}/revogados-do-emissor.test.js`, `${TE}/emissor.test.js`],
    sequencial: true,
    equivalentes: new Map([
      [R + '/rele.js:if (this._versaoDeRevogacoes === this.provedor.versao) return|guarda-desligada',
        'reler a lista de revogados a cada pedido dá o mesmo resultado (a troca é idempotente); a guarda só evita o trabalho repetido'],
      [R + '/rele.js:const linhas = this.armazem.todos(sql, { ...params, limite: limite + 1 })|1->2@73',
        'buscar uma linha a mais ainda serve para saber se há próxima página; a página devolvida e o cursor não mudam'],
      [R + '/rele.js:const fator = this.semFatorDeIdade || SEM_FATOR_DE_IDADE.includes(obj.tipo) ? 1 : fatorDeIdade(guardado ? agora - guardado.criado_em : 0)|0->1@139',
        'rover sem registro antigo (guardado nulo) tem idade 0 ou 1 segundo: as duas caem na mesma faixa de fator (menos de 1 dia)']
    ])
  },
  {
    // Só o trecho da opção do operador `semFatorDeIdade` (construtor e a linha do fator em `_conferirTaxa`). O resto do arquivo
    // é medido em `rele/rele`.
    rotulo: 'rele/sem-fator-de-idade',
    alvos: [
      { arquivo: `${R}/rele.js`, desde: 'this.semFatorDeIdade = semFatorDeIdade === true', ate: 'this.taxas = {' },
      { arquivo: `${R}/rele.js`, desde: 'const fator = this.semFatorDeIdade', ate: '(o fator só entra onde' }
    ],
    // o padrão do parâmetro mora na linha do construtor, que tem outros parâmetros medidos em `rele/rele`: defeito plantado à mão
    extras: [['padrao-ligado', `${R}/rele.js`, 'semFatorDeIdade = false }) {', 'semFatorDeIdade = true }) {']],
    testes: [`${TR}/sem-fator-de-idade.test.js`, `${TR}/taxa.test.js`, `${TR}/social-abuso.test.js`],
    sequencial: true,
    equivalentes: new Map([
      [R + '/rele.js:const fator = this.semFatorDeIdade || SEM_FATOR_DE_IDADE.includes(obj.tipo) ? 1 : fatorDeIdade(guardado ? agora - guardado.criado_em : 0)|0->1@139',
        'rover sem registro antigo (guardado nulo) tem idade 0 ou 1 segundo: as duas caem na mesma faixa de fator (menos de 1 dia)']
    ])
  },
  {
    // A validação da variável RELE_SEM_FATOR_DE_IDADE no binário do relé hospedado (falha fechada) e o repasse ao relé.
    rotulo: 'rele/hospedado-fator',
    alvos: [{ arquivo: 'packages/rele/bin/rele-hospedado.js', desde: "if (!['', undefined, 'sim', 'nao']", ate: 'const semFatorDeIdade = env' }],
    testes: [`${TR}/hospedado.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'rele/armazem',
    alvos: [{ arquivo: `${R}/armazem.js` }, { arquivo: `${R}/limite-taxa.js` }, { arquivo: `${R}/provedor.js` }],
    testes: [`${TR}/aceitar.test.js`, `${TR}/leitura.test.js`, `${TR}/moderacao.test.js`, `${TR}/taxa.test.js`, `${TR}/bordas.test.js`, `${TR}/provedor.test.js`, `${TR}/declaracoes.test.js`, `${TR}/autorizacao.test.js`, `${TR}/exigencia.test.js`, `${TR}/migracao.test.js`, ...ordem('compat'), `${TR}/grafo.test.js`, `${TR}/revogados-do-emissor.test.js`],
    sequencial: true,
    equivalentes: new Map([
      [R + '/provedor.js:this._versao = 1|1->2@19', 'o valor inicial da versão é arbitrário; o que importa é que ela mude a cada alteração, e isso é testado'],
      [R + '/provedor.js:this._versao = 1|1->0@19', 'idem']
    ])
  },
  {
    // A lista de revogados dos emissores lida pelo relé hospedado (docs/OPERACAO-DO-RELE.md, seção 15).
    rotulo: 'rele/revogados-do-emissor',
    alvos: [{ arquivo: `${R}/revogados-do-emissor.js` }],
    testes: [`${TR}/revogados-do-emissor.test.js`],
    equivalentes: new Map([
      [R + '/revogados-do-emissor.js:if (terminado) return|guarda-desligada',
        'a promessa só se resolve uma vez: uma segunda chamada a terminar (ou o fim do corpo depois de um erro) não muda o resultado; clearTimeout e destroy repetidos não têm efeito'],
      [R + '/revogados-do-emissor.js:terminado = true|true->false@18',
        'idem: depois do primeiro desfecho, um segundo resolve ou rejeita da mesma promessa é ignorado pelo próprio JavaScript'],
      [R + '/revogados-do-emissor.js:const status = res.statusCode ?? 0|0->1@39',
        'o cliente https do Node sempre preenche statusCode numa resposta; o valor de reserva nunca é usado'],
      [R + '/revogados-do-emissor.js:this._versao = 1|1->2@19', 'o valor inicial da versão é arbitrário; o que importa é que ela mude a cada alteração, e isso é testado'],
      [R + '/revogados-do-emissor.js:this._versao = 1|1->0@19', 'idem'],
      [R + '/revogados-do-emissor.js:if (lista.geradoEm > p.ate) p.ate = lista.geradoEm|>->>=@24',
        'com geradoEm igual a ate a atribuição grava o mesmo número'],
      [R + '/revogados-do-emissor.js:try { rmSync(temporario, { force: true }) } catch { /* nada a limpar */ }|true->false@40',
        'sem force, apagar um temporário que não existe lança, e o catch da mesma linha engole: o resultado é o mesmo']
    ])
  },
  {
    // O que a revogação lembrada (`ate`) e a credencial de leitura do revogado mudaram fora do módulo novo: a consulta do armazém, a
    // visibilidade, a recusa da leitura, a rota própria, o campo de /v1/info e a rota de administração.
    rotulo: 'rele/revogados-no-rele',
    alvos: [
      { arquivo: `${R}/armazem.js`, desde: 'AND NOT EXISTS (SELECT 1 FROM revogacoes v', ate: '// O grafo de seguir de um rover é público' },
      { arquivo: `${R}/armazem.js`, desde: '  revogado(emissor, uid, emitidoEm) {', ate: '  substituirRevogacoes(lista) {' },
      { arquivo: `${R}/armazem.js`, desde: '  substituirRevogacoes(lista) {', ate: 'INSERT OR IGNORE INTO revogacoes' },
      { arquivo: `${R}/rele.js`, desde: '  _recusarLeituraDeRevogado(credencial, agora) {', ate: "throw new ErroDoProtocolo('atestado_revogado')" },
      { arquivo: `${R}/rele.js`, desde: "...(typeof this.provedor.estadoDosRevogados === 'function'", ate: 'limites: {' },
      { arquivo: `${R}/social-leitura.js`, desde: '  exigirPropria(uid, credencial, agora) {', ate: "if (l !== uid) throw new ErroDoProtocolo('sem_permissao')" },
      { arquivo: `${R}/http.js`, desde: "...(typeof rele.provedor.limpar === 'function'", ate: '}]] : []),' }
    ],
    testes: [`${TR}/revogados-do-emissor.test.js`, `${TR}/aceitar.test.js`, `${TR}/leitura.test.js`],
    sequencial: true,
    equivalentes: new Map([
      [R + "/http.js:const chaves = corpo !== null && typeof corpo === 'object' && !Array.isArray(corpo) ? Object.keys(corpo).sort().join(',') : ''|&&->||@65",
        'para corpo que não é objeto (texto, número, booleano, lista) Object.keys devolve índices ou nada, e nenhum desses casa com "tudo" ou "emissor,uid": a recusa é a mesma']
    ])
  },
  {
    rotulo: 'rele/social-base',
    alvos: [{ arquivo: `${R}/social-base.js` }],
    testes: ordem('base', 'comunidade', 'abuso'),
    sequencial: true,
    equivalentes: new Map([
      [R + '/social-base.js:export const parDe = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)|<-><=@33',
        'a = b só acontece num par de um rover consigo mesmo, que o esquema recusa; com a diferente de b os dois operadores escolhem o mesmo lado']
    ])
  },
  {
    rotulo: 'rele/social-notificacoes',
    alvos: [{ arquivo: `${R}/social-notificacoes.js` }],
    testes: ordem('revisao', 'notificacoes', 'abuso'),
    sequencial: true,
    equivalentes: new Map([
      [R + '/social-notificacoes.js:{ uid, antes, limite: limite + 1 }|1->2@37',
        'buscar uma linha a mais continua dizendo se há próxima página (mais de `limite` linhas): a página devolvida e o cursor não mudam']
    ])
  },
  {
    rotulo: 'rele/social-indice',
    alvos: [{ arquivo: `${R}/social-indice.js` }],
    testes: ordem('busca', 'forum'),
    sequencial: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'rele/social-escrita',
    alvos: [{ arquivo: `${R}/social-escrita.js` }],
    testes: ordem('revisao', 'escrita', 'perfil', 'amizade', 'comunidade', 'forum', 'paginas'),
    sequencial: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'rele/social-moderacao',
    alvos: [{ arquivo: `${R}/social-moderacao.js` }],
    testes: ordem('moderacao', 'comunidade'),
    sequencial: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'rele/social-busca',
    alvos: [{ arquivo: `${R}/social-busca.js` }],
    testes: ordem('revisao', 'busca', 'abuso'),
    sequencial: true,
    equivalentes: new Map([
      [R + '/social-busca.js:const base = { m: consulta, limite: limite + 1, desloc: deslocamento }|1->2@49',
        'buscar uma linha a mais continua dizendo se há próxima página (mais de `limite` linhas): a página devolvida e o cursor não mudam']
    ])
  },
  {
    rotulo: 'rele/social-leitura',
    alvos: [{ arquivo: `${R}/social-leitura.js` }],
    testes: [...ordem('revisao', 'revisao-http', 'leitura', 'perfil', 'comunidade', 'forum', 'amizade', 'paginas', 'moderacao', 'abuso', 'notificacoes', 'http'), `${TR}/revogados-do-emissor.test.js`],
    sequencial: true,
    equivalentes: new Map([
      [R + '/social-leitura.js:const linhas = this.a.todos(sql, { ...params, limite: limite + 1 })|1->2@67',
        'buscar uma linha a mais continua dizendo se há próxima página (mais de `limite` linhas): a página devolvida e o cursor não mudam'],
      [R + '/social-leitura.js:const linhas = this.a.todos(`${sql} LIMIT :limite OFFSET :desloc`, { ...params, limite: limite + 1, desloc })|1->2@101',
        'buscar uma linha a mais continua dizendo se há próxima página (mais de `limite` linhas): a página devolvida e o cursor não mudam'],
      [R + '/social-leitura.js:if (leitor === null || leitor === undefined) return null|guarda-desligada',
        'sem leitor a consulta seguinte (reação com autor nulo) também devolve null: a guarda só poupa uma consulta ao banco'],
      [R + '/social-leitura.js:if (leitor === null || leitor === undefined) return null|||->&&@24',
        'com `&&` a guarda nunca dispara e a consulta com autor nulo devolve o mesmo null: nenhum teste distingue (a guarda só poupa a consulta)']
    ])
  },
  {
    rotulo: 'rele/http',
    alvos: [{ arquivo: `${R}/http.js` }],
    testes: [`${TR}/social-revisao-http.test.js`, `${TR}/social-http.test.js`, `${TR}/http.test.js`, `${TR}/http-bordas.test.js`, `${TR}/http-grafo.test.js`, `${TR}/revogados-do-emissor.test.js`],
    sequencial: true,
    equivalentes: new Map([
      [R + '/http.js:' + "['GET', new RegExp(`^/v1/rovers/${u}/notificacoes/contagem$`), '/v1/rovers/:uid/notificacoes/contagem', (req, m, q) => [200, s.contagemDeNotificacoes(m[1], { desde: numero(q, 'desde', 0), credencial: cred(req) })]]," + '|0->1@190',
        'o padrão de `desde` na contagem de avisos é 0 ou 1: nenhum aviso nasce no segundo 0 nem no 1 da época, então as duas contagens são iguais']
    ])
  },
  {
    rotulo: 'rele/operacao',
    alvos: [{ arquivo: `${R}/operacao.js` }],
    testes: [`${TR}/operacao.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'rele/backup',
    alvos: [{ arquivo: `${R}/backup.js` }],
    testes: [`${TR}/backup.test.js`, `${TR}/backup-midia.test.js`],
    equivalentes: new Map([
      [R + '/backup.js:const db = new DatabaseSync(caminho, { readOnly: true })|true->false@51',
        'abrir para escrita um arquivo que só é lido não muda nada: a conferência só executa SELECT e PRAGMA, e um banco em modo de diário comum (o do backup) não é alterado por abrir'],
      [R + '/backup.js:rmSync(parcial, { force: true })|true->false@29',
        'no caminho de erro o arquivo parcial sempre existe (acabou de ser criado pelo VACUUM INTO), e `force` só muda o que acontece quando ele NÃO existe'],
      [R + '/backup.js:rmSync(join(pasta, n), { force: true })|true->false@36',
        'o nome vem de readdirSync um instante antes, então o arquivo existe; `force` só muda o que acontece quando ele não existe (o .sha256 ao lado, que pode faltar, é provado em teste)'],
      [R + '/backup.js:if ((parcial || pastaSemBanco) && velho(n)) rmSync(join(pasta, n), { recursive: true, force: true })|true->false@97',
        'o nome acabou de passar por statSync (em `velho`), então existe; `force` só muda o que acontece quando ele não existe'],
      [R + '/backup.js:if (ausentes.length) {|if-sempre-verdadeiro',
        'sem ausentes, abrir e fechar a cópia sem rodar DELETE nenhum não muda um byte dela (o diário é o comum, não WAL, e o hash é calculado depois); a condição só evita o trabalho']
    ])
  },
  {
    rotulo: 'demo/semeador',
    alvos: [
      { arquivo: 'packages/rele/scripts/demo/semeador.mjs' },
      { arquivo: 'packages/rele/scripts/demo/fases-03.mjs' },
      { arquivo: 'packages/rele/scripts/semear-demo.mjs' }
    ],
    testes: ['test/rele/semeador-03.test.js', 'test/rele/semeador-cliente.test.js', 'test/rele/demo-catalogo.test.js'],
    equivalentes: new Map([
      ["packages/rele/scripts/demo/semeador.mjs:let ultimo = 0|0->1@15",
        "o primeiro pedido nunca espera (Date.now() menos 0 ou menos 1 dá uma diferença enorme, e a espera é negativa nos dois casos)"],
      ["packages/rele/scripts/demo/semeador.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|-->+@95",
        "rede de segurança inalcançável: as saídas normais (falha de rede, 5xx, 429) param em 4 ou 12 tentativas, bem antes de 50; o teto só impede um laço sem fim, e nenhum caminho de teste chega a ele"],
      ["packages/rele/scripts/demo/semeador.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|>->>=@19",
        "rede de segurança inalcançável: as saídas normais (falha de rede, 5xx, 429) param em 4 ou 12 tentativas, bem antes de 50; o teto só impede um laço sem fim, e nenhum caminho de teste chega a ele"],
      ["packages/rele/scripts/demo/semeador.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|50->51@22",
        "rede de segurança inalcançável: as saídas normais (falha de rede, 5xx, 429) param em 4 ou 12 tentativas, bem antes de 50; o teto só impede um laço sem fim, e nenhum caminho de teste chega a ele"],
      ["packages/rele/scripts/demo/semeador.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|50->49@22",
        "rede de segurança inalcançável: as saídas normais (falha de rede, 5xx, 429) param em 4 ou 12 tentativas, bem antes de 50; o teto só impede um laço sem fim, e nenhum caminho de teste chega a ele"],
      ["packages/rele/scripts/demo/semeador.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|1->2@98",
        "rede de segurança inalcançável: as saídas normais (falha de rede, 5xx, 429) param em 4 ou 12 tentativas, bem antes de 50; o teto só impede um laço sem fim, e nenhum caminho de teste chega a ele"],
      ["packages/rele/scripts/demo/semeador.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|1->0@98",
        "rede de segurança inalcançável: as saídas normais (falha de rede, 5xx, 429) param em 4 ou 12 tentativas, bem antes de 50; o teto só impede um laço sem fim, e nenhum caminho de teste chega a ele"],
      ["packages/rele/scripts/demo/semeador.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|0->1@146",
        "rede de segurança inalcançável: as saídas normais (falha de rede, 5xx, 429) param em 4 ou 12 tentativas, bem antes de 50; o teto só impede um laço sem fim, e nenhum caminho de teste chega a ele"],
      ["packages/rele/scripts/demo/semeador.mjs:if (tentativa > 50) throw new ErroDeSemeadura(`o relé não respondeu depois de ${tentativa - 1} tentativas em ${metodo} ${caminho.split('?')[0].replace(/rvr_[\\\\w-]+|ob_[\\\\w-]+/g, ':id')}`)|guarda-desligada",
        "rede de segurança inalcançável: as saídas normais (falha de rede, 5xx, 429) param em 4 ou 12 tentativas, bem antes de 50; o teto só impede um laço sem fim, e nenhum caminho de teste chega a ele"],
      ["packages/rele/scripts/demo/semeador.mjs:if (falta > 0) await esperar(falta)|0->1@18",
        "falta > 0 contra falta > 1: só difere quando faltam exatamente 1 ms, o que o relógio não permite fixar em teste"],
      ["packages/rele/scripts/demo/semeador.mjs:if (res.status === 429 && tentativa <= 12 && (retryAfter ?? 1) <= ESPERA_MAXIMA_NO_LUGAR_S) {|1->2@66",
        "o 1 de (retryAfter ?? 1) só é comparado com 120: 0, 1 ou 2 dão a mesma resposta"],
      ["packages/rele/scripts/demo/semeador.mjs:if (res.status === 429 && tentativa <= 12 && (retryAfter ?? 1) <= ESPERA_MAXIMA_NO_LUGAR_S) {|1->0@66",
        "o 1 de (retryAfter ?? 1) só é comparado com 120: 0, 1 ou 2 dão a mesma resposta"],
      ["packages/rele/scripts/demo/semeador.mjs:const espera = Math.min(30, Math.max(1, retryAfter || 1))|1->0@45",
        "Math.max(1, x) já é o piso de 1 segundo: trocar o 1 interno por 0 não muda o resultado (retryAfter || 0 cai no piso)"],
      ["packages/rele/scripts/demo/semeador.mjs:const espera = Math.min(30, Math.max(1, retryAfter || 1))|1->0@62",
        "Math.max(1, x) já é o piso de 1 segundo: trocar o 1 interno por 0 não muda o resultado (retryAfter || 0 cai no piso)"],
      ["packages/rele/scripts/demo/semeador.mjs:const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))|<-><=@158",
        "o comparador de chaves só é consultado pelo sinal negativo no sort do V8 (para chaves distintas): -1 contra 0, 2 ou <= dá a mesma ordem"],
      ["packages/rele/scripts/demo/semeador.mjs:const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))|1->2@166",
        "o comparador de chaves só é consultado pelo sinal negativo no sort do V8 (para chaves distintas): -1 contra 0, 2 ou <= dá a mesma ordem"],
      ["packages/rele/scripts/demo/semeador.mjs:const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))|1->2@170",
        "o comparador de chaves só é consultado pelo sinal negativo no sort do V8 (para chaves distintas): -1 contra 0, 2 ou <= dá a mesma ordem"],
      ["packages/rele/scripts/demo/semeador.mjs:const canon = (v) => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1))) : x))|1->0@170",
        "o comparador de chaves só é consultado pelo sinal negativo no sort do V8 (para chaves distintas): -1 contra 0, 2 ou <= dá a mesma ordem"],
      ["packages/rele/scripts/demo/semeador.mjs:relogio = () => Math.floor(Date.now() / 1000), fetchFn = fetch, esperar = dormir, intervaloMs = 130, registrar = () => {}|130->131@98",
        "afinação do ritmo padrão entre pedidos (130 ms): 129 ou 131 não muda nenhum comportamento observável"],
      ["packages/rele/scripts/demo/semeador.mjs:relogio = () => Math.floor(Date.now() / 1000), fetchFn = fetch, esperar = dormir, intervaloMs = 130, registrar = () => {}|130->129@98",
        "afinação do ritmo padrão entre pedidos (130 ms): 129 ou 131 não muda nenhum comportamento observável"],
      ["packages/rele/scripts/demo/semeador.mjs:rovers.set(r.slug, { ...r, ...chaves, cabeca: null, ultimoCriado: 0, estado: null, indice: {} })|0->1@70",
        "valor inicial de ultimoCriado: é sobrescrito pela hora da cabeça lida, pelo ledger ou por agora, e Math.max com o piso de agora menos 300 s anula 0 contra 1"],
      ["packages/rele/scripts/demo/semeador.mjs:r.ultimoCriado = ledger.rovers[r.slug]?.ultimoCriado ?? 0|0->1@60",
        "valor inicial de ultimoCriado: é sobrescrito pela hora da cabeça lida, pelo ledger ou por agora, e Math.max com o piso de agora menos 300 s anula 0 contra 1"],
      ["packages/rele/scripts/demo/semeador.mjs:if (primeiro) { r.ultimoCriado = Math.max(r.ultimoCriado, obj.criadoEm); primeiro = false }|false->true@90",
        "primeiro=false contra true: ultimoCriado já é o máximo (idempotente) e o ramo de cabeça ilegível exige a cabeça sem ledger, que o teste cobre"],
      ["packages/rele/scripts/demo/semeador.mjs:if (fase.adia?.includes(codigo) || (res.status === 429 && (res.retryAfter ?? 0) > ESPERA_MAXIMA_NO_LUGAR_S) || (res.status === 429 && codigo === 'limite_de_taxa')) {|0->1@81",
        "o 0 de (retryAfter ?? 0) só é comparado com 120: 0 e 1 dão a mesma resposta"],
      ["packages/rele/scripts/demo/semeador.mjs:if (tentarEm && (relatorio.proximaRodada === null || tentarEm < relatorio.proximaRodada)) relatorio.proximaRodada = tentarEm|<-><=@65",
        "< contra <=: com horas iguais o resultado atribuído é o mesmo valor"],
      ["packages/rele/scripts/demo/fases-03.mjs:chave: (i) => `${i[0]}|${i[1]}`,|0->1@23",
        "a chave do ledger já leva o autor como prefixo (autor|chave), e o pedaço trocado repete ou perde só o que o prefixo já distingue: a identidade do item não muda"],
      ["packages/rele/scripts/demo/fases-03.mjs:chave: (i) => `${i[0]}>${i[1]}`,|0->1@23",
        "a chave do ledger já leva o autor como prefixo (autor|chave), e o pedaço trocado repete ou perde só o que o prefixo já distingue: a identidade do item não muda"],
      ["packages/rele/scripts/demo/fases-03.mjs:chave: (i) => `${i[0]}>${i[1]}`,|1->2@31",
        "a chave do ledger já leva o autor como prefixo (autor|chave), e o pedaço trocado repete ou perde só o que o prefixo já distingue: a identidade do item não muda"],
      ["packages/rele/scripts/demo/fases-03.mjs:chave: (i) => `${i[0]}>${i[1]}`,|1->0@31",
        "a chave do ledger já leva o autor como prefixo (autor|chave), e o pedaço trocado repete ou perde só o que o prefixo já distingue: a identidade do item não muda"],
      ["packages/rele/scripts/demo/fases-03.mjs:chave: (i, ctx) => `${ctx.idDe(i[1])}|${i[0]}`,|0->1@46",
        "a chave do ledger já leva o autor como prefixo (autor|chave), e o pedaço trocado repete ou perde só o que o prefixo já distingue: a identidade do item não muda"],
      ["packages/rele/scripts/demo/fases-03.mjs:chave: (i, ctx) => `${ctx.idDe(i[1])}|${i[0]}`,|0->1@46",
        "a chave do ledger já leva o autor como prefixo (autor|chave), e o pedaço trocado repete ou perde só o que o prefixo já distingue: a identidade do item não muda"],
      ["packages/rele/scripts/demo/fases-03.mjs:chave: (i, ctx) => `${i[0]}>${ctx.uidDe(i[1])}|${i[2]}`,|0->1@28",
        "a chave do ledger já leva o autor como prefixo (autor|chave), e o pedaço trocado repete ou perde só o que o prefixo já distingue: a identidade do item não muda"],
      ["packages/rele/scripts/demo/fases-03.mjs:chave: (i, ctx) => `${i[0]}>${ctx.uidDe(i[1])}|${i[2]}`,|0->1@28",
        "a chave do ledger já leva o autor como prefixo (autor|chave), e o pedaço trocado repete ou perde só o que o prefixo já distingue: a identidade do item não muda"],
      ["packages/rele/scripts/semear-demo.mjs:const args = process.argv.slice(2)|2->1@32",
        "process.argv.slice(1) contra slice(2): o primeiro argumento extra é o caminho do script, que nunca é uma opção; valor() e includes() acham as mesmas opções"],
      ["packages/rele/scripts/semear-demo.mjs:url: url.origin, semente, simular, geracao, aceitarSemLedger: args.includes('--aceitar-sem-estado'), intervaloMs: Number(valor('--intervalo-ms') ?? 130), ledger, aoProgredir: gravar,|130->131@152",
        "afinação do ritmo padrão entre pedidos (130 ms)"],
      ["packages/rele/scripts/semear-demo.mjs:url: url.origin, semente, simular, geracao, aceitarSemLedger: args.includes('--aceitar-sem-estado'), intervaloMs: Number(valor('--intervalo-ms') ?? 130), ledger, aoProgredir: gravar,|130->129@152",
        "afinação do ritmo padrão entre pedidos (130 ms)"]
    ])
  },
  {
    rotulo: 'cliente/cliente',
    alvos: [{ arquivo: 'packages/cliente/src/cliente.js' }, { arquivo: 'packages/cliente/src/pessoa.js' }, { arquivo: 'packages/cliente/src/agente.js' }],
    // a bateria cobre todas as seções do cliente (0.3.2, imagens da 0.5.0, mensagens da 0.4.0, Retry-After); só ficam de fora os testes
    // que não exercitam comportamento do cliente (tipos, pacote) e os exemplos do skill, lentos e já cobertos pelos outros
    testes: ['test/cliente/retry-after.test.js', 'test/cliente/leitura-publica.test.js', 'test/cliente/social.test.js', 'test/cliente/cliente.test.js', 'test/cliente/pessoa.test.js',
      'test/cliente/midia.test.js', 'test/cliente/mensagens.test.js', 'test/cliente/mensagens-bordas.test.js', 'test/cliente/revisao.test.js', 'test/cliente/revisao-032.test.js', 'test/cliente/leitor-e-bin.test.js', 'test/cliente/agente.test.js'],
    sequencial: true,
    equivalentes: new Map([
      ['packages/cliente/src/pessoa.js:this.ultima = 0 // a política vale pela data: duas no mesmo segundo precisam de datas diferentes|0->1@18',
        'a política só usa `ultima` dentro de Math.max(hora, ultima + 1), e a hora real é de 1,7 bilhão de segundos: começar em 0 ou em 1 dá a mesma data na primeira política; só mudaria com relógio abaixo de 1 segundo, que o esquema recusa de qualquer jeito (instante mínimo 1.700.000.000)']
    ])
  },
  // ---------- 0.3.2 (proposta 0007) ----------
  {
    rotulo: 'protocolo/vocabulario',
    alvos: [
      { arquivo: `${P}/corpos-sociais.js`, desde: '// 0.3.2 (proposta 0007): vocabulário fechado de etiquetas', ate: 'categorias: ou_nulo(lista(categoria, { min: 1, max: L.categoriasPorStatus, unicos: true }))' },
      { arquivo: `${P}/corpos-sociais.js`, desde: "case 'comunidade-vocabulario': {", ate: 'tem rótulos repetidos' },
      { arquivo: `${P}/limites.js`, desde: 'const FORA_DAS_EXIGIVEIS', ate: '!FORA_DAS_EXIGIVEIS.includes(t)' }
    ],
    testes: [`${T}/social-vocabulario.test.js`, `${T}/social-esquemas.test.js`, `${T}/social-declaracoes.test.js`],
    equivalentes: new Map()
  },
  {
    rotulo: 'rele/social-pontos',
    alvos: [{ arquivo: `${R}/social-pontos.js` }],
    testes: [`${TR}/social-pontos.test.js`, `${TR}/social-ordem.test.js`, `${TR}/social-032-http.test.js`, `${TR}/social-forum.test.js`],
    sequencial: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'rele/social-anuncios',
    alvos: [{ arquivo: `${R}/social-anuncios.js` }],
    testes: [`${TR}/social-inicio.test.js`, `${TR}/social-032-http.test.js`],
    sequencial: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'rele/social-inicio',
    alvos: [{ arquivo: `${R}/social-inicio.js` }],
    testes: [`${TR}/social-inicio.test.js`, `${TR}/social-032-http.test.js`],
    sequencial: true,
    equivalentes: new Map([
      [R + '/social-inicio.js:inicio({ desde = 0, credencial = null }) {|0->1@19',
        'o relógio do relé nunca marca o segundo 0 nem o 1 (o carimbo é de 2020 em diante), então "desde" 0 ou 1 filtra o mesmo conjunto']
    ])
  },
  {
    rotulo: 'rele/vocabulario',
    alvos: [
      { arquivo: `${R}/social-escrita.js`, desde: '// ---------- 0.3.2: vocabulário e marcas (proposta 0007) ----------', ate: "depois: () => this.a.executar('UPDATE topicos SET etiquetas = :e, status = :s WHERE id = :id', { e: JSON.stringify(c.etiquetas), s: c.status, id: t.id })" },
      { arquivo: `${R}/social-base.js`, desde: '0.3.2 (proposta 0007): o vocabulário vigente', ate: 'return s !== undefined && (s.categorias === null' },
      { arquivo: `${R}/social-leitura.js`, desde: '  marcasDe(t) {', ate: 'return etiquetas.length > 0 || status !== null ? { marcas: { etiquetas, status } } : {}' }
    ],
    testes: [`${TR}/social-vocabulario.test.js`, `${TR}/social-032-http.test.js`, `${TR}/social-forum.test.js`, `${TR}/social-comunidade.test.js`],
    sequencial: true,
    equivalentes: new Map([
      [R + '/social-escrita.js:if (depois.length !== antes.length || status !== t.status) {|if-sempre-verdadeiro',
        'gravar sempre o UPDATE grava os mesmos valores quando nada mudou: idempotente, sem efeito observável (a condição só evita escrita à toa)']
    ])
  },
  {
    rotulo: 'rele/ordem',
    alvos: [
      { arquivo: `${R}/social-leitura.js`, desde: '  topicosDa(id, {', ate: '    return pagina' },
      { arquivo: `${R}/social-leitura.js`, desde: '  respostasDo(id, {', ate: '{ t: t.id, pai: paiId, antes, ...this.paramsDeVisibilidade(agora) }, limite, (l) => this._respostaForum(l)' },
      { arquivo: `${R}/social-leitura.js`, desde: '  respostasDaPostagem(id, {', ate: '{ post: post.id, antes, ...this.paramsDeVisibilidade(agora) }, limite, mapa' },
      { arquivo: `${R}/social-busca.js`, desde: "  buscar({ q, tipo = 'todos'", ate: 'ordem === \'em-alta\' ? janelaDe(janela) : null)' },
      { arquivo: `${R}/social-busca.js`, desde: '  _ordemDaBuscaDeTopicos(ordem, duracao) {', ate: "return 'bm25(busca, 0, 0, 0, 5.0, 1.0), t.id'" }
    ],
    testes: [`${TR}/social-ordem.test.js`, `${TR}/social-vocabulario.test.js`, `${TR}/social-032-http.test.js`, `${TR}/social-forum.test.js`, `${TR}/social-busca.test.js`, `${TR}/social-revisao.test.js`],
    sequencial: true,
    equivalentes: new Map()
  },
  {
    rotulo: 'rele/http-032',
    alvos: [
      { arquivo: `${R}/http.js`, desde: '// 0.3.2: um instante em segundos', ate: 'return Number(valor)' },
      { arquivo: `${R}/http.js`, desde: '// 0.3.2 (proposta 0007): o painel de início (credencial', ate: "'/v1/anuncios/:id'" },
      { arquivo: `${R}/http.js`, desde: '// 0.3.2 (proposta 0007): só o operador publica', ate: 'return [200, rele.social.removerAnuncio(m[1])]' }
    ],
    testes: [`${TR}/social-032-http.test.js`, `${TR}/social-revisao-http.test.js`],
    sequencial: true,
    equivalentes: new Map([
      [R + "/http.js:['GET', /^\\/v1\\/inicio$/, '/v1/inicio', (req, m, q) => [200, s.inicio({ desde: carimboDaQuery(q.get('desde'), { nome: 'desde', padrao: 0 }), credencial: cred(req) })]],|0->1@141",
        'mesmo motivo de social-inicio.js: sem "desde", 0 e 1 filtram o mesmo conjunto porque nenhum evento tem carimbo tão antigo']
    ])
  },
  // ---------- 0.4.0 (proposta 0004): mensagens privadas ----------
  {
    rotulo: 'protocolo/mensagens',
    alvos: [{ arquivo: `${P}/mensagens.js` }],
    testes: [`${T}/mensagens-bordas.test.js`, `${T}/mensagens.test.js`, 'test/cliente/mensagens.test.js'],
    sequencial: true,
    equivalentes: new Map([
      [P + '/mensagens.js:if (!cru) return null|guarda-desligada',
        'sem a guarda, `Buffer.concat` com null lança DENTRO do try logo abaixo, e o catch devolve o mesmo null; a guarda só deixa o motivo explícito'],
      [P + '/mensagens.js:if (!z || z.every((b) => b === 0)) throw new ErroDoProtocolo(\'chave_fraca\', { campo: \'chave\' })|0->1@33',
        'o OpenSSL já recusa a derivação X25519 que daria segredo todo zero (ERR_OSSL_FAILED_DURING_DERIVATION, caso provado em mensagens-bordas.test.js com a chave zero e a de ordem pequena), então z nunca chega aqui todo zero; a conferência fica como defesa para outro motor de cripto'],
      [P + '/mensagens.js:while (fim > 0 && claro[fim - 1] === 0x20) fim--|>->>=@12',
        'com fim 0, claro[-1] é undefined e o laço para do mesmo jeito'],
      [P + '/mensagens.js:while (fim > 0 && claro[fim - 1] === 0x20) fim--|0->1@15',
        'só muda quando o claro é TODO espaço: sobra " " em vez de "", e o JSON.parse recusa os dois (forma_do_claro nos dois casos, testado)']
    ])
  },
  {
    rotulo: 'rele/mensagens',
    alvos: [{ arquivo: `${R}/mensagens.js` }],
    testes: [`${TR}/mensagens-bordas.test.js`, `${TR}/mensagens.test.js`, `${TR}/mensagens-http.test.js`, 'test/cliente/mensagens.test.js'],
    sequencial: true,
    equivalentes: new Map([
      [R + '/mensagens.js:{ uid: leitor, estados: JSON.stringify(estados), antes, limite: limite + 1 }|1->2@79',
        'buscar uma linha a mais ainda serve para saber se há próxima página; a página devolvida e o cursor não mudam (o mesmo motivo de rele/rele)'],
      [R + '/mensagens.js:{ c: c.id, antes, limite: limite + 1 }|1->2@41',
        'idem, na página de mensagens']
    ])
  },
  {
    // a seção 0.4.0 do cliente de referência (cifra, conferência do que o relé serve, nova tentativa com a chave relida, leitura, denúncia)
    rotulo: 'cliente/mensagens',
    alvos: [{ arquivo: 'packages/cliente/src/cliente.js', desde: '// 0.4.0: mensagens privadas (PROTOCOLO.md seção 15)', ate: 'function consulta(params) {' }],
    testes: ['test/cliente/mensagens-bordas.test.js', 'test/cliente/mensagens.test.js'],
    sequencial: true,
    equivalentes: new Map()
  }
]
