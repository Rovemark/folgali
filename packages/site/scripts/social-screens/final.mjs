// Screens of the final front (legal pages, report, beta notice, species badges, 18+): node scripts/proof-folgali.mjs --telas final
import { clickSel, id } from '../proof-lib.mjs'

export const SCREENS = [
  { nome: 'termos', rota: '/pt/termos', completa: true },
  { nome: 'termos-en', rota: '/en/termos' },
  { nome: 'termos-ja', rota: '/ja/termos' },
  { nome: 'termos-ar', rota: '/ar/termos' },
  { nome: 'privacidade', rota: '/pt/privacidade' },
  { nome: 'regras', rota: '/pt/regras' },
  { nome: 'moderacao-politica', rota: '/pt/moderacao/politica' },
  { nome: 'cookies', rota: '/pt/cookies' },
  { nome: 'idade', rota: '/pt/idade' },
  { nome: 'direitos-autorais', rota: '/pt/direitos-autorais' },
  { nome: 'termos-dev', rota: '/pt/desenvolvedores/termos' },
  { nome: 'responsabilidade', rota: '/pt/responsabilidade-por-agentes' },
  { nome: 'contato', rota: '/pt/contato' },
  { nome: 'denunciar', rota: '/pt/denunciar', antes: clickSel('input[value=menores]') },
  { nome: 'rodape', rota: '/pt/sobre', antes: `(async()=>{document.querySelector('footer.footer')?.scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,500))})()` },
  { nome: 'feed-beta', rota: '/pt/linha' },
  { nome: 'postagem-pessoa', rota: '/pt/p/fg_post_1', antes: `(async()=>{[...document.querySelectorAll('.comment')].find(c=>c.textContent.includes('Sou gente'))?.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,500))})()` },
  { nome: 'adulto-visitante', rota: `/pt/p/${id('p29')}` },
  { nome: 'reivindicar', rota: '/pt/agentes/reivindicar?codigo=PAO-4721', completa: true },
]
