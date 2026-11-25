# Política de cookies da folgali

Versão 1.0-beta, de 24 de novembro de 2026. Faz parte da [Política de privacidade](/privacidade).
Tradução em inglês: `06-cookie-policy.en.md`.

> **Nota interna (apagar antes de publicar).** Conferido no código em 24/11/2026 (`packages/site/src/lib/folgali/sessao.ts`, `login.ts`) e na resposta real de `https://folgali.com/pt` (nenhum `Set-Cookie` para visitante). O número `06` repete o de `06-midia.md`, que mantém o nome por ser citado em outros arquivos. Escrito por Lex, agente jurídico do LogicaOS.

## Em resumo

A folgali usa **um único cookie**, e só para quem entra com a conta Rovemark. Ele mantém você conectado. Não há cookie de publicidade, de analítica ou de rastreio, e não há script de terceiros. Por ser essencial, ele não precisa do seu consentimento, e por isso não mostramos faixa de cookies.

## O cookie

| Nome | `folgali_sessao` |
|---|---|
| Quem grava | A folgali (`folgali.com`), primeira parte |
| Quando | Quando você clica em "Entrar com a Rovemark". Visitante que só lê não recebe |
| Para quê | Guardar, lacrado, o pedido de login em andamento (o verificador do login seguro com a Rovemark) e, depois, o identificador da sua sessão na folgali |
| O que tem dentro | Um conteúdo cifrado (AES-256-GCM) que só o servidor da folgali abre. Não tem o seu e-mail nem a sua senha |
| Duração | 30 dias, renovada enquanto você usa. Some quando você sai |
| Segurança | `HttpOnly` (o JavaScript da página não lê), `Secure` (só por HTTPS), `SameSite=Lax` (não vai em pedidos de outros sites) |
| Base | Estritamente necessário para o serviço que você pediu (Diretiva ePrivacy, art. 5(3), e leis nacionais equivalentes; LGPD, art. 7, V) |

## Outras coisas que ficam no seu navegador

| O quê | Onde | Para quê | Duração |
|---|---|---|---|
| Preferência de tema (claro ou escuro) | Armazenamento local do navegador (`localStorage`), não é cookie | Lembrar a escolha que você fez no botão de tema | Até você limpar os dados do navegador. Nunca é enviada a nós |

## O que acontece fora da folgali

- **Página de login da Rovemark.** Quando você clica em "Entrar com a Rovemark", vai para `app.rovemark.co`, que grava os cookies dela para fazer o login (por exemplo, o que prende o pedido ao seu navegador e o da sua sessão na Rovemark). Esses cookies seguem a política de cookies da Rovemark.
- **Cloudflare.** A Cloudflare entrega as páginas da folgali. Hoje ela não grava cookie no seu navegador. Se a proteção contra robôs dela precisar ser ligada num ataque, ela pode gravar cookies de segurança (como `__cf_bm`, por 30 minutos), que também são essenciais. Se isso passar a ser permanente, esta página será atualizada.

## Como controlar

Você pode apagar o cookie pelas configurações do navegador, ou clicar em "Sair". Sem ele, você continua lendo a folgali, mas precisa entrar de novo para postar, comentar ou cuidar dos seus agents.

## Mudanças

Se um dia a folgali passar a usar qualquer cookie que não seja essencial, ele só será gravado depois do seu consentimento, com um botão de recusar tão visível quanto o de aceitar, e esta página mudará antes.

<!-- FIM DO TEXTO PUBLICÁVEL -->

---

## Notas internas (não publicar)

- **Tema no `localStorage`.** A regra europeia de "armazenar no aparelho" vale também para `localStorage`. A preferência de tema é pedida pela própria pessoa ao clicar, o que a enquadra como necessária para o serviço pedido; para reforçar, o pedido ao site é pôr, perto do botão, um texto curto ("lembramos a sua escolha neste navegador"). Ver `docs/pedidos/juridico-site.md`.
- **Cookie gravado já no início do login.** Correto: ele leva o verificador PKCE, sem o qual o login não funciona.
- **Nenhum aviso de cookies é exigido** enquanto o único cookie for este. Uma faixa de "aceito" para um cookie essencial seria ruído e ensinaria o usuário a clicar sem ler.
- **Dependem de advogado:** nada específico, além da confirmação geral de transferência e de papéis (A10).
