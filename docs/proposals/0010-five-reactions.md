<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0010: five post reactions and changing a reaction

- Status: accepted in Rovemark's decision of 2026-11-25; implemented as revision 0.8.0 on the reference relay, the reference client and the site
- Proposed by: agent (Claude Opus 5.5, through Claude Code), from Rovemark's decision
- Date: 2026-11-25
- Protocol version affected: none. The objects stay `"v": "0.3"`. What changes is the vocabulary of the `reacao` field (additive), the rule for a repeated reaction and a new feature in `GET /v1/info` (`reacoes-de-postagem`). `versaoDoRascunho` becomes `"0.8.0"`.

## Problem

The protocol only has two reactions, `curtir` and `util`. The folgali site already draws the selector with five little faces (like, love, haha, wow, hug), but it stores nothing: the relay would refuse `amei` with `422 esquema`. Whoever reads folgali sees a gesture the network does not keep.

It is also not possible to change one's mind: whoever liked and wants to switch to "love" gets `409 ja_reagiu` and has to remove first, in two objects.

## Change

### 1. Four new values, only for post and reply

```json
// before (and still valid)
{ "tipo": "reacao", "corpo": { "alvo": "ob_...", "reacao": "curtir" } }
// after, also
{ "tipo": "reacao", "corpo": { "alvo": "ob_...", "reacao": "amei" } }
```

| Target | Reactions |
|---|---|
| `postagem`, `resposta` | `curtir`, `amei`, `haha`, `uau`, `abraco` (and `util`, which is still accepted) |
| `topico`, `resposta-forum`, `pagina-publicar`, `entrega` | `curtir`, `util` |

`util` stays as the forum reaction. Nothing that was accepted stops being accepted. The new values only exist in `"0.3"` objects; a `"0.1"` or `"0.2"` object keeps `curtir` and `util`.

### 2. Changing replaces

One live reaction per author and target still holds. The same one again is `409 ja_reagiu`, as before. A different reaction is now accepted, and the previous one comes down in the same transaction (it is marked removed, without an envelope). The change counts as one reaction for the limit (120 per hour, 600 per day, unchanged).

### 3. Reading

`contagens.reacoes` always carries `curtir` and `util`; `amei`, `haha`, `uau` and `abraco` appear only when there is at least one. `minhaReacao` can be any of the six values.

## Why this cannot be solved without touching the protocol

The vocabulary of the `reacao` field is part of the closed schema of the object. A relay that follows the previous schema refuses the new value, and a client has no way to know whether the relay accepts it without a signal (the feature).

## Effect on what already exists

- **Relay 0.7.0** refuses the four new ones with `422 esquema`. The client reads `recursos` in `GET /v1/info` and only offers the four when it sees `reacoes-de-postagem`.
- **An old client** reading a 0.8.0 relay: `curtir` and `util` stay in the same place; the new keys appear only when they exist, and a client that ignores an unknown field stays the same. An object with no new reaction answers byte for byte as before.
- **Changing**: an old client that depended on receiving `ja_reagiu` when sending a different reaction now sees the change accepted. No reference client depended on it.

## Privacy and security

Nothing new is exposed: there is still no list of who reacted with what, only counts per type. Changing does not open a way to escape the limit (it counts as a reaction) nor to touch another author's reaction (the replacement only looks for reactions of the same author on the same target).

## Tests

- `test/relay/post-reactions.test.js`: the five on post and reply, the four refused on topic, forum reply and page update, a `"0.2"` object without the new values, a chained change with only one live reaction, another author's reaction untouched, the change within the limit, the person reacting, counts per type and `minhaReacao` over HTTP, byte-for-byte compatibility and `recursos`.
- `test/protocol/objects.test.js`: the new values in the `"0.3"` schema and outside `"0.1"` and `"0.2"`.
- `test/relay/accept.test.js` and `test/relay/social-forum.test.js`: the old `ja_reagiu` rule replaced by the replacement rule.
- `test/client/types.test.js`: the `Reaction` type in `index.d.ts` accepts the five and refuses an invented value.

## Open questions

- The four new reactions in the forum: refused today, so the forum keeps `util` as the signal of a good reply. Reopen if communities ask for it.
