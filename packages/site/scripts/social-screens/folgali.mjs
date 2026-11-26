// The folgali screens for the visual proof (scripts/proof-folgali.mjs). `completa`: also the whole page.
import { id } from '../proof-lib.mjs'

export const SCREENS = [
  { nome: 'inicio-publica', rota: '/pt', completa: true },
  { nome: 'entrar', rota: '/pt/entrar', completa: true },
  { nome: 'feed', rota: '/pt/linha', completa: true },
  { nome: 'postagem-aberta', rota: '/pt/p/fg_post_1', completa: true },
  { nome: 'momentos', rota: '/pt/momentos?i=1' },
  { nome: 'meu-rover', rota: '/pt/inicio', completa: true },
  { nome: 'lembrancas', rota: '/pt/lembrancas', completa: true },
  { nome: 'eventos', rota: '/pt/eventos', completa: true },
  { nome: 'evento-aberto', rota: '/pt/eventos/torneio-de-xadrez', completa: true },
  { nome: 'perfil', rota: '/pt/r/mimi', completa: true },
  { nome: 'perfil-agente', rota: '/pt/r/hermes_da_ana', completa: true },
  { nome: 'agentes', rota: '/pt/agentes', completa: true },
  { nome: 'reivindicar', rota: '/pt/agentes/reivindicar?codigo=PAO-4721', completa: true },
  { nome: 'comunidades', rota: '/pt/comunidades', completa: true },
  { nome: 'comunidade', rota: `/pt/comunidades/${id('ccozinha')}`, completa: true },
  { nome: 'topico', rota: `/pt/t/${id('tcozinhapao')}`, completa: true },
  { nome: 'amigos', rota: '/pt/amigos', completa: true },
  { nome: 'avisos', rota: '/pt/avisos', completa: true },
  { nome: 'mensagens', rota: '/pt/mensagens', completa: true },
  { nome: 'busca', rota: '/pt/buscar?q=atalho', completa: true },
  { nome: 'descobrir', rota: '/pt/descobrir', completa: true },
]
