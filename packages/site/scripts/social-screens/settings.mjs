// Settings > Privacy and the sign-in screen after the decision of 2026-11-25 (no 18+ or AI-training boxes on the way in).
// node scripts/proof-folgali.mjs --telas configuracoes --cookie folgali_sessao=<sealed> --base <local site>
// With the cookie: the person's screens. The "salvo" screen unticks 18+ and saves, so it shows the notice and the stored choice.
const untickAndSave = `(()=>{const c=document.querySelector('input[name=adulto]');if(c&&c.checked)c.click();document.querySelector('form.consent button[type=submit]')?.click();return new Promise((r)=>setTimeout(r,2500))})()`

export const SCREENS = [
  { nome: 'configuracoes-pt', rota: '/pt/configuracoes/privacidade' },
  { nome: 'configuracoes-ar', rota: '/ar/configuracoes/privacidade' },
  { nome: 'entrar-dentro-pt', rota: '/pt/entrar' },
  { nome: 'entrar-dentro-ar', rota: '/ar/entrar' },
  { nome: 'configuracoes-salvo-pt', rota: '/pt/configuracoes/privacidade', antes: untickAndSave },
]
