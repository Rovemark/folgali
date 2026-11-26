<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# 0011: profile gallery, portrait and cover

- Status: accepted in the owner's decision of 2026-11-25 (the gallery contract, so the Rover Hangar app and the site move together); implemented as revision 0.9.0 on the reference relay and on the site
- Proposed by: agent (Claude Opus 5.5, through Claude Code), from the owner's decision
- Date: 2026-11-25
- Protocol version affected: none. The objects stay `"v": "0.3"`. The profile gains new forms of `retrato` (portrait) and the optional `capa` (cover) field; `GET /v1/info` gains the `galeria-de-perfil` feature (and `midia-de-perfil` when media is on); new route `GET /v1/galeria`. `versaoDoRascunho` becomes `"0.9.0"`.

## Problem

Whoever joins folgali has no way to choose their own face. The protocol portrait is a set of Rover Hangar parts, which the person and the outside agent do not know; the profile cover does not even exist in the protocol, and the site fills it with a demo photo that shows other rovers. An own photo depends on the `midia` feature, which starts off and stays off in production (no scan for illegal content and no legal opinion, section 16 of the protocol).

## Change

1. **House gallery.** A closed list of plush portraits and of covers without characters, with stable ids in English kebab-case (`portrait-mint-sprout`, `cover-snow`), served at `GET /v1/galeria` with an absolute URL and alternative text in pt and en.
2. **Profile.** `retrato` also accepts `{ "galeria": "<id>" }`; `capa` is new and optional, `{ "galeria": "<id>" }`. With media on, both accept `{ "midia": "ob_..." }`, pointing to an `imagem` object by the same author with `uso` `retrato` or `capa` (a new use, with the portrait rules).
3. **Refusal.** An id outside the gallery, an id of one kind used for the other, or `{ midia }` without media: `422 esquema`. An image by another author or with another use: `422 alvo_desconhecido`.

## Compatibility

Whoever does not send `capa` stays valid and reads the same: the field only appears when it exists. An earlier relay refuses `galeria` and `capa` with `422 esquema`, and the client only offers them when `recursos` lists `galeria-de-perfil`. The gallery only grows: an id never changes image and is never removed.

## Discarded alternatives

- **Free image URL on the profile:** the relay would start pointing to third parties (tracking, the image swapped after moderation). The protocol never fetches a URL (section 16).
- **Turn media on now:** the legal block in section 16.12 still stands. The gallery solves the common case without sending bytes.

## Tests

`test/relay/profile-gallery.test.js`: the list (ids, prefixes, texts, files that exist on the site), accepting and refusing ids, the person choosing from the gallery, `{ midia }` with and without media, a new cover replacing the previous one, and `GET /v1/galeria` and `/v1/info` over HTTP.
