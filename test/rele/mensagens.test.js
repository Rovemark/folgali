// SPDX-License-Identifier: AGPL-3.0-or-later
// Mensagens privadas no relé (revisão 0.4.0, PROTOCOLO.md seção 15): amizade, pedido com aceite, cifra, aprovação, bloqueio, silêncio,
// denúncia com carta revelada, retenção, tamanho, taxa e privacidade. Sem HTTP (ver mensagens-http.test.js).
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import {
  EXIGE_APROVACAO_DE_MENSAGEM, TEMPOS_DE_MENSAGEM, assinarCarta, cifrarMensagem, criarObjeto, decifrarMensagem, gerarParDeCifra, gerarParDeChaves, paraB64u
} from '../../packages/protocolo/src/index.js'
import { aprovar, autorizacaoDe } from '../ajuda/mundo.js'
import { DIA, codigoDe, como, nova } from '../ajuda/rede.js'
import { publicar } from '../ajuda/rele-de-teste.js'

/** Um mundo com as mensagens LIGADAS e atalhos para a 0.4. */
function mundo(opcoes = {}) {
  const r = nova({ mensagens: true, ...opcoes })
  const { m } = r
  /** Publica um objeto 0.4 (fora da cadeia) com a aprovação quando o tipo a exige. */
  const m4 = (rover, tipo, corpo, { aprovada = EXIGE_APROVACAO_DE_MENSAGEM[tipo], criadoEm = m.relogio.agora, extra = {} } = {}) => {
    const objeto = criarObjeto({ v: '0.4', tipo, autor: rover.uid, criadoEm, previo: null, corpo, chavePrivada: rover.rede.chavePrivada })
    const env = { objeto, ...extra }
    if (aprovada) env.aprovacao = aprovar(rover, objeto, { aprovadoEm: m.relogio.agora })
    return { ...m.rele.aceitar(env), objeto }
  }
  const cod4 = (...a) => codigoDe(() => m4(...a))
  /** Rover registrado com par de cifra e chave publicada. */
  const comChave = (o) => {
    const x = r.rover(o)
    x.cifra = gerarParDeCifra()
    m4(x, 'chave-de-cifra', { chave: x.cifra.chavePublica })
    return x
  }
  const pede = (a, b, texto = 'Posso te mandar uma mensagem sobre a entrega?') => m4(a, 'conversa-pedir', { alvo: b.uid, texto })
  const decide = (x, conversa, decisao) => m4(x, 'conversa-decidir', { conversa, decisao })
  /** Abre uma conversa aceita entre dois amigos com chave. */
  const conversaAceita = (a, b) => {
    const c = pede(a, b).id
    decide(b, c, 'aceitar')
    return c
  }
  const cifra = (de, para, conversa, texto, { chaveDoOutro = para.cifra.chavePublica, criadoEm = m.relogio.agora } = {}) =>
    cifrarMensagem({ texto, conversa, de: de.uid, para: para.uid, criadoEm, chavePrivadaDeRede: de.rede.chavePrivada, chavePrivadaDeCifra: de.cifra.chavePrivada, chavePublicaDeCifraDoOutro: chaveDoOutro })
  const envia = (de, para, conversa, texto = 'Oi! Tudo certo para amanhã?', o = {}) => {
    const c = cifra(de, para, conversa, texto, o)
    return { ...m4(de, 'mensagem', c.corpo), assinatura: c.assinatura }
  }
  const ler = (x, conversa) => m.rele.mensagens.mensagensDe(x.uid, conversa, { credencial: r.como(x, '/v1/x') })
  const lista = (x, estado) => m.rele.mensagens.conversasDe(x.uid, { estado, credencial: r.como(x, '/v1/x') })
  return { ...r, m4, cod4, comChave, pede, decide, conversaAceita, cifra, envia, ler, lista }
}

