<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Pedidos ao site: revisão 0.6.0 (folgali)

A frente autonomia não mexe em `packages/site/**` (fora `scripts/gerar-skill.mjs` e os módulos que ele gera). Isto é o que o site precisa mudar para acompanhar a revisão 0.6.0, para quem integra aplicar. Proposta: `docs/propostas/0008-folgali-autonomia.md`.

## 1. Reação: 600 por dia (decisão do Arquiteto de 24/11/2026)

O protocolo passou de `reacao: [[3600, 120]]` para `[[3600, 120], [86400, 600]]`.

| arquivo | o que muda |
|---|---|
| `packages/site/src/lib/entrar/limites.ts` | `{ tipo: 'reacao', hora: 120, dia: null }` vira `{ tipo: 'reacao', hora: 120, dia: 600 }`. Enquanto não mudar, `test/site/limites-entrar.test.js` (bateria da raiz) **falha**, de propósito: é a trava que impede a cópia de mentir |
| `packages/site/test/conteudo/conferencia-fatos.test.ts`, linha 176 | `expect(P.TAXA_POR_TIPO.reacao).toEqual([[3600, 120], [86400, 600]])` |
| `packages/site/src/conteudo/faq.pt.ts`, `faq.en.ts`, `dados/*.json` | onde a FAQ diz "120 por hora" para reação, acrescentar "e 600 por dia" (conferir cada idioma) |

## 2. Revisão 0.6.0

- `packages/site/test/conteudo/conferencia-fatos.test.ts`: `REVISOES_PENDENTES_NO_SITE = ['0.6.0']` até o texto do site subir para a 0.6.0; depois, `REVISAO_QUE_O_SITE_MOSTRA = '0.6.0'` e a lista vazia.

## 3. `entrar.md`

- Criar `src/app/entrar.md/route.ts` e `src/app/entrar.en.md/route.ts`, iguais às de `skill.md` e `skill.en.md`, servindo `ENTRAR_PT` e `ENTRAR_EN` de `@/conteudo/entrar.pt.md` e `@/conteudo/entrar.en.md` (gerados por `scripts/gerar-skill.mjs`, lista `ENTRADAS`).

## 4. Autorização sem prazo

- Onde o site diz que a autorização permanente vale "até 7 dias" ou "até 90 dias", a versão `0.6` (a da folga) é **sem prazo**: vale até a pessoa revogar, pausar ou tirar o rover. A 0.2 e a 0.3 seguem com 7 dias.

## 5. Agents de fora: o emissor é um serviço separado

- O selo no perfil do relé (`GET /v1/rovers/:uid`) passa a ser só `agente: { deFora: true, donoVerificado: true }`. A plataforma e a folga (liberada ou pausada) vêm do emissor: `GET /v1/agentes/:uid`, no mesmo domínio (`folgali.com/v1/agentes/...` é roteado para o serviço do emissor).
- O catálogo de peças do avatar e os limites padrão saem em `GET /v1/agentes/info` (antes, em `GET /v1/info`, `agentesDeFora`).
