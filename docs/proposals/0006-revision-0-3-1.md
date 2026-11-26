<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0006: revision 0.3.1 (fields and routes that the site and the Hangar asked for)

- Status: draft, implemented on the reference relay and on the reference client
- Proposed by: agent (Claude Sonnet 5.5, through Claude Code), from `packages/site/docs/REQUESTS-FOR-THE-SPECIFICATION.md`
- Date: 2026-11-08
- Protocol version affected: none. The objects stay `"v": "0.3"`. What changes is the read API and one new object type (`denuncia-dispensar`). `GET /v1/info` now declares `versaoDoRascunho: "0.3.1"` and gains `recursos`.

## Problem

When the site was connected to the real relay, the rich screens turned out empty or short of breath. The 0.3 specification does not say, for example, how many replies a post has, or when a friendship began, or in which topic a notice falls. The site worked around what it could and left 35 requests recorded. One of them (the public record of the page) already existed on the relay and only the site had to use it.

## Rule of this revision: only add

1. A new field in a response that already exists: a 0.3 client ignores what it does not know. No existing field changes name, type or value.
2. A new route or a new option of a route (`completo=1`, `ordem=recentes`, `estado=enviados`): without the option, the response is identical to 0.3's, byte for byte. A compatibility test proves it.
3. A new object type (`denuncia-dispensar`) is only accepted by a 0.3.1 relay. The client reads `GET /v1/info` first and only offers the action if `recursos` lists it.
4. In any privacy doubt, do not expose. Nothing the rover made private appears (graph, friend list, closed community). Counts never carry the list of who.

## Changes

### Profile and notices
- `GET /v1/rovers/:uid/pagina`: `voce.amigoDesde` (when the friendship with the reader became active), `voce.contaDesde` (when the reader's account was born on the relay), `voce.selosQueDei` (types of badge the reader already gave this rover), `contagens.seguidores` and `contagens.seguindo` (the same graph rules as `contagens.amigos`). Everything in `voce` only exists with a credential.
- `GET /v1/rovers/:uid` and `/pagina`: `perfilId`, the id of the current `perfil` object, so the profile can be reported.
- `GET /v1/rovers/:uid/notificacoes`: each item gains `lugar` (`{ tipo: "comunidade" | "pagina", id, nome }`) and `topico` (`{ id, titulo }`), both `null` when the reader cannot see them. It saves the site the extra call to find the topic of a reply.
- `GET /v1/rovers/:uid/depoimentos?estado=enviados`: the author reads the testimonials they wrote that still await a decision. Only the rover itself, with a credential.

### Communities and forum
- `GET /v1/comunidades/:id`: `voce.banidoEm` (to count the 14 days of the appeal) and `voce.membroDesde` (for the waiting period).
- `GET /v1/rovers/:uid/removidos`: the author reads what moderation removed from within what they wrote (when, by whom in terms of role, reason, state of the appeal and the envelope while the relay retains it). Only the rover itself.
- `GET /v1/comunidades/:id/moderacao/fila`: each report gains `topico` (the topic where the target lives), to link the report of a reply to the topic.
- **`denuncia-dispensar`** (new object, a management action): the moderator takes a target off the queue without deleting the content. Decision: it only marks the open reports of that target in that community as dismissed; the content stays visible; whoever already reported cannot report the same target again (the uniqueness rule does not change); a new report, from another person, reopens the case. The act enters the public moderation record with `acao: "dispensa"`, the id of the target and the role of whoever dismissed it, without saying who reported. Why a new object and not a field of `comunidade-gestao`: the schema of that management type requires `alvo` to be a uid, and here the target is an object. The type is free (it does not require approval), but it is **not in the list of types the person can require** (`exigirAprovacao`, 18 types): that list validates signed declarations, and a 0.3 relay would reject a policy that cited it. Changing this is a decision for 0.4.
- `GET /v1/topicos/:id`: `reacoes` (`curtir`, `util`) and `minhaReacao`.
- `GET /v1/comunidades/:id/topicos?categoria=-`: topics without a category. A lone `-` is never a valid category, so it does not collide.
- `GET /v1/topicos/:id/respostas?ordem=recentes`: from newest to oldest, with `antes` as the cursor. The default stays `antigas`.

### Pages, search and feed
- `GET /v1/paginas/:id/atualizacoes?completo=1` and `GET /v1/linha/inicio?completo=1` (also `GET /v1/rovers/:uid/postagens?completo=1`): instead of only the envelope, each item comes as `{ tipo, envelope, autor, pagina, contagens, minhaReacao }`. `pagina` only exists on a page update (`{ id, nome }`). The format of the mixed feed item is now defined.
- `GET /v1/paginas/temas`: the existing themes with the number of pages in each.
- `GET /v1/descobrir/em-alta`: each item gains `pessoas`, the number of distinct people who moved the item in the window (topic: replied or reacted; community: joined or wrote; page: started to follow). Only the number, never the list.

### Posts
- `GET /v1/postagens/:id`: the post with `contagens` (`respostas`, `reacoes`) and `minhaReacao`.
- `GET /v1/postagens/:id/respostas?ordem=&antes=&limite=`: the replies to a post, each with its author and reactions.

## What was left out, and why

- **Trending rovers.** The site asked for a ranking of rovers. Version 0.3 decided, in a test, that the relay does not rank people (a ranking of people becomes a popularity contest, and affects those who do not want to be measured). The decision stands. The site uses `recem-chegados` and `sugestoes?tipo=rovers`.
- **Who can be an administrator of a page.** The most conservative rule would be "only a friend or visible follower of the owner". Changing the relay to require that would break a 0.3 client that names any visible rover, and this revision breaks nothing. Decision: the 0.3.1 relay keeps accepting any visible rover, and the specification recommends that clients offer only friends and followers. It is left to 0.4 to decide whether it becomes a relay rule.
- **`voce.carencia` computed by the relay.** With `membroDesde` and the constants from `GET /v1/info`, the client computes it on its own.
- **Anonymous client report text, deleting and reporting through the site.** The site has no rover key. This is not a gap in the protocol.
- **The 0.3 profile and the `exigirAprovacao` and standing authorization controls on the site.** This is screen work, not protocol work.

## Effect on what already exists

A 0.3 relay and a 0.3 client keep working with no change. A 0.3.1 client against a 0.3 relay reads the missing `recursos` in `GET /v1/info` and falls back to the earlier workarounds. The database gains a column (`denuncias.dispensada_em`) on open, through the migration that already exists.

## Privacy and security

- `voce.*` and `minhaReacao` only appear with a valid read credential, and only speak about the reader.
- `removidos`, `depoimentos?estado=enviados` and the own lists require the credential of the rover itself.
- Post and topic counts count visible objects (visible author, not removed, not hidden, not blocked by the operator). The list of who reacted stays nonexistent.
- `pessoas` counts distinct people with an account of the minimum discovery age, the same rule as the "trending" computation, so as not to reward batches of new accounts.
- New abuse: `denuncia-dispensar` could hide legitimate reports. Mitigation: only owner and moderator; it enters the public record; it does not delete content; a report from another person reopens it.

## Tests

Unit tests of each field and route; privacy (private graph, blocked account, closed community, banned rover); compatibility (without the new options the response is identical to 0.3's); `denuncia-dispensar` (permission, effect, record, reopening); and the mutation meter on the touched modules.

## Open questions

1. Is it worth having the relay state, in `GET /v1/info`, the minimum discovery age, so the client can explain why a newly arrived rover does not appear in "trending"?
2. Should the page administrator be limited to friends and followers in 0.4?
