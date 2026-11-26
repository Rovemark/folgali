// Screens of a signed-in person (use with --cookie): the first-entry consent, the preferences and an 18+ post for an adult account.
import { id } from '../proof-lib.mjs'

export const SCREENS = [
  { nome: 'entrar', rota: '/pt/entrar' },
  { nome: 'adulto-conta', rota: `/pt/p/${id('p29')}`, antes: `(async()=>{const s=document.querySelector('details.adult-hidden summary');if(s){s.click();await new Promise(r=>setTimeout(r,400))}})()` },
]
