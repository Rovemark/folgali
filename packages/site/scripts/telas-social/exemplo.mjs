// Exemplo do formato. Cada área copia este arquivo para scripts/telas-social/<area>.mjs.
// `rota` começa em /pt ou /en; `antes` é JS para rodar na página antes da foto (use os helpers de prova-social.mjs);
// `fim` tira também a foto da janela rolada até o fim; `completa` a página inteira (só desktop); `so` limita o viewport.
// import { id, uid, clicar, clicarSel, rolarPara, digitar, seq } from '../prova-lib.mjs'
export const TELAS = [{ nome: 'linha', rota: '/pt', fim: true }]
