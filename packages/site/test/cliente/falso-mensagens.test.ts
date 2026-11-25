// Mensagens privadas no cliente falso (revisão 0.4.0, docs/PROTOCOLO.md seção 15): as mesmas regras do relé, provadas pelo lado da
// demonstração. Só amigos, pedido com aceite, bloqueio que não se revela, estados, cada lado apaga a sua cópia, denúncia só do
// destinatário, retenção de 30 dias, limites de tamanho e de ritmo.
import { describe, expect, it } from 'vitest'
import { ClienteHttp } from '@/lib/cliente-http'
import { idDeDemonstracao } from '@/lib/dominio/ids'
import { aprovarSocial, analisarSocial, bloqueiaSocial, saidaDaRedeSocial, type Campos } from '@/lib/dominio/aprovacao-social'
import { validarAto } from '@/lib/dominio/ato'
import { caminhoDepoisDePublicar } from '@/lib/dominio/fila-aprovacao'
import { CONVERSAS } from '@/lib/social/falso/semente-mensagens'
import { acoesDaConversa, atividadeDe } from '@/lib/social/mensagens'
import { AGORA, Relogio, U, cliente, codigo, como } from './ajuda-social'

const DIA = 86_400_000
const HORA = 3_600_000
/** Texto de exatamente `n` caracteres, com espaços (sequência longa sem espaço cai no filtro de segredo, de propósito). */
const texto = (n: number) => `${'abcd '.repeat(Math.ceil(n / 5))}`.slice(0, n - 1) + 'z'
const lumi = U('lumi')

describe('a semente: uma conversa de cada estado, e só o próprio rover lê as suas', () => {
  it('pendente recebida, pendente enviada, aberta, encerrada e uma com mensagem ilegível', async () => {
    const { c } = cliente()
    const todas = (await c.conversas(lumi)).itens
    const por = (id: string) => todas.find((x) => x.id === id)!
    expect(todas).toHaveLength(5)
    expect(por(CONVERSAS.nina)).toMatchObject({ estado: 'pendente', iniciadaPor: U('nina'), com: { handle: 'nina' } })
    expect(por(CONVERSAS.max)).toMatchObject({ estado: 'pendente', iniciadaPor: lumi })
    expect(por(CONVERSAS.pipa)).toMatchObject({ estado: 'ativa', mensagens: 4 })
    expect(por(CONVERSAS.tuca)).toMatchObject({ estado: 'encerrada', mensagens: 2, pedido: null })
    const teco = await c.mensagensDaConversa(lumi, CONVERSAS.teco)
    expect(teco.itens.at(-1)).toMatchObject({ texto: null, minha: false })
    // a mais recente primeiro
    const ordem = todas.map(atividadeDe)
    expect([...ordem].sort().reverse()).toEqual(ordem)
  })
  it('o filtro de estado é o da rota (pendentes, ativas, todas)', async () => {
    const { c } = cliente()
    expect((await c.conversas(lumi, { estado: 'pendentes' })).itens.map((x) => x.id).sort()).toEqual([CONVERSAS.max, CONVERSAS.nina].sort())
    expect((await c.conversas(lumi, { estado: 'ativas' })).itens.map((x) => x.id).sort()).toEqual([CONVERSAS.teco, CONVERSAS.pipa].sort())
  })
  it('leitura própria: as conversas de outro rover são `sem-permissao`, e conversa de outros é `nao-encontrado`', async () => {
    const { c } = cliente()
    expect(await codigo(() => c.conversas(U('pipa')))).toBe('sem-permissao')
    const { r } = como('max')
    expect(await codigo(() => r.conversa(U('max'), CONVERSAS.pipa))).toBe('nao-encontrado')
    expect(await codigo(() => r.mensagensDaConversa(U('max'), CONVERSAS.pipa))).toBe('nao-encontrado')
  })
})

