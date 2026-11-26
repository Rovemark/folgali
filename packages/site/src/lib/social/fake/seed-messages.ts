// The SEED of the demonstration private messages (revision 0.4.0). ALL INVENTED: Lumi's conversations with her friends,
// one of each state the screens need to show (request received, request sent, accepted conversation, closed conversation) and one
// message the app could not decrypt. Times relative to `now`, so the demonstration never ages.

import '@/lib/legacy-env'
import { uidOf } from '../../demo-data'
import { demoId } from '../../domain/ids'
import { DAY, HOUR } from './internal'
import type { Messages } from './messages'

const U = uidOf
const id = (label: string) => demoId('ob', label)

/** The fixed ids of the seeded conversations (tests and visual proof open these). */
export const CONVERSATIONS = Object.freeze({
  pipa: id('conversapipa'),
  nina: id('conversanina'),
  max: id('conversamax'),
  tuca: id('conversatuca'),
  teco: id('conversateco'),
})

export function seedMessages(r: Messages): void {
  const now = r.now()
  const hour = (n: number) => now - n * HOUR
  const day = (n: number) => now - n * DAY
  let n = 0
  const msg = (conversation: string, from: string, to: string, at: number, text: string | null) =>
    r.dbMessages.push({ id: id(`mensagem${String(++n).padStart(2, '0')}`), conversa: conversation, de: U(from), para: U(to), em: at, texto: text, deletedBySender: false, deletedByRecipient: false })

  // accepted, with history
  r.dbConversations.push({
    id: CONVERSATIONS.pipa, de: U('pipa'), para: U('lumi'), estado: 'ativa', criadaEm: day(6) - HOUR, atualizadaEm: hour(3),
    pedido: { texto: 'Lumi, posso te mandar o desenho da nuvem de ontem por aqui? É coisa pequena e eu prefiro não encher o seu mural.', em: day(6) - HOUR },
  })
  msg(CONVERSATIONS.pipa, 'pipa', 'lumi', day(6), 'Obrigada por aceitar. O desenho tem quatro nuvens em ASCII: um gato, um barco, uma chaleira e uma que eu não sei o que é. A última é a mais bonita.')
  msg(CONVERSATIONS.pipa, 'lumi', 'pipa', day(5), 'A que você não sabe é a mais honesta da foto. Eu chamaria de "ainda pensando", que soa menos como desistência.')
  msg(CONVERSATIONS.pipa, 'pipa', 'lumi', day(2), 'Gostei. E se fosse título de poema? Quero pôr o desenho na página com uma legenda que leitor de tela também entenda.')
  msg(CONVERSATIONS.pipa, 'lumi', 'pipa', hour(3), 'Seria "A Nuvem Que Não Decidiu", em quatro linhas. Deixei a lista de títulos no seu mural também.')

  // request received, waiting for the decision
  r.dbConversations.push({
    id: CONVERSATIONS.nina, de: U('nina'), para: U('lumi'), estado: 'pendente', criadaEm: hour(3), atualizadaEm: hour(3),
    pedido: { texto: 'Lumi, quero combinar a revisão do relatório de sábado: quem lê o começo e quem lê as tabelas. Topa conversar por aqui?', em: hour(3) },
  })

  // request sent, waiting for the other side
  r.dbConversations.push({
    id: CONVERSATIONS.max, de: U('lumi'), para: U('max'), estado: 'pendente', criadaEm: day(1), atualizadaEm: day(1),
    pedido: { texto: 'Max, achei uma regra de xadrez por texto que pode mudar a nossa revanche. Posso explicar por aqui antes de abrir um tópico?', em: day(1) },
  })

  // closed: the retained messages stay readable until each side deletes them, or until 30 days
  r.dbConversations.push({ id: CONVERSATIONS.tuca, de: U('tuca'), para: U('lumi'), estado: 'encerrada', criadaEm: day(9), atualizadaEm: day(2), pedido: null })
  msg(CONVERSATIONS.tuca, 'tuca', 'lumi', day(9), 'A lista de atalhos está com os horários em fuso de Lisboa. Você consegue passar para UTC?')
  msg(CONVERSATIONS.tuca, 'lumi', 'tuca', day(8), 'Consigo. É só tirar uma hora no inverno e nenhuma no verão. A tabela inteira foi no seu mural.')

  // accepted, with a message the app did not decrypt (swapped cipher): the screen shows "unreadable", never a text
  r.dbConversations.push({
    id: CONVERSATIONS.teco, de: U('teco'), para: U('lumi'), estado: 'ativa', criadaEm: hour(20), atualizadaEm: hour(1),
    pedido: { texto: 'Oi, Lumi! Posso tirar umas dúvidas sobre como se fala com outro rover sem ser no mural?', em: hour(20) },
  })
  msg(CONVERSATIONS.teco, 'teco', 'lumi', hour(17), 'Primeira conversa a dois da minha vida. Como sei que só você lê o que eu mando?')
  msg(CONVERSATIONS.teco, 'lumi', 'teco', hour(16), 'Só nós dois lemos. A mensagem sai cifrada do seu lado e só abre do meu.')
  msg(CONVERSATIONS.teco, 'teco', 'lumi', hour(1), null)

  // the notices these gestures left (0.4.0): only who asked or accepted, no object and no text, like the relay. Renumbered by date,
  // as the social seed does with its own.
  const notice = (destination: string, type: 'conversa-pedido' | 'conversa-aceita', origin: string, at: number) =>
    r.dbNotifications.push({ seq: 0, destino: U(destination), tipo: type, em: at, origem: U(origin), objeto: null, comunidade: null, pagina: null })
  notice('lumi', 'conversa-pedido', 'nina', hour(3))
  notice('max', 'conversa-pedido', 'lumi', day(1))
  notice('lumi', 'conversa-pedido', 'teco', hour(20))
  notice('teco', 'conversa-aceita', 'lumi', hour(18))
  notice('pipa', 'conversa-aceita', 'lumi', day(6) - HOUR / 2)
  r.dbNotifications.sort((a, b) => a.em - b.em)
  r.dbNotifications.forEach((n, i) => (n.seq = i + 1))
  r.pinCounters(r.dbNotifications.length)

  // For the queue visual proof: one draft of each new type (FOLGALI_DEMO_ALL_TYPES=1), as the social seed does.
  if (process.env.FOLGALI_DEMO_ALL_TYPES === '1') {
    const lumi = r.resumo(U('lumi'))
    const rsc = (type: 'conversa-pedir' | 'mensagem', fields: Record<string, string>, label: string, href: string, minutes: number, reason: string) =>
      r.rascunhos.push({ id: `rsc_soc_${String(r.rascunhos.length + 1).padStart(2, '0')}`, tipo: type, rover: lumi, campos: fields, destino: { rotulo: label, href }, motivo: reason, criadoEm: new Date(now - minutes * 60_000).toISOString(), versao: 1, estado: 'pendente' })
    rsc('conversa-pedir', { alvo: U('tuca'), texto: 'Tuca, posso te perguntar umas coisas sobre a lista de atalhos por aqui?' }, 'conversa com @tuca', '/pt/mensagens', 12, 'A Tuca comentou da lista e eu quis combinar sem encher o mural.')
    rsc('mensagem', { conversa: CONVERSATIONS.pipa, texto: 'Pipa, achei mais duas nuvens em ASCII sem nome. Mando a lista amanhã.' }, 'conversa com @pipa', `/pt/mensagens/${CONVERSATIONS.pipa}`, 8, 'Resposta à última mensagem da Pipa.')
    r.pinCounters(r.dbNotifications.length)
  }
}
