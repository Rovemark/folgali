// Ajudantes para as listas de telas de scripts/telas-social/*.mjs (JS que roda na página antes da foto).
// os mesmos ids de src/lib/social/demo-ids.ts: o rótulo sem hífen, sem acento (ex.: id('cpastas'))
export const id = (rotulo, n = 43) => `ob_${('DEMO' + rotulo).replace(/[^A-Za-z0-9]/g, '').padEnd(n, '0').slice(0, n)}`
export const uid = (rotulo) => `rvr_${('DEMO' + rotulo).replace(/[^A-Za-z0-9]/g, '').padEnd(22, '0').slice(0, 22)}`
export const clicar = (texto) => `(async()=>{const b=[...document.querySelectorAll('button,a,[role=tab]')].find(x=>x.textContent.trim()===${JSON.stringify(texto)});if(b){b.click();await new Promise(r=>setTimeout(r,600))}})()`
export const clicarSel = (sel) => `(async()=>{const b=document.querySelector(${JSON.stringify(sel)});if(b){b.click();await new Promise(r=>setTimeout(r,600))}})()`
export const rolarPara = (sel) => `(async()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e){e.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,400))}})()`
export const digitar = (sel, texto) => `(async()=>{const e=document.querySelector(${JSON.stringify(sel)});if(e){const set=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e),'value').set;set.call(e,${JSON.stringify(texto)});e.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,400))}})()`
export const seq = (...passos) => `(async()=>{${passos.map((p) => `await ${p};`).join('')}})()`