describe('pedir conversa: só amigos, sem bloqueio, um pedido por par', () => {
  it('caminho feliz: o pedido aprovado vira conversa pendente com o texto em claro', async () => {
    const { r } = como('lumi')
    // Lumi e Max: já há pedido. Lumi e Teco: já conversam. Uma amiga nova para o teste:
    r.amizades.push({ a: lumi, b: U('zeca'), desde: AGORA.getTime() - 3 * DIA })
    const id = r.criar(lumi, 'conversa-pedir', { alvo: U('zeca'), texto: 'Zeca, posso perguntar da trilha por aqui?' })
    const conv = await r.conversa(lumi, id)
    expect(conv).toMatchObject({ estado: 'pendente', iniciadaPor: lumi, pedido: { texto: 'Zeca, posso perguntar da trilha por aqui?' } })
  })
  it('sem amizade e com bloqueio dão a MESMA resposta (o bloqueado não descobre)', async () => {
    const { r } = como('lumi')
    const semAmizade = await codigo(() => r.criar(lumi, 'conversa-pedir', { alvo: U('lola'), texto: 'Oi' }))
    r.amizades.push({ a: lumi, b: U('bento'), desde: 0 }) // amigos, mas a Lumi bloqueou o Bento na semente
    const bloqueado = await codigo(() => r.criar(U('bento'), 'conversa-pedir', { alvo: lumi, texto: 'Oi' }))
    expect(semAmizade).toBe('interacao-nao-permitida')
    expect(bloqueado).toBe(semAmizade)
  })
  it('já há conversa pendente ou aberta entre os dois: `ja-existe`, em qualquer direção', async () => {
    const { r } = como('lumi')
    expect(await codigo(() => r.criar(lumi, 'conversa-pedir', { alvo: U('pipa'), texto: 'De novo?' }))).toBe('ja-existe')
    expect(await codigo(() => r.criar(U('max'), 'conversa-pedir', { alvo: lumi, texto: 'Pode falar' }))).toBe('ja-existe')
  })
  it('depois de uma recusa, o mesmo autor espera 7 dias', async () => {
    const rel = new Relogio()
    const { r } = como('max', rel)
    expect(r.executar(U('max'), { tipo: 'conversa-decidir', conversa: CONVERSAS.max, decisao: 'recusar' })).toEqual({ resultado: 'recusada' })
    expect((r.bdConversas.find((x) => x.id === CONVERSAS.max)!).pedido).toBeNull()
    expect(await codigo(() => r.criar(lumi, 'conversa-pedir', { alvo: U('max'), texto: 'E agora?' }))).toBe('limite')
    rel.avancar(7 * DIA + 1000)
    expect(await codigo(() => r.criar(lumi, 'conversa-pedir', { alvo: U('max'), texto: 'E agora?' }))).toBe('ok')
  })
  it('ritmo: 5 pedidos por hora', async () => {
    const { r } = como('lumi')
    const amigos = ['zeca', 'lola', 'seixo', 'juju', 'mimi', 'otto']
    for (const s of amigos) r.amizades.push({ a: lumi, b: U(s), desde: 0 })
    const res = []
    for (const s of amigos) res.push(await codigo(() => r.criar(lumi, 'conversa-pedir', { alvo: U(s), texto: 'Oi' })))
    expect(res).toEqual(['ok', 'ok', 'ok', 'ok', 'ok', 'limite'])
  })
})

describe('decidir o pedido', () => {
  it('só quem recebeu aceita; aceitar abre a conversa; quem pediu só cancela', async () => {
    const { r } = como('lumi')
    expect(await codigo(() => r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSAS.max, decisao: 'aceitar' }))).toBe('sem-permissao')
    expect(r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSAS.nina, decisao: 'aceitar' })).toEqual({ resultado: 'ativa' })
    expect(await codigo(() => r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSAS.nina, decisao: 'aceitar' }))).toBe('interacao-nao-permitida')
    expect(r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSAS.max, decisao: 'encerrar' })).toEqual({ resultado: 'encerrada' })
  })
  it('quem não é um dos lados não vê a conversa', async () => {
    const { r } = como('lumi')
    expect(await codigo(() => r.executar(U('lola'), { tipo: 'conversa-decidir', conversa: CONVERSAS.nina, decisao: 'aceitar' }))).toBe('nao-encontrado')
  })
  it('aceitar exige a amizade ainda ativa', async () => {
    const { r } = como('lumi')
    r.amizades.splice(r.amizades.findIndex((a) => (a.a === lumi && a.b === U('nina')) || (a.b === lumi && a.a === U('nina'))), 1)
    expect(await codigo(() => r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSAS.nina, decisao: 'aceitar' }))).toBe('interacao-nao-permitida')
  })
})

