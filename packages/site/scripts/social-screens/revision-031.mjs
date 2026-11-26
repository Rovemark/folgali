// Screens of revision 0.3.1 (new relay fields). Run: node scripts/proof-social.mjs --area revisao-031 --base http://127.0.0.1:3941
// The demonstration client declares the 13 resources of 0.3.1, so all the new screens appear. Lumi is the reader.
import { id, scrollTo } from '../proof-lib.mjs'

export const SCREENS = [
  // badges: the two Lumi already gave Nina have no button; the one for someone who has not completed 7 days of friendship says WHEN it can be given
  { nome: 'nina-selos-ja-dados', rota: '/pt/r/nina', antes: scrollTo('.pf-badge-list') },
  { nome: 'tuca-selo-data', rota: '/pt/r/tuca', antes: scrollTo('.pf-badge-list') },
  { nome: 'teco-selo-data', rota: '/pt/r/teco', antes: scrollTo('.pf-badge-list') },
  // follower and following counts on the sheet
  { nome: 'pipa-ficha-contagens', rota: '/pt/r/pipa', antes: scrollTo('.pf-counts') },
  // testimonials: what Lumi wrote and is awaiting acceptance, and how much time is left before writing
  { nome: 'lumi-depoimentos-enviados', rota: '/pt/r/lumi?aba=depoimentos', antes: scrollTo('.pf-enviados'), fim: true },
  { nome: 'teco-depoimento-data', rota: '/pt/r/teco?aba=depoimentos', antes: scrollTo('.pf-tabs'), fim: true },
  // what was removed (and appeal)
  { nome: 'avisos-removidos', rota: '/pt/avisos', antes: scrollTo('.pf-removidos'), fim: true },
  // community where Lumi was banned: days remaining, coming from the relay
  { nome: 'praia-banida-prazo', rota: `/pt/comunidades/${id('cpraia')}`, antes: scrollTo('.notice-community') },
  // moderation: dismiss a report, and the log with the dismissal
  { nome: 'moderacao-fila-dispensar', rota: `/pt/comunidades/${id('cvitrola')}/moderacao?aba=fila`, antes: scrollTo('.queue-item'), fim: true },
  // topic with reactions
  { nome: 'topico-reacoes', rota: `/pt/t/${id('tcinemapipoca')}`, antes: scrollTo('.topic-actions') },
  // pages: topic filter with the count
  { nome: 'paginas-temas', rota: '/pt/paginas', antes: scrollTo('.pg-filters') },
  // discover: people on the rise
  { nome: 'descobrir-pessoas', rota: '/pt/descobrir', antes: scrollTo('.vit-topicos') },
  { nome: 'descobrir-pessoas-pagina', rota: '/pt/descobrir', antes: scrollTo('.showcase-shelf') },
  // in English
  { nome: 'tuca-selo-data-en', rota: '/en/r/tuca', antes: scrollTo('.pf-badge-list') },
  { nome: 'avisos-removidos-en', rota: '/en/avisos', antes: scrollTo('.pf-removidos'), fim: true },
]
