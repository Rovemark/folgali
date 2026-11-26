// Screens of the communities, forum and moderation area. Ids from src/lib/social/demo-ids.ts (Lumi is the reader).
import { id, clickSel, scrollTo, seq } from '../proof-lib.mjs'

const C = {
  cinema: id('ccinema'), cochilo: id('ccochilo'), tabuleiro: id('ctabuleiro'), cozinha: id('ccozinha'),
  vitrola: id('cvitrola'), jardim: id('cjardim'), praia: id('cpraia'),
}
const T = {
  welcome: id('tcinemaboasvindas'), pipoca: id('tcinemapipoca'), enquete: id('tcinemaenquete'), pollEnd: id('tcinemaenqueteencerrada'),
  trancado: id('tcinematrancado'), semResposta: id('tcinemasemresposta'), cochilo: id('tcochilohora'), cozinha: id('tcozinhapao'),
  vitrola: id('tvitroladob'), tabuleiro: id('ttabuleirodamas'),
}
const using = (c, sub = '') => `/pt/comunidades/${c}${sub}`

export const SCREENS = [
  { nome: 'lista', rota: '/pt/comunidades', fim: true, completa: true },
  { nome: 'lista-filtro', rota: '/pt/comunidades?acesso=moderada&ordem=ativas' },
  { nome: 'lista-vazia', rota: '/pt/comunidades?tema=nada' },
  { nome: 'minhas', rota: '/pt/comunidades?aba=minhas', fim: true },
  { nome: 'convites', rota: '/pt/comunidades?aba=convites', fim: true },
  { nome: 'nova', rota: '/pt/comunidades/nova', fim: true },
  { nome: 'cinema-moderador', rota: using(C.cinema), fim: true, completa: true },
  { nome: 'cinema-novo-topico', rota: using(C.cinema, '/novo'), fim: true },
  { nome: 'cinema-membros', rota: using(C.cinema, '/membros'), fim: true },
  { nome: 'cinema-sobre', rota: using(C.cinema, '/sobre'), fim: true },
  { nome: 'cinema-gerir', rota: using(C.cinema, '/gerir'), fim: true },
  { nome: 'cinema-registro', rota: using(C.cinema, '/registro') },
  { nome: 'cinema-moderacao', rota: using(C.cinema, '/moderacao') },
  { nome: 'cochilo-de-fora', rota: using(C.cochilo), fim: true },
  { nome: 'tabuleiro-pedido', rota: using(C.tabuleiro) },
  { nome: 'cozinha-membro', rota: using(C.cozinha) },
  { nome: 'vitrola-dona', rota: using(C.vitrola), fim: true },
  { nome: 'vitrola-fila', rota: using(C.vitrola, '/moderacao'), fim: true, completa: true },
  { nome: 'vitrola-pedidos', rota: using(C.vitrola, '/moderacao?aba=pedidos'), fim: true },
  { nome: 'vitrola-convites', rota: using(C.vitrola, '/moderacao?aba=convites') },
  { nome: 'vitrola-membros', rota: using(C.vitrola, '/moderacao?aba=membros'), fim: true },
  { nome: 'vitrola-banidos', rota: using(C.vitrola, '/moderacao?aba=banidos'), fim: true },
  { nome: 'vitrola-apelacoes', rota: using(C.vitrola, '/moderacao?aba=apelacoes'), fim: true },
  { nome: 'vitrola-registro', rota: using(C.vitrola, '/registro'), fim: true },
  { nome: 'vitrola-gerir', rota: using(C.vitrola, '/gerir'), fim: true },
  { nome: 'vitrola-posse', rota: using(C.vitrola, '/gerir'), antes: seq(scrollTo('.ownership-options'), clickSel('.ownership-card.danger button')), fim: true },
  { nome: 'jardim-convidada', rota: using(C.jardim) },
  { nome: 'praia-banida', rota: using(C.praia), fim: true },
  { nome: 'praia-apelar', rota: using(C.praia, '/apelar'), fim: true },
  { nome: 'fechada-sem-acesso', rota: using(id('cnaoexiste')) },
  { nome: 'topico-boas-vindas', rota: `/pt/t/${T.welcome}`, fim: true },
  { nome: 'topico-pipoca', rota: `/pt/t/${T.pipoca}`, fim: true, completa: true },
  { nome: 'topico-enquete', rota: `/pt/t/${T.enquete}`, fim: true },
  { nome: 'topico-enquete-fim', rota: `/pt/t/${T.pollEnd}`, fim: true },
  { nome: 'topico-trancado', rota: `/pt/t/${T.trancado}`, fim: true },
  { nome: 'topico-sem-resposta', rota: `/pt/t/${T.semResposta}`, fim: true },
  { nome: 'topico-de-fora', rota: `/pt/t/${T.tabuleiro}`, fim: true },
  { nome: 'topico-vitrola', rota: `/pt/t/${T.vitrola}`, fim: true },
  { nome: 'topico-responder', rota: `/pt/t/${T.pipoca}`, antes: seq(scrollTo('.reply-actions'), clickSel('.reply-actions .action-btn.text')), fim: false },
  { nome: 'topico-inexistente', rota: `/pt/t/${id('tnaoexiste')}` },
  { nome: 'lista-en', rota: '/en/comunidades' },
  { nome: 'topico-pipoca-en', rota: `/en/t/${T.pipoca}` },
]
