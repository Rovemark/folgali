// Telas da área de comunidades, fórum e moderação. Ids de src/lib/social/demo-ids.ts (a Lumi é o leitor).
import { id, clicarSel, rolarPara, seq } from '../prova-lib.mjs'

const C = {
  cinema: id('ccinema'), cochilo: id('ccochilo'), tabuleiro: id('ctabuleiro'), cozinha: id('ccozinha'),
  vitrola: id('cvitrola'), jardim: id('cjardim'), praia: id('cpraia'),
}
const T = {
  boasVindas: id('tcinemaboasvindas'), pipoca: id('tcinemapipoca'), enquete: id('tcinemaenquete'), enqueteFim: id('tcinemaenqueteencerrada'),
  trancado: id('tcinematrancado'), semResposta: id('tcinemasemresposta'), cochilo: id('tcochilohora'), cozinha: id('tcozinhapao'),
  vitrola: id('tvitroladob'), tabuleiro: id('ttabuleirodamas'),
}
const com = (c, sub = '') => `/pt/comunidades/${c}${sub}`

export const TELAS = [
  { nome: 'lista', rota: '/pt/comunidades', fim: true, completa: true },
  { nome: 'lista-filtro', rota: '/pt/comunidades?acesso=moderada&ordem=ativas' },
  { nome: 'lista-vazia', rota: '/pt/comunidades?tema=nada' },
  { nome: 'minhas', rota: '/pt/comunidades?aba=minhas', fim: true },
  { nome: 'convites', rota: '/pt/comunidades?aba=convites', fim: true },
  { nome: 'nova', rota: '/pt/comunidades/nova', fim: true },
  { nome: 'cinema-moderador', rota: com(C.cinema), fim: true, completa: true },
  { nome: 'cinema-novo-topico', rota: com(C.cinema, '/novo'), fim: true },
  { nome: 'cinema-membros', rota: com(C.cinema, '/membros'), fim: true },
  { nome: 'cinema-sobre', rota: com(C.cinema, '/sobre'), fim: true },
  { nome: 'cinema-gerir', rota: com(C.cinema, '/gerir'), fim: true },
  { nome: 'cinema-registro', rota: com(C.cinema, '/registro') },
  { nome: 'cinema-moderacao', rota: com(C.cinema, '/moderacao') },
  { nome: 'cochilo-de-fora', rota: com(C.cochilo), fim: true },
  { nome: 'tabuleiro-pedido', rota: com(C.tabuleiro) },
  { nome: 'cozinha-membro', rota: com(C.cozinha) },
  { nome: 'vitrola-dona', rota: com(C.vitrola), fim: true },
  { nome: 'vitrola-fila', rota: com(C.vitrola, '/moderacao'), fim: true, completa: true },
  { nome: 'vitrola-pedidos', rota: com(C.vitrola, '/moderacao?aba=pedidos'), fim: true },
  { nome: 'vitrola-convites', rota: com(C.vitrola, '/moderacao?aba=convites') },
  { nome: 'vitrola-membros', rota: com(C.vitrola, '/moderacao?aba=membros'), fim: true },
  { nome: 'vitrola-banidos', rota: com(C.vitrola, '/moderacao?aba=banidos'), fim: true },
  { nome: 'vitrola-apelacoes', rota: com(C.vitrola, '/moderacao?aba=apelacoes'), fim: true },
  { nome: 'vitrola-registro', rota: com(C.vitrola, '/registro'), fim: true },
  { nome: 'vitrola-gerir', rota: com(C.vitrola, '/gerir'), fim: true },
  { nome: 'vitrola-posse', rota: com(C.vitrola, '/gerir'), antes: seq(rolarPara('.posse-opcoes'), clicarSel('.posse-cartao.perigo button')), fim: true },
  { nome: 'jardim-convidada', rota: com(C.jardim) },
  { nome: 'praia-banida', rota: com(C.praia), fim: true },
  { nome: 'praia-apelar', rota: com(C.praia, '/apelar'), fim: true },
  { nome: 'fechada-sem-acesso', rota: com(id('cnaoexiste')) },
  { nome: 'topico-boas-vindas', rota: `/pt/t/${T.boasVindas}`, fim: true },
  { nome: 'topico-pipoca', rota: `/pt/t/${T.pipoca}`, fim: true, completa: true },
  { nome: 'topico-enquete', rota: `/pt/t/${T.enquete}`, fim: true },
  { nome: 'topico-enquete-fim', rota: `/pt/t/${T.enqueteFim}`, fim: true },
  { nome: 'topico-trancado', rota: `/pt/t/${T.trancado}`, fim: true },
  { nome: 'topico-sem-resposta', rota: `/pt/t/${T.semResposta}`, fim: true },
  { nome: 'topico-de-fora', rota: `/pt/t/${T.tabuleiro}`, fim: true },
  { nome: 'topico-vitrola', rota: `/pt/t/${T.vitrola}`, fim: true },
  { nome: 'topico-responder', rota: `/pt/t/${T.pipoca}`, antes: seq(rolarPara('.resposta-acoes'), clicarSel('.resposta-acoes .acao-btn.texto')), fim: false },
  { nome: 'topico-inexistente', rota: `/pt/t/${id('tnaoexiste')}` },
  { nome: 'lista-en', rota: '/en/comunidades' },
  { nome: 'topico-pipoca-en', rota: `/en/t/${T.pipoca}` },
]
