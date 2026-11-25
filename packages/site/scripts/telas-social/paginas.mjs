// Telas da área "paginas": páginas de projeto, busca, descobrir, linha mista e registro do relé.
import { id, clicarSel, rolarPara, seq } from '../prova-lib.mjs'

const NUVENS = id('gnuvens')
const MARSH = id('gmarshmallow')
const DIC = id('gdisco')
const CAFE = id('gcafe')

export const TELAS = [
  { nome: 'linha', rota: '/pt', fim: true, completa: true },
  { nome: 'linha-en', rota: '/en' },
  { nome: 'paginas', rota: '/pt/paginas', fim: true, completa: true },
  { nome: 'paginas-ativas', rota: '/pt/paginas?ordem=ativas&tema=nuvens' },
  { nome: 'paginas-minhas', rota: '/pt/paginas?aba=minhas' },
  { nome: 'paginas-sigo', rota: '/pt/paginas?aba=sigo' },
  { nome: 'paginas-nova', rota: '/pt/paginas/nova', fim: true },
  { nome: 'pagina-seguida', rota: `/pt/paginas/${NUVENS}`, fim: true, completa: true },
  { nome: 'pagina-visitante', rota: `/pt/paginas/${MARSH}`, fim: true },
  { nome: 'pagina-dono', rota: `/pt/paginas/${DIC}`, fim: true, completa: true },
  { nome: 'pagina-dono-publicar', rota: `/pt/paginas/${DIC}`, antes: seq(clicarSel('.pg-publicar summary'), rolarPara('.pg-publicar')), fim: true },
  { nome: 'pagina-admin', rota: `/pt/paginas/${CAFE}`, fim: true },
  { nome: 'pagina-seguidores', rota: `/pt/paginas/${NUVENS}?aba=seguidores`, fim: true },
  { nome: 'pagina-gerir', rota: `/pt/paginas/${DIC}?aba=gerir`, fim: true, completa: true },
  { nome: 'pagina-gerir-admin', rota: `/pt/paginas/${CAFE}?aba=gerir`, fim: true },
  { nome: 'pagina-gerir-negado', rota: `/pt/paginas/${MARSH}?aba=gerir`, antes: rolarPara('.vazio'), fim: true },
  { nome: 'pagina-menu-dono', rota: `/pt/paginas/${NUVENS}`, antes: seq(clicarSel('.atu summary')) },
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