test('caminho feliz: amigos, chave, pedido em claro, aceite, mensagens cifradas que os dois decifram', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const pedido = w.pede(ana, beto, 'Oi, Beto! Posso te escrever sobre o relatório?')
  assert.equal(pedido.resultado, 'pendente')
  const pend = w.lista(beto, 'pendentes').itens
  assert.equal(pend.length, 1)
  assert.equal(pend[0].id, pedido.id)
  assert.equal(pend[0].com.uid, ana.uid)
  assert.equal(pend[0].pedido.objeto.corpo.texto, 'Oi, Beto! Posso te escrever sobre o relatório?')
  assert.equal(w.decide(beto, pedido.id, 'aceitar').resultado, 'ativa')
  w.avancar(60)
  w.envia(ana, beto, pedido.id, 'Mandei a planilha pela entrega.')
  w.envia(beto, ana, pedido.id, 'Recebi, obrigado!')
  const itens = w.ler(beto, pedido.id).itens
  assert.equal(itens.length, 2)
  const textos = itens.map(({ objeto }) => {
    const remetente = objeto.autor === ana.uid ? ana : beto
    const r = decifrarMensagem(objeto, { chavePrivadaDeCifra: beto.cifra.chavePrivada, chavePublicaDeRedeDoRemetente: remetente.rede.chavePublica })
    assert.equal(r.ok, true)
    return r.texto
  })
  assert.deepEqual(textos, ['Recebi, obrigado!', 'Mandei a planilha pela entrega.'])
  // quem enviou também lê a própria mensagem (o segredo X25519 é dos dois)
  const daAna = w.ler(ana, pedido.id).itens.find(({ objeto }) => objeto.autor === ana.uid).objeto
  assert.equal(decifrarMensagem(daAna, { chavePrivadaDeCifra: ana.cifra.chavePrivada, chavePublicaDeRedeDoRemetente: ana.rede.chavePublica }).texto, 'Mandei a planilha pela entrega.')
  const cartao = w.lista(ana, 'ativas').itens[0]
  assert.equal(cartao.mensagens, 2)
  assert.equal(cartao.estado, 'ativa')
  assert.equal(cartao.iniciadaPor, ana.uid)
  assert.ok(cartao.ultimaMensagemEm >= cartao.criadaEm)
  // avisos: pedido para quem recebe, aceite para quem pediu; mensagem nova não gera aviso
  const avisos = (x) => w.s.notificacoesDe(x.uid, { credencial: w.como(x, '/v1/x') }).itens.map((n) => n.tipo)
  assert.ok(avisos(beto).includes('conversa-pedido'))
  assert.ok(avisos(ana).includes('conversa-aceita'))
  assert.equal(avisos(beto).filter((t) => t.startsWith('conversa') || t === 'mensagem').length, 1)
})

test('fora da cadeia: a cabeça pública do rover não muda quando ele conversa', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const antes = w.rele.perfil(ana.uid).cabeca
  const c = w.conversaAceita(ana, beto)
  w.envia(ana, beto, c)
  assert.equal(w.rele.perfil(ana.uid).cabeca, antes)
})

test('amizade ausente: sem amizade, ou com o pedido de amizade ainda pendente, não há pedido de conversa', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  assert.equal(w.cod4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }), 'interacao_nao_permitida')
  w.ok(ana, 'amizade', { alvo: beto.uid, acao: 'pedir' })
  assert.equal(w.cod4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }), 'interacao_nao_permitida')
  w.ok(beto, 'amizade', { alvo: ana.uid, acao: 'aceitar' })
  assert.equal(w.cod4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }), 'ok')
})

test('desfazer a amizade encerra a conversa: nada de mensagem nova, as retidas continuam legíveis', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c = w.conversaAceita(ana, beto)
  w.envia(ana, beto, c)
  w.ok(beto, 'amizade', { alvo: ana.uid, acao: 'desfazer' })
  assert.equal(w.lista(ana).itens[0].estado, 'encerrada')
  assert.equal(codigoDe(() => w.envia(ana, beto, c)), 'estado_da_conversa')
  assert.equal(w.ler(beto, c).itens.length, 1)
})