describe('mensagens', () => {
  it('caminho feliz: depois do aceite, a mensagem aprovada entra no histórico dos dois', async () => {
    const { r } = como('lumi')
    r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSAS.nina, decisao: 'aceitar' })
    r.criar(U('nina'), 'mensagem', { conversa: CONVERSAS.nina, texto: 'Amanhã às dez?' })
    r.criar(lumi, 'mensagem', { conversa: CONVERSAS.nina, texto: 'Fechado.' })
    const h = (await r.mensagensDaConversa(lumi, CONVERSAS.nina)).itens
    expect(h.map((m) => [m.texto, m.minha])).toEqual([['Amanhã às dez?', false], ['Fechado.', true]])
  })
  it('conversa pendente ou encerrada não recebe mensagem; quem está fora não escreve', async () => {
    const { r } = como('lumi')
    expect(await codigo(() => r.criar(U('nina'), 'mensagem', { conversa: CONVERSAS.nina, texto: 'Oi?' }))).toBe('interacao-nao-permitida')
    expect(await codigo(() => r.criar(lumi, 'mensagem', { conversa: CONVERSAS.tuca, texto: 'Oi?' }))).toBe('interacao-nao-permitida')
    expect(await codigo(() => r.criar(U('lola'), 'mensagem', { conversa: CONVERSAS.pipa, texto: 'Oi?' }))).toBe('nao-encontrado')
  })
  it('bloquear depois do aceite trava a conversa, com a mesma resposta de "não são amigos"', async () => {
    const { r } = como('lumi')
    r.bdRelacoes.set(r.chave(U('pipa'), lumi), { relacao: 'bloqueio', desde: 0 })
    expect(await codigo(() => r.criar(lumi, 'mensagem', { conversa: CONVERSAS.pipa, texto: 'Oi?' }))).toBe('interacao-nao-permitida')
  })
  it('apagar a própria cópia some só deste lado; os dois apagando, a mensagem sai do armazém', async () => {
    const { r } = como('lumi')
    const m = r.bdMensagens.find((x) => x.conversa === CONVERSAS.pipa && x.de === U('pipa'))!
    r.executar(lumi, { tipo: 'conversa-apagar', conversa: CONVERSAS.pipa, mensagem: m.id })
    expect((await r.mensagensDaConversa(lumi, CONVERSAS.pipa)).itens.map((x) => x.id)).not.toContain(m.id)
    expect(r.bdMensagens.find((x) => x.id === m.id)).toMatchObject({ apagadaPeloDestinatario: true, apagadaPeloRemetente: false })
    r.executar(U('pipa'), { tipo: 'conversa-apagar', conversa: CONVERSAS.pipa, mensagem: m.id })
    expect(r.bdMensagens.find((x) => x.id === m.id)).toBeUndefined()
    // apagar tudo: só as do lado de quem pede
    r.executar(lumi, { tipo: 'conversa-apagar', conversa: CONVERSAS.pipa, mensagem: null })
    expect((await r.mensagensDaConversa(lumi, CONVERSAS.pipa)).itens).toEqual([])
    expect(r.bdMensagens.filter((x) => x.conversa === CONVERSAS.pipa).length).toBeGreaterThan(0)
  })
  it('retenção: 30 dias depois de recebida, a mensagem some; a conversa encerrada sem mensagens some junto', async () => {
    const rel = new Relogio()
    const { r } = como('lumi', rel)
    // a mais nova da Pipa tem 3 horas: avançando 30 dias menos 4 horas, só ela fica
    rel.avancar(30 * DIA - 4 * HORA)
    expect((await r.mensagensDaConversa(lumi, CONVERSAS.pipa)).itens.map((m) => m.texto)).toEqual(['Seria "A Nuvem Que Não Decidiu", com trilha de violão. Deixei a lista de nomes no seu mural também.'])
    expect((await r.conversas(lumi)).itens.map((c) => c.id)).not.toContain(CONVERSAS.tuca)
    expect((await r.conversas(lumi)).itens.map((c) => c.id)).toContain(CONVERSAS.nina)
    // duas horas depois, o pedido pendente da Nina (3 horas antes do começo) passa dos 30 dias e some
    rel.avancar(2 * HORA)
    expect((await r.conversas(lumi)).itens.map((c) => c.id)).not.toContain(CONVERSAS.nina)
    expect((await r.mensagensDaConversa(lumi, CONVERSAS.pipa)).itens).toEqual([])
  })
  it('ritmo: 60 mensagens por hora', async () => {
    const { r } = como('lumi')
    const res = new Set<string>()
    for (let i = 0; i < 61; i++) res.add(await codigo(() => r.criar(lumi, 'mensagem', { conversa: CONVERSAS.pipa, texto: `n ${i}` })))
    expect([...res]).toEqual(['ok', 'limite'])
  })
})

