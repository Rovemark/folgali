# Entrar na folgali pela conta Rovemark (o lado do site)

A folgali não tem login próprio nem guarda senha. O contrato com a Rovemark está em `docs/LOGIN-FOLGALI.md` do repositório
`rovemark-platform`. Este é o lado do site.

## Caminho

1. "Entrar com a Rovemark" e "Criar conta" levam a `/api/auth/rovemark/inicio?lang=<idioma>[&tela=criar][&destino=/<idioma>/...]`.
   O servidor gera o verificador PKCE e o estado, grava os dois no cookie lacrado e redireciona para
   `{FOLGALI_ROVEMARK_API}/api/auth/oauth/rovemark/start?app=folgali&volta=...&desafio=<S256>&estado=...`.
2. A Rovemark volta para `/api/auth/rovemark/callback?codigo=...&estado=...`. O site confere o estado contra o cookie
   (em tempo constante, pedido de no máximo 10 minutos) **antes** de qualquer chamada, troca o código pelas fichas
   (`POST /api/auth/app/exchange`, servidor a servidor), guarda as fichas cifradas no cofre e deixa no cookie só o id da sessão.
3. Nas páginas, `pessoaAtual()` lê a sessão e renova a ficha quando falta menos de um minuto para vencer
   (`POST /api/auth/app/refresh`), uma renovação por vez por sessão. 401 na renovação encerra a sessão aqui também.
4. "Sair" (`POST /api/auth/sair`) revoga a família na Rovemark, apaga a sessão e o cookie.

## A Central de Contas pergunta à folgali

`POST /api/rovemark/ligados`, `/api/rovemark/ligados/remover` e `/api/rovemark/conta-apagada`, assinadas com
`x-rvm-assinatura: t=<unix>,v1=<hex HMAC-SHA256(RVM_FOLGALI_SEGREDO, "<t>.<corpo cru>")>`. O site confere em tempo constante e
recusa `t` com mais de 5 minutos de diferença. Sem o segredo, as três respondem 503 e a Central mostra "em breve".
Hoje a lista de ligados começa vazia: ligar um rover do Hangar ou um agente reivindicado à conta (`ligar()` em
`src/lib/folgali/cofre.ts`) depende do relé e da frente de autonomia.

## O cookie

Um só, `folgali_sessao`: httpOnly, Secure, SameSite=Lax, 30 dias, lacrado com AES-256-GCM. Leva o pedido de login em andamento
(verificador, estado, destino) e/ou o id da sessão. As fichas da Rovemark (`rmapp_at_`, `rmapp_rt_`) nunca vão ao navegador.
Nenhum cookie de rastreio, anúncio ou métrica. Só `src/lib/folgali/sessao.ts` toca em cookie, e `test/privacidade-do-site.test.ts` cobra isso.

## Variáveis (nenhum segredo no repositório)

| variável | para quê | padrão |
|---|---|---|
| `FOLGALI_SESSAO_SEGREDO` | lacre do cookie e cifra das fichas no cofre (32+ caracteres). Sem ela, os botões ficam "em breve" | nenhum |
| `FOLGALI_ROVEMARK_API` | base da API pública da Rovemark | `https://api.rovemark.co` |
| `FOLGALI_ROVEMARK_VOLTA` | a volta registrada na Rovemark | `https://folgali.com/api/auth/rovemark/callback` |
| `RVM_FOLGALI_SEGREDO` | segredo da ponte com a Central de Contas (32+ caracteres, o mesmo da API da Rovemark) | nenhum |
| `FOLGALI_DADOS_DIR` | pasta do cofre (arquivo `cofre.json`, permissão 600) | `.folgali-dados/` (fora do git); na imagem, `/app/.folgali-dados` com volume nomeado |

Testar localmente: veja "Testar localmente" no documento da Rovemark. Fora de produção a Rovemark aceita a volta
`http://localhost:3000/api/auth/rovemark/callback`; suba o site na porta 3000 com `FOLGALI_ROVEMARK_VOLTA` nesse endereço e
`FOLGALI_ROVEMARK_API` apontando para a API local.

## Provas

`scripts/e2e-login-rovemark.mjs`: a jornada inteira com a API REAL da Rovemark (banco temporário, rede externa proibida) e o site
REAL da folgali (build standalone). Em 25/11/2026: 13 de 13 conferências certas (o start aceita o pedido do site, a pessoa
aprova, a volta troca o código, o cofre não tem ficha em claro, `/pt/entrar` mostra quem entrou, a Central de Contas pergunta ao
site pela rota assinada, sair revoga a família e a Central vê a entrada encerrada; apagar a conta na Rovemark chega ao site
assinado e o cofre esquece a pessoa). Não cobre contra a API real: a renovação (a ficha de acesso vive 15 minutos; ela é provada
no teste com a Rovemark falsa).


`test/folgali-login.test.ts` (Rovemark falsa, nada sai do computador): PKCE do RFC 7636, estado conferido antes de chamar a
Rovemark, pedido vencido, cancelado, troca recusada, um cookie só com HttpOnly/Secure/SameSite=Lax, fichas cifradas no cofre
(o arquivo não contém `rmapp_`) com permissão 600, renovação serializada, 401 encerra, sair revoga, e as três rotas da Central
(503 sem segredo, 401 assinatura errada ou velha, 400 corpo torto, listar, tirar e apagar tudo da pessoa).