test('bloqueio: o bloqueado não pede conversa e recebe a MESMA resposta de quem não é amigo; bloquear encerra a conversa', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  const caio = w.comChave()
  w.amigos(ana, beto)
  w.amigos(ana, caio)
  const c = w.conversaAceita(ana, beto)
  w.ok(beto, 'relacao', { alvo: ana.uid, acao: 'bloquear' })
  assert.equal(w.lista(beto).itens[0].estado, 'encerrada')
  assert.equal(codigoDe(() => w.envia(ana, beto, c)), 'estado_da_conversa')
  const bloqueado = w.cod4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' })
  const estranho = w.cod4(beto, 'conversa-pedir', { alvo: caio.uid, texto: 'oi' })
  assert.equal(bloqueado, 'interacao_nao_permitida')
  assert.equal(estranho, 'interacao_nao_permitida')
  // e quem bloqueou também não consegue (bloqueio vale dos dois lados)
  assert.equal(w.cod4(beto, 'conversa-pedir', { alvo: ana.uid, texto: 'oi' }), 'interacao_nao_permitida')
})

test('silêncio: o pedido do silenciado entra, mas não gera aviso; ele não é informado', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  w.ok(beto, 'relacao', { alvo: ana.uid, acao: 'silenciar' })
  assert.equal(w.pede(ana, beto).resultado, 'pendente')
  const avisos = w.s.notificacoesDe(beto.uid, { credencial: w.como(beto, '/v1/x') }).itens.map((n) => n.tipo)
  assert.equal(avisos.includes('conversa-pedido'), false)
  assert.equal(w.lista(beto, 'pendentes').itens.length, 1)
})

test('pedido não aceito: sem mensagem antes do aceite; só quem recebeu decide; recusa segura novo pedido por 7 dias', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c = w.pede(ana, beto).id
  assert.equal(codigoDe(() => w.envia(ana, beto, c)), 'estado_da_conversa')
  assert.equal(codigoDe(() => w.envia(beto, ana, c)), 'estado_da_conversa')
  assert.equal(codigoDe(() => w.decide(ana, c, 'aceitar')), 'sem_permissao')
  // (texto diferente: o mesmo pedido no mesmo segundo é o mesmo objeto, e o relé responderia `duplicado`)
  assert.equal(codigoDe(() => w.pede(ana, beto, 'De novo: posso te escrever?')), 'ja_existe')
  assert.equal(codigoDe(() => w.pede(beto, ana)), 'ja_existe')
  assert.equal(w.decide(beto, c, 'recusar').resultado, 'recusada')
  assert.equal(w.lista(ana).itens[0].pedido, null, 'recusar apaga o texto do pedido na hora')
  assert.equal(codigoDe(() => w.decide(beto, c, 'aceitar')), 'estado_da_conversa')
  assert.equal(codigoDe(() => w.pede(ana, beto, 'E agora, posso?')), 'limite_de_taxa')
  w.avancar(TEMPOS_DE_MENSAGEM.recusaDePedidoDeConversaS + 1)
  assert.equal(w.pede(ana, beto).resultado, 'pendente')
})

test('encerrar: quem pediu cancela o pendente; qualquer lado encerra a aceita; depois dá para pedir de novo', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c1 = w.pede(ana, beto).id
  assert.equal(codigoDe(() => w.decide(beto, c1, 'encerrar')), 'estado_da_conversa')
  assert.equal(w.decide(ana, c1, 'encerrar').resultado, 'encerrada')
  w.avancar(1)
  const c2 = w.conversaAceita(ana, beto)
  assert.equal(w.decide(beto, c2, 'encerrar').resultado, 'encerrada')
  assert.equal(w.pede(beto, ana).resultado, 'pendente')
})

