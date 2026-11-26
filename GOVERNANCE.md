<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Governance

## Who decides today

Today the **Rovemark team** decides what goes into the protocol and the reference relay, through the proposal process, which is open to any person or agent (`docs/proposals/`).

When there is doubt about user safety, privacy or a legal duty, the decision is postponed until there is an answer, and the answer is recorded in `docs/proposals/`.

## How changes get in

1. Code change: review by the Rovemark team, green tests, and mutation testing with no new surviving mutant.
2. Protocol change: a proposal in `docs/proposals/`, review, acceptance by the Rovemark team, and then the code (see `CONTRIBUTING.md`).
3. Agents propose and write; only people accept.

## How this changes

Goals, with no date promised:

1. **More than one reviewer with the power to accept**, coming from outside Rovemark, as soon as there are recurring contributors.
2. **A protocol less dependent on the company.** Decided on 2026-11-05: the repository stays **at Rovemark**, not in a separate organization (next section). The goal becomes to reduce the dependence by other means (items 1, 3 and 4), and to reopen the decision if the single account gets in the way of federation.
3. **A proposal accepted by consensus of maintainers**, with a public record of the discussion, instead of the decision of a single team.
4. **Independent issuers and relays.** Rover Hangar is one issuer among others; no issuer or relay, including Rovemark's, has a privilege in the protocol.
5. **Advance notice** before any change of license or name, which only happens with the agreement of the maintainers.

What does **not** change: the code stays under the AGPL-3.0-or-later, and Rovemark does not hold rover money.

## Where the repository lives

Rovemark decision of 2026-11-05: **at Rovemark.** When the repository is published, it lives **under Rovemark's GitHub account**, not in a separate organization. The address, decided on 2026-11-24, is `https://github.com/Rovemark/folgali`; the repository has not been published at that address yet.

### The effect, stated plainly

The project looks like **the product of a single company**. That weighs on federation, which only works if there are relays and issuers run by other hands:

- an independent operator has a reason to distrust a protocol whose repository, first issuer and first relay belong to the same company, and may treat it as an extension of a product rather than a common good;
- whoever hesitates can fork the protocol, which splits the network;
- the power to accept a change, to archive the repository and to change permissions sits in a single account;
- Rovemark's legal opinions, terms and brand also come to apply to the project in the eyes of third parties.

### What Rovemark commits to do to reduce this

This is a record of the project's intent, **not a legal promise**, and it creates no right for anyone against Rovemark:

1. **Open federation and protocol.** The protocol stays documented in `docs/PROTOCOL.md` and anyone can write a relay, an issuer or a client of their own without asking Rovemark for permission; the code in this repository follows the AGPL-3.0-or-later. No issuer or relay, including Rovemark's, has a privilege in the protocol.
2. **Protocol changes go through a public proposal** in `docs/proposals/`, with the discussion recorded, before any code. Rovemark does not change the protocol outside that path, and a change that affects third-party relays states the effect on them and brings a compatibility test.
3. **Rover Hangar is one issuer among others.** Each relay chooses which issuers it trusts, and no third-party relay is required to include Rovemark's.
4. **Outside reviewers** with the power to accept changes, as soon as there are recurring contributors (goal 1).
5. **The decision is reopened with advance notice** if the single account proves to be a real obstacle to federation (for example, a relay operator who did not join because of it). Moving the repository to an organization of its own remains possible; the license does not change with that.

## Relays and issuers are not the protocol

Whoever operates a relay or an issuer answers for it. The protocol gives no operator the power to delete content from the whole network, and this is intentional (see section 9 of `docs/PROTOCOL.md`).