describe('denúncia de mensagem', () => {
  it('o destinatário revela o texto ao operador, uma vez por mensagem; o remetente não denuncia a própria', async () => {
    const { r } = como('lumi')
    const recebida = r.bdMensagens.find((x) => x.conversa === CONVERSAS.pipa && x.de === U('pipa'))!
    const minha = r.bdMensagens.find((x) => x.conversa === CONVERSAS.pipa && x.de === lumi)!
    expect(r.executar(lumi, { tipo: 'mensagem-denuncia', mensagem: recebida.id, motivo: 'assedio' })).toEqual({})
    r.executar(lumi, { tipo: 'mensagem-denuncia', mensagem: recebida.id, motivo: 'spam' })
    expect(r.denunciasDeMensagem).toEqual([{ mensagem: recebida.id, autorDoAlvo: U('pipa'), motivo: 'assedio', texto: recebida.texto, em: AGORA.getTime() }])
    expect(JSON.stringify(r.denunciasDeMensagem)).not.toContain(lumi)
    expect(await codigo(() => r.executar(lumi, { tipo: 'mensagem-denuncia', mensagem: minha.id, motivo: 'spam' }))).toBe('nao-encontrado')
  })
  it('a ilegível não tem texto para revelar', async () => {
    const { r } = como('lumi')
    const ilegivel = r.bdMensagens.find((x) => x.texto === null)!
    expect(await codigo(() => r.executar(lumi, { tipo: 'mensagem-denuncia', mensagem: ilegivel.id, motivo: 'spam' }))).toBe('invalido')
  })
})

describe('aprovação: pedido e mensagem passam pela fila, com os limites do protocolo', () => {
  const rasc = (tipo: 'conversa-pedir' | 'mensagem', texto: string) => ({
    id: 'rsc_x', tipo, rover: { uid: lumi, handle: 'lumi', nome: 'Lumi', rosto: { corpo: 'bolinha', cor: '#fff', acessorios: [] } }, destino: { rotulo: 'x' },
    campos: (tipo === 'mensagem' ? { conversa: CONVERSAS.pipa, texto } : { alvo: U('nina'), texto }) as Campos, criadoEm: AGORA.toISOString(), versao: 1, estado: 'pendente' as const,
  })
  it('pedido: até 280 caracteres e sem link; mensagem: até 2000 e até 2 links', () => {
    expect(bloqueiaSocial(analisarSocial(rasc('conversa-pedir', texto(280))))).toBe(false)
    expect(bloqueiaSocial(analisarSocial(rasc('conversa-pedir', texto(281))))).toBe(true)
    expect(bloqueiaSocial(analisarSocial(rasc('conversa-pedir', 'veja https://exemplo.org/a')))).toBe(true)
    expect(bloqueiaSocial(analisarSocial(rasc('mensagem', texto(2000))))).toBe(false)
    expect(bloqueiaSocial(analisarSocial(rasc('mensagem', texto(2001))))).toBe(true)
    expect(bloqueiaSocial(analisarSocial(rasc('mensagem', 'veja https://exemplo.org/a')))).toBe(false)
  })
  it('o filtro de dado pessoal vale antes de cifrar (o relé não vê o texto)', () => {
    expect(bloqueiaSocial(analisarSocial(rasc('mensagem', 'Escreva para maria@exemplo.com')))).toBe(true)
  })
  it('na mensagem privada, menção e tag não avisam ninguém', () => {
    const s = saidaDaRedeSocial({ tipo: 'mensagem', campos: { conversa: CONVERSAS.pipa, texto: 'Fala com @nina sobre #mapas' } })
    expect(s.efeitos.mencoes).toEqual([])
    expect(s.efeitos.tags).toEqual([])
    expect(saidaDaRedeSocial({ tipo: 'recado', campos: { alvo: U('nina'), texto: 'Fala com @nina sobre #mapas' } }).efeitos.mencoes).toEqual(['nina'])
  })
  it('aprovar o rascunho de mensagem publica pela ponte, e depois de publicar a pessoa volta para a conversa', async () => {
    const { c } = cliente()
    const r = await c.propor('mensagem', { conversa: CONVERSAS.pipa, texto: 'Mando a lista amanhã.' }, { rotulo: 'conversa com @pipa' })
    const res = await c.aprovarSocial(r.id, r.versao)
    expect(res.ok).toBe(true)
    expect((await c.mensagensDaConversa(lumi, CONVERSAS.pipa)).itens.at(-1)).toMatchObject({ texto: 'Mando a lista amanhã.', minha: true })
    expect(caminhoDepoisDePublicar({ ...r, tipo: 'mensagem' }, res.ok ? res.objetoId : undefined)).toBe(`/mensagens/${CONVERSAS.pipa}`)
    expect(caminhoDepoisDePublicar({ ...r, tipo: 'conversa-pedir', campos: { alvo: U('nina'), texto: 'x' } }, 'ob_x')).toBe('/mensagens/ob_x')
    expect(aprovarSocial({ ...r, estado: 'aprovado' }, r.versao, AGORA).ok).toBe(false)
  })
})

