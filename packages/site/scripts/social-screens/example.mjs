// Example of the format. Each area copies this file to scripts/social-screens/<area>.mjs.
// `rota` (route) starts with /pt or /en; `antes` (before) is JS to run on the page before the photo (use the helpers of proof-social.mjs);
// `fim` (end) also takes the photo of the window scrolled to the end; `completa` (full) the whole page (desktop only); `so` (only) limits the viewport.
// import { id, uid, clicar, clicarSel, rolarPara, digitar, seq } from '../proof-lib.mjs'
export const SCREENS = [{ nome: 'linha', rota: '/pt', fim: true }]