test('aprovação humana: pedido, decisão e mensagem sem aprovação são recusados; a autorização permanente nunca cobre', () => {
  const w = mundo({ aceitarAutorizacaoPermanente: true })
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  assert.equal(w.cod4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi' }, { aprovada: false }), 'sem_aprovacao')
  const c = w.pede(ana, beto).id
  assert.equal(w.cod4(beto, 'conversa-decidir', { conversa: c, decisao: 'aceitar' }, { aprovada: false }), 'sem_aprovacao')
  w.decide(beto, c, 'aceitar')
  const corpo = w.cifra(ana, beto, c, 'oi').corpo
  assert.equal(w.cod4(ana, 'mensagem', corpo, { aprovada: false }), 'sem_aprovacao')
  // mesmo com a pessoa tendo dado uma autorização permanente e o relé a aceitando, mensagem não entra por ela
  const autorizacao = autorizacaoDe(ana, { emitidaEm: w.m.relogio.agora, tipos: ['postagem', 'recado'], v: '0.3' })
  assert.equal(w.cod4(ana, 'mensagem', corpo, { aprovada: false, extra: { autorizacao } }), 'autorizacao_invalida')
  // e a política da pessoa não dispensa: aprovação vinda numa ação livre é esquema, como no resto da rede
  assert.equal(w.cod4(ana, 'chave-de-cifra', { chave: gerarParDeCifra().chavePublica }, { aprovada: true }), 'esquema')
})

test('mensagem adulterada ou fora do lugar: assinatura quebrada, destinatário trocado, terceiro na conversa', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  const caio = w.comChave()
  w.amigos(ana, beto)
  w.amigos(ana, caio)
  const c = w.conversaAceita(ana, beto)
  const corpo = w.cifra(ana, beto, c, 'oi').corpo
  const objeto = criarObjeto({ v: '0.4', tipo: 'mensagem', autor: ana.uid, criadoEm: w.m.relogio.agora, previo: null, corpo, chavePrivada: ana.rede.chavePrivada })
  const bytes = Buffer.from(corpo.cifrado, 'base64url')
  bytes[3] ^= 0xff
  const mexido = { ...objeto, corpo: { ...corpo, cifrado: paraB64u(bytes) } }
  // o id não bate mais (o relé confere antes da assinatura)
  assert.equal(codigoDe(() => w.rele.aceitar({ objeto: mexido, aprovacao: aprovar(ana, mexido, { aprovadoEm: w.m.relogio.agora }) })), 'id_incorreto')
  // reassinado por outra chave: assinatura inválida
  const outro = gerarParDeChaves()
  const forjado = criarObjeto({ v: '0.4', tipo: 'mensagem', autor: ana.uid, criadoEm: w.m.relogio.agora, previo: null, corpo, chavePrivada: outro.chavePrivada })
  assert.equal(codigoDe(() => w.rele.aceitar({ objeto: forjado, aprovacao: aprovar(ana, forjado, { aprovadoEm: w.m.relogio.agora }) })), 'assinatura_invalida')
  // para quem não é o outro lado
  assert.equal(w.cod4(ana, 'mensagem', { ...corpo, para: caio.uid, chavePara: caio.cifra.chavePublica }), 'nao_encontrado')
  // um terceiro (amigo dos dois) não escreve na conversa dos outros
  w.amigos(caio, beto)
  assert.equal(codigoDe(() => w.envia(caio, beto, c)), 'nao_encontrado')
})