describe('quem pode o quê, e o que chega do navegador', () => {
  it('acoesDaConversa segue os estados', () => {
    expect(acoesDaConversa({ estado: 'pendente', iniciadaPor: U('nina') }, lumi)).toEqual({ aceitar: true, recusar: true, cancelar: false, encerrar: false, escrever: false })
    expect(acoesDaConversa({ estado: 'pendente', iniciadaPor: lumi }, lumi)).toEqual({ aceitar: false, recusar: false, cancelar: true, encerrar: false, escrever: false })
    expect(acoesDaConversa({ estado: 'ativa', iniciadaPor: lumi }, lumi)).toMatchObject({ escrever: true, encerrar: true })
    expect(acoesDaConversa({ estado: 'encerrada', iniciadaPor: lumi }, lumi)).toEqual({ aceitar: false, recusar: false, cancelar: false, encerrar: false, escrever: false })
  })
  it('validarAto aceita só a forma certa dos três atos novos', () => {
    const ob = idDeDemonstracao('ob', 'x')
    expect(validarAto({ tipo: 'conversa-decidir', conversa: ob, decisao: 'aceitar', extra: 1 })).toEqual({ tipo: 'conversa-decidir', conversa: ob, decisao: 'aceitar' })
    expect(validarAto({ tipo: 'conversa-decidir', conversa: ob, decisao: 'bloquear' })).toBeNull()
    expect(validarAto({ tipo: 'conversa-apagar', conversa: ob, mensagem: null })).toEqual({ tipo: 'conversa-apagar', conversa: ob, mensagem: null })
    expect(validarAto({ tipo: 'conversa-apagar', conversa: ob, mensagem: 'lixo' })).toBeNull()
    expect(validarAto({ tipo: 'mensagem-denuncia', mensagem: ob, motivo: 'golpe' })).toEqual({ tipo: 'mensagem-denuncia', mensagem: ob, motivo: 'golpe' })
    expect(validarAto({ tipo: 'mensagem-denuncia', mensagem: ob, motivo: 'qualquer' })).toBeNull()
  })
  it('o cliente HTTP do site não lê conversa nenhuma (não tem a chave nem a credencial do rover) e nem chama a rota', async () => {
    let chamou = false
    const http = new ClienteHttp({ base: 'http://127.0.0.1:9', buscar: (async () => { chamou = true; throw new Error('não devia chamar') }) as unknown as typeof fetch })
    expect(await codigo(() => http.conversas(lumi))).toBe('versao-nao-suportada')
    expect(await codigo(() => http.conversa(lumi, CONVERSAS.pipa))).toBe('versao-nao-suportada')
    expect(await codigo(() => http.mensagensDaConversa(lumi, CONVERSAS.pipa))).toBe('versao-nao-suportada')
    expect(chamou).toBe(false)
  })
})

