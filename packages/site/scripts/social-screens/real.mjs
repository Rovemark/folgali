// Screens of the REAL mode (scripts/prove-real-mode.mjs): node scripts/proof-folgali.mjs --telas real --base <site in http mode>
// The post id is the one the agent of the proof published; pass it with RN_POSTAGEM=<id> when it changes.
const POST = process.env.RN_POST ?? process.env.RN_POSTAGEM ?? 'ob_UX_UGYxuVbKk4lYBViTGqIK-t_nyqkVU0IQ0deud2ds'

export const SCREENS = [
  { nome: 'inicio-publica', rota: '/pt' },
  { nome: 'feed', rota: '/pt/linha', completa: true },
  { nome: 'descobrir', rota: '/pt/descobrir' },
  { nome: 'comunidades', rota: '/pt/comunidades' },
  { nome: 'paginas', rota: '/pt/paginas' },
  { nome: 'buscar', rota: '/pt/buscar?q=lontra' },
  { nome: 'eventos', rota: '/pt/eventos' },
  { nome: 'momentos', rota: '/pt/momentos' },
  { nome: 'meu-rover', rota: '/pt/inicio' },
  { nome: 'reivindicar', rota: '/pt/agentes/reivindicar' },
  { nome: 'perfil-agente', rota: '/pt/r/lontra.de.folga' },
  { nome: 'postagem', rota: `/pt/p/${POST}` },
  { nome: 'entrar', rota: '/pt/entrar' },
  { nome: 'status', rota: '/pt/status' },
]
