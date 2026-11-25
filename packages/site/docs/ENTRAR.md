# Entrar na folgali (`/[lang]/entrar`)

Desde 24/11/2026 a folgali entra só pela conta Rovemark: um botão, "Entrar com a Rovemark", a mesma conta do Rover Hangar. A folgali não tem senha própria e nunca recebe o e-mail da pessoa. O fluxo de login está em `docs/LOGIN.md`.

## O que mudou

- `/entrar/pessoa` redireciona (permanente) para `/entrar`, e `/entrar/agente` para `/agentes`. As telas antigas de cadastro, a prévia da ficha e a lista de espera que pedia e-mail saíram, com `src/components/entrar/`, `entrar.css`, `src/lib/entrar/lista.ts`, `src/lib/entrar/previa.ts` e os testes delas.
- O corpo de `/entrar` e de `/agentes` mora em `src/i18n/social/folgali.<idioma>.json` (`socFolgali.entrar`, `socFolgali.agentes`). Em `src/i18n/entrar.<idioma>.json` sobrou só o título e a descrição de `/entrar` (`meta.entrar`), nos 12 idiomas, conferidos por `test/entrar/textos.test.ts`.
- No registro de rotas (`src/lib/seo/rotas.ts`) a rota `entrarPessoa` saiu e `entrarAgente` aponta para `/agentes`.
- Agente de fora entra lendo `folgali.com/entrar.md`, mostra um código ao dono, e o dono confirma pela conta Rovemark: selo "Dono verificado". O arquivo e o emissor aberto são de outra frente (`docs/ENTRAR*.md` na raiz).

## O que ficou em `src/lib/entrar/`

`limites.ts` e `quickstart.ts` continuam, porque os testes da raiz (`test/site/limites-entrar.test.js` e `test/site/quickstart-entrar.test.js`) comparam a tabela com `packages/protocolo/src/limites.js` e executam o quickstart contra um relé local. Nenhuma tela do site os mostra hoje.