describe('avisos de conversa (0.4.0): só quem pediu ou aceitou, nunca o texto do pedido', () => {
  const doTipo = async (r: { notificacoes: (u: string) => Promise<{ itens: { tipo: string; origem: { handle: string } | null; objeto: string | null }[] }> }, uid: string, tipo: string) =>
    (await r.notificacoes(uid)).itens.filter((n) => n.tipo === tipo)
  it('a semente: a Lumi tem o aviso do pedido da Nina e o do Teco, sem objeto e sem o texto', async () => {
    const { c } = cliente()
    const avisos = await doTipo(c, lumi, 'conversa-pedido')
    expect(avisos.map((n) => n.origem?.handle).sort()).toEqual(['nina', 'teco'])
    for (const n of avisos) expect(n.objeto).toBeNull()
    expect(JSON.stringify((await c.notificacoes(lumi)).itens)).not.toContain('revisão das traduções')
  })
  it('pedir avisa o alvo (`conversa-pedido`, origem = quem pediu); aceitar avisa quem pediu (`conversa-aceita`)', async () => {
    const { r } = como('zeca')
    r.amizades.push({ a: lumi, b: U('zeca'), desde: AGORA.getTime() - 3 * DIA })
    const id = r.criar(lumi, 'conversa-pedir', { alvo: U('zeca'), texto: 'Zeca, posso perguntar da trilha por aqui?' })
    const [pedido] = await doTipo(r, U('zeca'), 'conversa-pedido')
    expect(pedido).toMatchObject({ origem: { handle: 'lumi' }, objeto: null })
    expect(JSON.stringify(pedido)).not.toContain('trilha')
    expect(r.bdNotificacoes.filter((n) => n.destino === lumi && n.tipo === 'conversa-aceita' && n.origem === U('zeca'))).toHaveLength(0)
    expect(r.executar(U('zeca'), { tipo: 'conversa-decidir', conversa: id, decisao: 'aceitar' })).toEqual({ resultado: 'ativa' })
    const aceita = r.bdNotificacoes.filter((n) => n.destino === lumi && n.tipo === 'conversa-aceita')
    expect(aceita.map((n) => [n.origem, n.objeto])).toEqual([[U('zeca'), null]])
    // mensagem nova não gera aviso (o cliente compara `ultimaMensagemEm` com o que já mostrou)
    const antes = r.bdNotificacoes.length
    r.criar(U('zeca'), 'mensagem', { conversa: id, texto: 'Pode perguntar.' })
    expect(r.bdNotificacoes.length).toBe(antes)
  })
  it('recusar não avisa ninguém; quem silenciou a origem não recebe o aviso do pedido', async () => {
    const { r } = como('lumi')
    const antes = r.bdNotificacoes.length
    expect(r.executar(lumi, { tipo: 'conversa-decidir', conversa: CONVERSAS.nina, decisao: 'recusar' })).toEqual({ resultado: 'recusada' })
    expect(r.bdNotificacoes.length).toBe(antes)
    // a Lumi silenciou o Pingo na semente: o pedido entra, o aviso não
    r.amizades.push({ a: lumi, b: U('pingo'), desde: 0 })
    r.criar(U('pingo'), 'conversa-pedir', { alvo: lumi, texto: 'Oi, Lumi.' })
    expect((await r.conversas(lumi, { estado: 'pendentes' })).itens.some((c) => c.com.handle === 'pingo')).toBe(true)
    expect(r.bdNotificacoes.length).toBe(antes)
  })
  it('cliente HTTP: o relé com mensagens ligadas manda os dois avisos e a lista os traz, sem texto; tipo desconhecido segue fora do contrato', async () => {
    const aviso = (seq: number, tipo: string, extra: Record<string, unknown> = {}) => ({ seq, tipo, em: 1_793_000_000 + seq, origem: null, objeto: null, comunidade: null, pagina: null, ...extra })
    const responder = (corpo: unknown) => (async () => new Response(JSON.stringify(corpo), { status: 200, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch
    const corpo = { itens: [aviso(3, 'conversa-pedido', { texto: 'segredo do pedido' }), aviso(2, 'recado'), aviso(1, 'conversa-aceita')], proximo: null }
    const http = new ClienteHttp({ base: 'http://127.0.0.1:9', buscar: responder(corpo), credencial: async () => 'Rover-Assinatura x' })
    const p = await http.notificacoes(lumi)
    expect(p.itens.map((n) => [n.seq, n.tipo])).toEqual([[3, 'conversa-pedido'], [2, 'recado'], [1, 'conversa-aceita']])
    expect(JSON.stringify(p)).not.toContain('segredo do pedido')
    const estranho = new ClienteHttp({ base: 'http://127.0.0.1:9', buscar: responder({ itens: [aviso(1, 'conversa-nova-demais')], proximo: null }), credencial: async () => 'Rover-Assinatura x' })
    expect(await codigo(() => estranho.notificacoes(lumi))).not.toBe('ok')
  })
})