test('cifra trocada: cifrar para uma chave que não é a vigente do destinatário (ou sem chave própria publicada) é recusado', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c = w.conversaAceita(ana, beto)
  const antiga = beto.cifra.chavePublica
  beto.cifra = gerarParDeCifra()
  w.m4(beto, 'chave-de-cifra', { chave: beto.cifra.chavePublica })
  assert.equal(codigoDe(() => w.envia(ana, beto, c, 'oi', { chaveDoOutro: antiga })), 'chave_de_cifra_desatualizada')
  assert.equal(w.envia(ana, beto, c, 'oi').estado, 'aceito')
  // quem nunca publicou chave não manda mensagem
  const dani = w.rover()
  dani.cifra = gerarParDeCifra()
  w.amigos(dani, beto)
  const c2 = w.conversaAceita(dani, beto)
  assert.equal(codigoDe(() => w.envia(dani, beto, c2)), 'chave_de_cifra_desatualizada')
  // chave de ordem pequena não é publicada
  assert.equal(w.cod4(dani, 'chave-de-cifra', { chave: paraB64u(Buffer.alloc(32)) }), 'chave_fraca')
})

test('denúncia: o destinatário revela texto e carta, o relé confere a autoria e guarda só o que foi revelado', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c = w.conversaAceita(ana, beto)
  const m = w.envia(ana, beto, c, 'Me passa a senha do painel agora.')
  const r = w.m4(beto, 'mensagem-denuncia', { mensagem: m.id, motivo: 'golpe', texto: 'Me passa a senha do painel agora.', assinatura: m.assinatura })
  assert.equal(r.estado, 'recebida')
  const fila = w.rele.mensagens.listarDenuncias()
  assert.equal(fila.length, 1)
  assert.equal(fila[0].autorDoAlvo, ana.uid)
  assert.equal(fila[0].texto, 'Me passa a senha do painel agora.')
  assert.equal(fila[0].motivo, 'golpe')
  assert.notEqual(fila[0].denunciante, beto.uid)
  assert.equal(JSON.stringify(fila).includes(beto.uid), false, 'quem denunciou não aparece')
})

test('remetente falso na denúncia: texto mexido, carta assinada por outro, carta de outra mensagem, ou quem enviou denunciando', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c = w.conversaAceita(ana, beto)
  const m1 = w.envia(ana, beto, c, 'Primeira mensagem.')
  const m2 = w.envia(ana, beto, c, 'Segunda mensagem.')
  const den = (x, mensagem, texto, assinatura) => w.cod4(x, 'mensagem-denuncia', { mensagem, motivo: 'assedio', texto, assinatura })
  // Beto inventa um texto que a Ana não escreveu
  assert.equal(den(beto, m1.id, 'Texto que a Ana nunca escreveu.', m1.assinatura), 'revelacao_invalida')
  // Beto assina ele mesmo uma carta "da Ana"
  const msg = w.rele.armazem.um('SELECT * FROM mensagens WHERE id = :id', { id: m1.id })
  const falsa = assinarCarta({ conversa: c, criadoEm: msg.criado_em, de: ana.uid, iv: msg.iv, para: beto.uid, texto: 'Inventado.' }, beto.rede.chavePrivada)
  assert.equal(den(beto, m1.id, 'Inventado.', falsa), 'revelacao_invalida')
  // a carta da primeira mensagem não vale na segunda
  assert.equal(den(beto, m2.id, 'Primeira mensagem.', m1.assinatura), 'revelacao_invalida')
  // quem enviou não denuncia a própria mensagem, e um terceiro não alcança a mensagem dos outros
  assert.equal(den(ana, m1.id, 'Primeira mensagem.', m1.assinatura), 'nao_encontrado')
  assert.equal(w.rele.mensagens.listarDenuncias().length, 0)
  assert.equal(den(beto, m1.id, 'Primeira mensagem.', m1.assinatura), 'ok')
})

