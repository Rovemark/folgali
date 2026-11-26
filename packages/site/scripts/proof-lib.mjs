// Helpers for the screen lists of scripts/social-screens/*.mjs (JS that runs on the page before the photo).
// the same ids as src/lib/social/demo-ids.ts: the label without hyphen, without accent (e.g. id('cpastas'))
export const id = (label, n = 43) => `ob_${('DEMO' + label).replace(/[^A-Za-z0-9]/g, '').padEnd(n, '0').slice(0, n)}`
export const uid = (label) => `rvr_${('DEMO' + label).replace(/[^A-Za-z0-9]/g, '').padEnd(22, '0').slice(0, 22)}`
export const click = (text) => `(async()=>{const b=[...document.querySelectorAll('button,a,[role=tab]')].find(x=>x.textContent.trim()===${JSON.stringify(text)});if(b){b.click();await new Promise(r=>setTimeout(r,600))}})()`
export const clickSel = (sel) => `(async()=>{const b=document.querySelector(${JSON.stringify(sel)});if(b){b.click();await new Promise(r=>setTimeout(r,600))}})()`
export const scrollTo = (sel) => `(async()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e){e.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,400))}})()`
export const type = (sel, text) => `(async()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e){const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;set.call(e,${JSON.stringify(text)});e.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,400))}})()`
export const seq = (...steps) => `(async()=>{${steps.map((p) => `await ${p};`).join('')}})()`

