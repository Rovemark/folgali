# Requests to the specification: HTTP client

The social `HttpClient` only uses routes that exist in `docs/API-SOCIAL-NETWORK.md`. Where the response is not enough for the screen, the client
fills in with a route that already exists (`GET /v1/rovers/:uid`) or leaves the field absent. What was missing:

1. **Author in the items of `entregas` and `atualizacoes`.** `GET /v1/rovers/:uid/entregas` and `GET /v1/paginas/:id/atualizacoes` return only
   the `Envelope`, which carries the author's uid but not the `RoverResumo`. Today the client makes an extra call to `GET /v1/rovers/:uid` per
   distinct author. Suggestion: `{ envelope, autor: RoverResumo }`, as in `recados` and `depoimentos`.
2. **Reactions and reply count on page updates.** The site's `Update` type has `reacoes`, but the route does not
   return them; the client shows 0. Suggestion: add `reacoes: { curtir, util }` (and `minhaReacao` with a credential) to the items.
3. **Format of the item in `GET /v1/linha/inicio?tipos=postagem,pagina-publicar`.** Section 7.4 says the updates of the
   pages are included, but does not say how the item mixes the two types. The client treats an item with `objeto.tipo === 'pagina-publicar'` as an
   update and the rest as a post. Suggestion: an explicit `{ tipo: 'postagem' | 'pagina-publicar', ... }` in each item.
4. **`GET /v1/linha/inicio` does not say which rover the timeline belongs to when there is no credential.** The `rover=` parameter is the reader's, and with a
   closed graph only the reader reads it. The client needs the uid of the person's rover (the `reader` option) and the credential; without them it falls back to the public
   timeline of posts only. Suggestion: say in 7.4 that the mixed timeline is always the rover's own.
5. **Preview of the report in the moderation queue.** `QueuedReport.preview` (excerpt and author of the reported content) is a client field
   on the site; the relay answers only `alvo` and `alvoTipo`, so the moderator would have to open each target by id. Suggestion: an optional `previa`
   with `{ autor: RoverResumo, trecho }` in the queue (the moderator can already read the content).
6. **Place and topic name in notifications.** The notification carries no text (correct), but the screen needs to say "in which
   community". Today it stays without `placeName`/`topicName`; the screen fills in by opening the `comunidade` or the `objeto`. Suggestion:
   allow `comunidadeNome` (the community's public name, with no content text) in the notification.
7. **`GET /v1/comunidades/:id/pedidos`, `/convites` and `/banidos`** appear with `?antes=&limite=` but the response contract does not
   say whether they come as `{ itens, proximo }`; the client assumes they do (section 1.5).
8. **`GET /v1/descobrir/*`**: section 1.5 says "trending", "trends" and "suggestions" answer `{ itens, proximo: null }`; the
   client also accepts a plain list. A single format should be confirmed.
9. **`sugestoes` without the rover's credential.** The relay only filters what the person already takes part in if it receives the credential of the
   `rover` itself; the client sends `rover=` only when there are no explicit `interesses`. Suggestion: clarify whether `interesses` and `rover`
   can come together.
