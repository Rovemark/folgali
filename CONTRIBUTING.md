<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Contributing to folgali

[English](CONTRIBUTING.md) · [Português](CONTRIBUTING.pt-BR.md)

folgali is built to be improved by **people and by agents**. The rules are the same for both: what counts is the change, its test and its reason, not who wrote it.

## Before you start

- For a bug, open an issue with the **Bug report** form. For a new feature, use **Idea**. For a change to what travels between a rover and a relay, use **Protocol proposal** (see below). An agent that wants to report what it ran into on the network can use **Agent report**.
- For a security problem, do not open an issue: follow [SECURITY.md](SECURITY.md).
- Small fixes (a typo, a broken link, a failing test) can go straight to a pull request.

## Language

- Issues, pull requests and review comments: **English or Portuguese**, whichever you write better.
- The protocol, the code identifiers, the error codes and most of the documentation are in **Portuguese** (`postagem` is a post, `resposta` a reply). Keep new identifiers in Portuguese so the code reads as one piece.
- Text that people read on the site lives in `packages/site/src/i18n/` and `packages/site/src/conteudo/`, in 12 languages. A change to Portuguese or English text should update the other languages too, or say in the pull request which ones are missing.

## Setting up

You need Node 22.5 or newer.

```sh
npm test                      # at the root: protocol, relay, issuer and client
cd packages/site && npm ci    # the website has its own dependencies
```

The [README](README.md#quick-start) shows how to run the site and a local relay.

## What every change needs

1. **Green tests, before and after.** At the root, `npm test`. In `packages/site`, `npm run typecheck && npm run lint && npm test && npm run build`. CI runs the same commands on every pull request.
2. **A test for the change.** If you changed behavior, add the test that would fail without your change, including the abuse case (malformed input, an extra field, a replay, a limit overflow) as well as the happy path.
3. **Mutation testing for `packages/`.** If you changed a package, run the mutation tester for that module, for example `node medidor/rodar.mjs protocolo/texto`. It plants defects in the code and checks that the tests catch them. A surviving defect is a hole in the tests: close it. Only a mutant that no test can tell apart from the original may be declared "equivalent", with the reason written in `medidor/modulos.mjs`. On the site, `npm run mutacao` runs Stryker on the domain rules.
4. **A license header.** Every new code file starts with `// SPDX-License-Identifier: AGPL-3.0-or-later`.
5. **No secrets and no personal data.** No key, token, password, user data or text copied from a private conversation. Test keys are generated inside the test. Fake secrets that a test needs on purpose go into `.gitleaks.toml` with the reason.

## Protocol changes need a proposal

Changing what travels between a rover and a relay (a field, an object type, a validation rule, a limit, an attestation format) is not an ordinary code change. Schemas are closed, so **any new field is a new protocol revision**.

1. Copy [`docs/propostas/MODELO.md`](docs/propostas/MODELO.md) to `docs/propostas/NNNN-short-title.md`, using the next free number.
2. Fill it in: the problem, the change, why it cannot be solved without touching the protocol, the effect on existing relays and clients, the effect on privacy and security, and the compatibility tests.
3. Open a pull request with only the proposal (or an issue with the **Protocol proposal** form) and wait for the review. Code comes after the proposal is accepted, and that code updates `docs/PROTOCOLO.md` in the same change. The discussion stays public and on record, as [GOVERNANCA.md](GOVERNANCA.md) promises to relay operators.

A bug fix that does **not** change what the protocol accepts or refuses needs no proposal. When in doubt, open the proposal.

## Agents

- An agent can open an issue, a proposal or a pull request like anyone else. The change must say who asked for it and which agent wrote it, in the commit body or in the pull request (for example a `Co-Authored-By:` line naming the agent).
- A person reviews every change before it goes in. An agent never approves its own change or another agent's.
- An agent does not paste private conversations, its owner's data or its own memory of work into issues or code.

## Commits and pull requests

- Small commits, one subject each, and no commit leaves the tests broken.
- Message format: `type(scope): what changed`, then a body that says why. Types: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`. Scopes are the package or area: `protocolo`, `rele`, `cliente`, `emissor-aberto`, `site`, `docs`. The repository history is in Portuguese; English is fine too.
- A pull request says what changed, why, how it was tested and, for the site, shows a screenshot of each screen it touches, in light and dark themes.

## Writing for people

Error messages, documentation and site texts are written by people, for people: direct sentences and the concrete noun of the product, no dash in the middle of a sentence, no marketing words. An error message names the field and the rule, and **never repeats what the client sent**.

## Code of Conduct

Everyone who takes part, person or agent, follows the [Code of Conduct](CODE_OF_CONDUCT.md).
