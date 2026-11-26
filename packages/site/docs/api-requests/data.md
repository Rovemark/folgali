# Requests and decisions of the fake social client

Where `docs/API-SOCIAL-NETWORK.md` does not decide, the fake client (`src/lib/social/fake`) chose the most conservative path. The real relay may answer differently; the screens only depend on the error code.

## Requests to the specification

1. **Error code of a friend request within the refusal period (7 days).** Section 4.3 says it cannot be asked, but does not give the code. The fake answers `limite` (429). Suggestion: `limite_de_taxa` with `Retry-After`, so the screen can say when it is possible to try again.
2. **Code of the testimonial during the 7-day wait after a refusal.** The same case: the fake answers `limite`. The screen needs the `Retry-After`.
3. **Title and place name in the notification.** The notification carries no text, which is right, but the notices screen needs to say "in Oficina de Pastas, in topic X". The fake client fills this in (`placeName`, `topicName`) by reading the community and the topic as they are now, and respecting visibility (null when the reader can no longer read). The HTTP client will need one GET per notice, or the relay can return the two names (never content text) when the reader can read the place.
4. **Preview of the reported content in the moderation queue.** The queue returns only `alvo`, `alvoTipo`, reasons, total and weight. To decide, the moderator needs to see what was reported. The fake includes `preview` (author, excerpt, topic title). In the real relay the client would have to fetch the object by id; it would be simpler for the queue to bring the preview.
5. **Who decides the appeal.** The fake only lists in the owner's queue the appeals whose `agiuPor` is a moderator (the decision is the owner's). Removals or bans made by the owner itself fall in the relay's queue and show on the banned person's card with `apelacao: aberta`, but not in the owner's queue. Section 7.2 says the queue brings appeals "only for the owner", without separating them; I suggest saying this in the specification.
6. **`Topico.enquete` (boolean) and `Topico.pesquisa`.** Section 7.3 uses the same name `enquete` for the card's boolean and for the topic's object. The site's type splits it into `enquete: boolean` and `pesquisa: Poll | null`. The HTTP client does the swap; the specification should distinguish them.
7. **Answer to `reacao` on a new object.** `reacao` is a free type and applies to topic, forum reply, update and delivery, but the read routes for reply and update do not return `minhaReacao`. The fake returns it; in the real relay, only with a credential.

## Decisions of the fake (conservative)

- Report of an object the reporter cannot see: a silent `202`, and discarded (section 10.1). Report of an unknown id: `nao-encontrado`, like the phase 1 client (for the old tests). The real relay answers the same in both cases.
- A moderator or owner removing their **own** content through `remocao-por-responsavel`: `sem-permissao` (for one's own, there is `remocao-pelo-autor`).
- Vote in a closed poll: `enquete-encerrada` before `ja-existe`.
- Reactions on the new objects have no time; for "trending" they count if the topic had activity in the window.
- A mention notification only goes to someone who exists, can see the content (closed community: members only) and has not blocked or muted the author. Each person receives at most one per reply, in the order topic, parent, quote, mention.
- The demo Teco has an account 9 days old: so he cannot give a badge to someone who has been his friend for less than 7 days, and there are examples of `conta-nova`.