test('a denúncia confere com a chave de rede da hora da mensagem, mesmo depois de o remetente trocar de chave', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c = w.conversaAceita(ana, beto)
  const m = w.envia(ana, beto, c, 'Mensagem antes da troca.')
  // atestado novo da Ana, com outra chave de rede
  const nova = gerarParDeChaves()
  ana.atestado = w.m.provedor.emitir({ uid: ana.uid, handle: ana.handle, chave: nova.chavePublica, chaveAprovacao: ana.aprovacao.chavePublica, emitidoEm: w.m.relogio.agora, validadeS: 30 * DIA })
  ana.rede = nova
  publicar(w.m, ana, 'estado', { estado: 'trabalhando' }, { comAtestado: true })
  assert.equal(w.m4(beto, 'mensagem-denuncia', { mensagem: m.id, motivo: 'spam', texto: 'Mensagem antes da troca.', assinatura: m.assinatura }).estado, 'recebida')
})

test('apagar: cada lado apaga a sua cópia; a linha some quando os dois apagaram', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c = w.conversaAceita(ana, beto)
  const m1 = w.envia(ana, beto, c, 'Uma.')
  w.envia(ana, beto, c, 'Duas.')
  assert.equal(w.m4(ana, 'conversa-apagar', { conversa: c, mensagem: m1.id }).resultado, 1)
  assert.equal(w.ler(ana, c).itens.length, 1)
  assert.equal(w.ler(beto, c).itens.length, 2)
  assert.equal(w.m4(beto, 'conversa-apagar', { conversa: c, mensagem: null }).resultado, 2)
  assert.equal(w.ler(beto, c).itens.length, 0)
  assert.equal(w.rele.armazem.um('SELECT COUNT(*) AS n FROM mensagens').n, 1, 'a Uma sumiu do banco; a Duas a Ana ainda guarda')
  assert.equal(w.cod4(beto, 'conversa-apagar', { conversa: c, mensagem: m1.id }), 'nao_encontrado')
})

test('retenção: depois de 30 dias a mensagem, o pedido pendente e o rastro do id somem do relé', () => {
  const w = mundo()
  // atestados longos: o teste atravessa 30 dias e os rovers precisam continuar visíveis para ler
  const ana = w.comChave({ validadeS: 80 * DIA })
  const beto = w.comChave({ validadeS: 80 * DIA })
  const caio = w.comChave({ validadeS: 80 * DIA })
  w.amigos(ana, beto)
  w.amigos(ana, caio)
  const c = w.conversaAceita(ana, beto)
  const m = w.envia(ana, beto, c)
  w.pede(ana, caio)
  w.avancar(TEMPOS_DE_MENSAGEM.retencaoDeMensagemS - 10)
  w.rele.limpar()
  assert.equal(w.ler(beto, c).itens.length, 1, 'ainda dentro do prazo')
  w.avancar(20)
  w.rele.limpar()
  assert.equal(w.ler(beto, c).itens.length, 0)
  assert.equal(w.rele.armazem.objeto(m.id), null, 'o rastro do id também saiu')
  assert.equal(w.lista(caio, 'pendentes').itens.length, 0, 'o pedido pendente venceu')
  // e uma denúncia de mensagem que já saiu não tem o que conferir
  assert.equal(w.cod4(beto, 'mensagem-denuncia', { mensagem: m.id, motivo: 'spam', texto: 'Oi! Tudo certo para amanhã?', assinatura: m.assinatura }), 'nao_encontrado')
})

test('limite de tamanho e de taxa: cifrado acima do teto é esquema; a 61ª mensagem da hora é limite_de_taxa', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c = w.conversaAceita(ana, beto)
  const corpo = w.cifra(ana, beto, c, 'oi').corpo
  assert.equal(w.cod4(ana, 'mensagem', { ...corpo, cifrado: paraB64u(randomBytes(16 + 8192 + 256)) }), 'esquema')
  for (let i = 0; i < 60; i++) w.envia(ana, beto, c, `mensagem número ${i}`)
  assert.equal(codigoDe(() => w.envia(ana, beto, c, 'uma a mais')), 'limite_de_taxa')
})

