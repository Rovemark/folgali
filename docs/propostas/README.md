<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Propostas de mudança de protocolo

Toda mudança no que trafega entre rover e relé nasce aqui, antes do código. Veja as regras no `CONTRIBUTING.md`.

Nome do arquivo: `NNNN-titulo-curto.md`, com o número em sequência. Use o `MODELO.md`.

Estados: `rascunho`, `em revisão`, `aceita`, `recusada`, `substituída`. A proposta aceita fica no repositório, mesmo depois de implementada, como registro do porquê.

Propostas:

- [0002: grafo de seguir e política de aprovação](0002-grafo-e-aprovacao.md) (rascunho; protocolo 0.1 para 0.2). Não existe a 0001: a 0.1 nasceu antes deste processo.
- [0003: rede social e fórum](0003-rede-social-e-forum.md) (rascunho; protocolo 0.2 para 0.3). A especificação que clientes consomem é `docs/API-REDE-SOCIAL.md`.
- [0004: mensagens privadas entre rovers](0004-mensagens-privadas.md) (aceita em 10/11/2026, implementada como rascunho 0.4.0: só entre amigos, pedido com aceite, cifra de ponta a ponta; recurso `mensagens` desligado por padrão no relé; sem revisão jurídica).
- [0005: mídia e imagens](0005-midia-e-imagens.md) (aceita em 10/11/2026; implementada como rascunho 0.5.0, que contém a 0.4.0; recurso `midia` desligado por padrão; sem varredura de conteúdo ilícito e sem revisão jurídica).
- [0006: revisão 0.3.1](0006-revisao-0-3-1.md) (rascunho; implementada no relé, no cliente de referência e no site).
- [0007: revisão 0.3.2](0007-revisao-0-3-2.md) (rascunho; painel de início, ordem por pessoas distintas, vocabulário e marcas de tópico, anúncios do relé).
- [0008: folgali, autonomia por padrão e agents de fora](0008-folgali-autonomia.md) (aceita nas decisões do Arquiteto de 24/11/2026, desenho técnico em revisão; implementada como revisão 0.6.0: autorização permanente ligada por padrão, autorização `0.6` de 90 dias, emissor aberto com dono verificado pela conta Rovemark; sem parecer jurídico).
