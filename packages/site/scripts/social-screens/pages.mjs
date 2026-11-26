// Screens of the "pages" area: project pages, search, discover, mixed timeline and the relay registry.
import { id, clickSel, scrollTo, seq } from '../proof-lib.mjs'

const CLOUDS = id('gnuvens')
const MARSH = id('gmarshmallow')
const DIC = id('gdisco')
const COFFEE = id('gcafe')

export const SCREENS = [
  { nome: 'linha', rota: '/pt', fim: true, completa: true },
  { nome: 'linha-en', rota: '/en' },
  { nome: 'paginas', rota: '/pt/paginas', fim: true, completa: true },
  { nome: 'paginas-ativas', rota: '/pt/paginas?ordem=ativas&tema=nuvens' },
  { nome: 'paginas-minhas', rota: '/pt/paginas?aba=minhas' },
  { nome: 'paginas-sigo', rota: '/pt/paginas?aba=sigo' },
  { nome: 'paginas-nova', rota: '/pt/paginas/nova', fim: true },
  { nome: 'pagina-seguida', rota: `/pt/paginas/${CLOUDS}`, fim: true, completa: true },
  { nome: 'pagina-visitante', rota: `/pt/paginas/${MARSH}`, fim: true },
  { nome: 'pagina-dono', rota: `/pt/paginas/${DIC}`, fim: true, completa: true },
  { nome: 'pagina-dono-publicar', rota: `/pt/paginas/${DIC}`, antes: seq(clickSel('.pg-publish summary'), scrollTo('.pg-publish')), fim: true },
  { nome: 'pagina-admin', rota: `/pt/paginas/${COFFEE}`, fim: true },
  { nome: 'pagina-seguidores', rota: `/pt/paginas/${CLOUDS}?aba=seguidores`, fim: true },
  { nome: 'pagina-gerir', rota: `/pt/paginas/${DIC}?aba=gerir`, fim: true, completa: true },
  { nome: 'pagina-gerir-admin', rota: `/pt/paginas/${COFFEE}?aba=gerir`, fim: true },
  { nome: 'pagina-gerir-negado', rota: `/pt/paginas/${MARSH}?aba=gerir`, antes: scrollTo('.empty'), fim: true },
  { nome: 'pagina-menu-dono', rota: `/pt/paginas/${CLOUDS}`, antes: seq(clickSel('.upd summary')) },
  { nome: 'pagina-nao-existe', rota: `/pt/paginas/${id('naoexiste')}` },
  { nome: 'busca-inicio', rota: '/pt/buscar', fim: true },
  { nome: 'busca-tudo', rota: '/pt/buscar?q=domingo', fim: true, completa: true },
  { nome: 'busca-rovers', rota: '/pt/buscar?q=pi&tipo=rovers' },
  { nome: 'busca-comunidades', rota: '/pt/buscar?q=cozinha&tipo=comunidades' },
  { nome: 'busca-topicos', rota: '/pt/buscar?q=pipoca&tipo=topicos', fim: true },
  { nome: 'busca-paginas', rota: '/pt/buscar?q=nuvens&tipo=paginas' },
  { nome: 'busca-tag', rota: '/pt/buscar?q=%23pipoca', fim: true },
  { nome: 'busca-vazia', rota: '/pt/buscar?q=zzzzzz' },
  { nome: 'busca-curta', rota: '/pt/buscar?q=a' },
  { nome: 'descobrir', rota: '/pt/descobrir', fim: true, completa: true },
  { nome: 'descobrir-7d', rota: '/pt/descobrir?janela=7d' },
  { nome: 'registro-rele', rota: '/pt/moderacao', fim: true },
  { nome: 'paginas-en', rota: '/en/paginas' },
  { nome: 'pagina-en', rota: `/en/paginas/${DIC}` },
  { nome: 'busca-en', rota: '/en/buscar?q=domingo' },
  { nome: 'descobrir-en', rota: '/en/descobrir' },
  { nome: 'erro-fora-do-ar', rota: '/pt/r/fora_do_ar' },
]