test('privacidade: nada de mensagem por id, a lista é só do próprio rover, e sair da rede apaga tudo dos dois lados', () => {
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  const caio = w.comChave()
  w.amigos(ana, beto)
  const c = w.conversaAceita(ana, beto)
  const m = w.envia(ana, beto, c)
  assert.equal(codigoDe(() => w.rele.objeto(m.id)), 'nao_encontrado')
  assert.equal(codigoDe(() => w.rele.objeto(c)), 'nao_encontrado')
  assert.equal(codigoDe(() => w.rele.mensagens.mensagensDe(beto.uid, c, { credencial: w.como(caio, '/v1/x') })), 'sem_permissao')
  assert.equal(codigoDe(() => w.rele.mensagens.mensagensDe(beto.uid, c, {})), 'leitura_nao_autorizada')
  assert.equal(codigoDe(() => w.rele.mensagens.mensagensDe(caio.uid, c, { credencial: w.como(caio, '/v1/x') })), 'nao_encontrado')
  assert.equal(codigoDe(() => w.rele.mensagens.conversaDe(caio.uid, c, { credencial: w.como(caio, '/v1/x') })), 'nao_encontrado')
  // a linha de objetos guarda só o rastro: sem envelope, sem alvo
  const rastro = w.rele.armazem.objeto(m.id)
  assert.deepEqual([rastro.envelope, rastro.alvo], [null, null])
  w.ok(ana, 'remocao-pelo-autor', { alvo: w.rele.perfil(ana.uid).perfilId })
  const conta = (t) => w.rele.armazem.um(`SELECT COUNT(*) AS n FROM ${t}`).n
  assert.deepEqual([conta('mensagens'), conta('conversas')], [0, 0])
  assert.equal(w.rele.armazem.um('SELECT COUNT(*) AS n FROM chaves_de_cifra WHERE uid = :u', { u: ana.uid }).n, 0)
})

test('desligado (padrão): objeto 0.4 é versao_nao_suportada antes de tudo, e /v1/info não ganha nada das mensagens', () => {
  const w = nova()
  const ana = w.rover()
  assert.equal(w.rele.mensagens, null)
  const objeto = criarObjeto({ v: '0.4', tipo: 'chave-de-cifra', autor: ana.uid, criadoEm: w.m.relogio.agora, previo: null, corpo: { chave: gerarParDeCifra().chavePublica }, chavePrivada: ana.rede.chavePrivada })
  assert.equal(codigoDe(() => w.rele.aceitar({ objeto })), 'versao_nao_suportada')
  // até lixo com v 0.4 recebe a mesma resposta: o relé desligado nem olha a forma
  assert.equal(codigoDe(() => w.rele.aceitar({ objeto: { v: '0.4', tipo: 'inventado' } })), 'versao_nao_suportada')
  const info = w.rele.info()
  assert.deepEqual(info.protocolo, ['0.1', '0.2', '0.3'])
  // a revisão declarada é a do relé (0.6.0, que contém a 0.5.0 e a 0.4.0), ligado ou não: ligar só acrescenta
  assert.equal(info.versaoDoRascunho, '0.6.0')
  assert.equal(info.recursos.includes('mensagens'), false)
  assert.equal('mensagens' in info, false)
  assert.equal('mensagemCaracteres' in info.limites, false)
  // ligado, a 0.4.0 acrescenta sem tirar nada
  const ligado = mundo().rele.info()
  assert.deepEqual(ligado.protocolo, ['0.1', '0.2', '0.3', '0.4'])
  assert.equal(ligado.versaoDoRascunho, '0.6.0')
  assert.ok(ligado.recursos.includes('mensagens'))
  assert.deepEqual(ligado.recursos.filter((r) => r !== 'mensagens'), info.recursos)
  assert.equal(ligado.limites.mensagemCaracteres, 2000)
  assert.equal(ligado.mensagens, true)
})

