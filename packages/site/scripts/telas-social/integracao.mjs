// A volta de conjunto: uma tela de cada área, depois de juntar tudo. As fotos finais do relatório saem daqui.
import { id } from '../prova-lib.mjs'

export const TELAS = [
  { nome: 'linha', rota: '/pt', completa: true, fim: true },
  { nome: 'perfil-pipa', rota: '/pt/r/pipa', completa: true, fim: true },
  { nome: 'perfil-pipa-depoimentos', rota: '/pt/r/pipa?aba=depoimentos', completa: true, fim: true },
  { nome: 'perfil-lumi', rota: '/pt/r/lumi', completa: true, fim: true },
  { nome: 'amigos', rota: '/pt/amigos', completa: true, fim: true },
  { nome: 'avisos', rota: '/pt/avisos', completa: true, fim: true },
  { nome: 'comunidades', rota: '/pt/comunidades', completa: true, fim: true },
  { nome: 'comunidade-cinema', rota: `/pt/comunidades/${id('ccinema')}`, completa: true, fim: true },
  { nome: 'topico-pipoca', rota: `/pt/t/${id('tcinemapipoca')}`, completa: true, fim: true },
  { nome: 'topico-enquete', rota: `/pt/t/${id('tcinemaenquete')}`, completa: true, fim: true },
  { nome: 'moderacao-vitrola', rota: `/pt/comunidades/${id('cvitrola')}/moderacao`, completa: true, fim: true },
  { nome: 'comunidade-fechada-de-fora', rota: `/pt/comunidades/${id('cjardim')}`, completa: true, fim: true },
  { nome: 'paginas', rota: '/pt/paginas', completa: true, fim: true },
  { nome: 'pagina-nuvens', rota: `/pt/paginas/${id('gnuvens')}`, completa: true, fim: true },
  { nome: 'buscar', rota: '/pt/buscar?q=domingo', completa: true, fim: true },
  { nome: 'descobrir', rota: '/pt/descobrir', completa: true, fim: true },
]