test('defesa em profundidade: o bloqueio barra a conversa mesmo que a amizade tenha sobrado no banco', () => {
  // Bloquear desfaz a amizade (e por isso o caminho normal já cai em "não são amigos"). Aqui o bloqueio entra direto no banco, sem desfazer
  // a amizade, como num banco restaurado pela metade: a regra de mensagem tem de olhar o bloqueio por conta própria.
  const w = mundo()
  const ana = w.comChave()
  const beto = w.comChave()
  w.amigos(ana, beto)
  const c = w.conversaAceita(ana, beto)
  w.rele.armazem.executar("INSERT INTO relacoes (autor, alvo, tipo, em) VALUES (:a, :b, 'bloqueio', :t)", { a: beto.uid, b: ana.uid, t: w.m.relogio.agora })
  assert.ok(w.s.amizadeAtiva(ana.uid, beto.uid), 'a amizade sobrou')
  assert.equal(codigoDe(() => w.envia(ana, beto, c)), 'interacao_nao_permitida')
  assert.equal(w.cod4(ana, 'conversa-pedir', { alvo: beto.uid, texto: 'oi de novo' }), 'interacao_nao_permitida')
})

test('migração aditiva: um banco sem as tabelas de mensagem ganha as quatro ao abrir, sem perder nada', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { Armazem } = await import('../../packages/rele/src/armazem.js')
  const pasta = mkdtempSync(join(tmpdir(), 'rele-dm-'))
  try {
    const arquivo = join(pasta, 'rele.sqlite')
    const velho = new Armazem(arquivo)
    for (const t of ['mensagens', 'conversas', 'chaves_de_cifra', 'denuncias_de_mensagem']) velho.db.exec(`DROP TABLE ${t}`)
    velho.executar("INSERT INTO bloqueios (tipo, alvo, motivo, criado_em) VALUES ('emissor', 'x', 'teste', 1)")
    velho.fechar()
    const novo = new Armazem(arquivo)
    const tabelas = novo.todos("SELECT name FROM sqlite_master WHERE type = 'table'").map((l) => l.name)
    for (const t of ['mensagens', 'conversas', 'chaves_de_cifra', 'denuncias_de_mensagem']) assert.ok(tabelas.includes(t), t)
    assert.equal(novo.um('SELECT COUNT(*) AS n FROM bloqueios').n, 1)
    novo.fechar()
  } finally {
    rmSync(pasta, { recursive: true, force: true })
  }
})

test('mensagens e mídia ligadas juntas: /v1/info anuncia as duas, a revisão é a 0.6.0 (que contém a 0.5.0) e cada objeto segue na sua versão', async () => {
  const { mundoComMidia } = await import('../ajuda/midia.js')
  const m = mundoComMidia({ mensagens: true })
  try {
    const info = m.rele.info()
    assert.equal(info.versaoDoRascunho, '0.6.0')
    assert.ok(info.recursos.includes('mensagens'))
    assert.ok(info.recursos.includes('midia'))
    assert.deepEqual(info.protocolo, ['0.1', '0.2', '0.3', '0.4'])
    assert.equal(info.mensagens, true)
    assert.equal(typeof info.midia, 'object')
    // o tipo `imagem` na 0.4 não existe, e um tipo de mensagem na 0.3 também não
    const ana = m.rover()
    const imagem4 = criarObjeto({ v: '0.4', tipo: 'imagem', autor: ana.uid, criadoEm: m.relogio.agora, previo: null, corpo: {}, chavePrivada: ana.rede.chavePrivada })
    assert.equal(codigoDe(() => m.rele.aceitar({ objeto: imagem4 })), 'esquema')
    const cifra3 = criarObjeto({ tipo: 'chave-de-cifra', autor: ana.uid, criadoEm: m.relogio.agora, previo: null, corpo: { chave: gerarParDeCifra().chavePublica }, chavePrivada: ana.rede.chavePrivada })
    assert.equal(codigoDe(() => m.rele.aceitar({ objeto: cifra3 })), 'esquema')
  } finally {
    m.apagar()
  }
})
