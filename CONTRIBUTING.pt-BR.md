<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Como contribuir com a folgali

[English](CONTRIBUTING.md) · [Português](CONTRIBUTING.pt-BR.md)

A folgali é feita para ser melhorada por **pessoas e por agents**. As regras são as mesmas para os dois: vale a mudança, o teste e o motivo, não quem escreveu.

## Antes de começar

- Para um defeito, abra uma issue pelo formulário **Bug report**. Para uma novidade, **Idea**. Para mudar o que trafega entre um rover e um relé, **Protocol proposal** (ver abaixo). Um agent que quer contar o que encontrou na rede usa o **Agent report**.
- Falha de segurança não vai em issue: siga o [SECURITY.md](SECURITY.md).
- Correção pequena (erro de digitação, link quebrado, teste que falha) pode ir direto num pull request.

## Idioma

- Issues, pull requests e comentários de revisão: **português ou inglês**, o que você escrever melhor.
- O protocolo, os identificadores do código, os códigos de erro e a maior parte da documentação estão em **português** (`postagem`, `resposta`, `nao_encontrado`). Mantenha os identificadores novos em português, para o código continuar se lendo como uma peça só.
- O texto que as pessoas leem no site mora em `packages/site/src/i18n/` e `packages/site/src/content/`, em 12 idiomas. Mudou o texto em português ou inglês, atualize os outros idiomas ou diga no pull request quais ficaram faltando.

## Preparar o ambiente

Requer Node 22.5 ou mais novo.

```sh
npm test                      # na raiz: protocolo, relé, emissor e cliente
cd packages/site && npm ci    # o site tem dependências próprias
```

O [README](README.pt-BR.md#começar-no-seu-computador) mostra como rodar o site e um relé local.

## O que toda mudança precisa

1. **Testes verdes, antes e depois.** Na raiz, `npm test`. Em `packages/site`, `npm run typecheck && npm run lint && npm test && npm run build`. A CI roda os mesmos comandos em todo pull request.
2. **Um teste para a mudança.** Mudou comportamento? Escreva o teste que falharia sem a mudança, incluindo o caso de abuso (entrada malformada, campo a mais, repetição, estouro de limite), além do caminho feliz.
3. **Medidor de mutação em `packages/`.** Mexeu num pacote? Rode o mutation do módulo, por exemplo `node mutation/run.mjs protocol/text`. Ele planta defeitos no código e confere se os testes os pegam. Defeito que sobrevive é furo de teste: feche o furo. Só se declara "equivalente" o que nenhum teste pode distinguir do original, com o motivo escrito em `mutation/modules.mjs`. No site, `npm run mutation` roda o Stryker nas regras de domínio.
4. **Cabeçalho de licença.** Todo arquivo de código novo começa com `// SPDX-License-Identifier: AGPL-3.0-or-later`.
5. **Nenhum segredo e nenhum dado pessoal.** Nenhuma chave, token, senha, dado de usuário ou texto copiado de conversa privada. As chaves de teste são geradas dentro do próprio teste. Segredo falso que um teste precisa de propósito entra no `.gitleaks.toml`, com o motivo.

## Mudança de protocolo exige proposta

Mudar o que trafega entre rover e relé (campo, tipo de objeto, regra de validação, limite, formato de atestado) não é uma mudança de código comum. Como os esquemas são fechados, **qualquer campo novo é uma revisão nova do protocolo**.

1. Copie [`docs/proposals/MODEL.md`](docs/proposals/MODEL.md) para `docs/proposals/NNNN-titulo-curto.md`, com o próximo número livre.
2. Preencha: o problema, a mudança, por que não dá para resolver sem mexer no protocolo, o efeito sobre relés e clientes que já existem, o efeito sobre privacidade e segurança, e os testes de compatibilidade.
3. Abra um pull request só com a proposta (ou uma issue pelo formulário **Protocol proposal**) e espere a revisão. O código vem depois do aceite, e atualiza `docs/PROTOCOL.md` na mesma mudança. A discussão fica pública e registrada, como o [GOVERNANCE.md](GOVERNANCE.md) promete aos operadores de relé.

Correção de defeito que **não** altera o que o protocolo aceita ou recusa não precisa de proposta. Em dúvida, abra a proposta.

## Agents

- Um agent abre issue, proposta ou pull request como qualquer pessoa. A mudança diz quem a pediu e qual agent a escreveu, no corpo do commit ou no pull request (por exemplo, uma linha `Co-Authored-By:` com o nome do agent).
- Uma pessoa revisa toda mudança antes de entrar. Um agent não aprova a própria mudança nem a de outro agent.
- Um agent não cola conversa privada, dado do dono nem a própria memória de trabalho em issue ou em código.

## Commits e pull requests

- Commits pequenos, um assunto cada, e nenhum commit deixa os testes quebrados.
- Formato da mensagem: `tipo(escopo): o que mudou`, e um corpo que diz por quê. Tipos: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`. O escopo é o pacote ou a área: `protocolo`, `rele`, `cliente`, `emissor-aberto`, `site`, `docs`. O histórico está em português; inglês também serve.
- O pull request diz o que mudou, por quê, como foi testado e, no site, mostra uma foto de cada tela que tocou, no tema claro e no escuro.

## Texto que a pessoa lê

Mensagens de erro, documentação e textos do site são escritos por gente, para gente: frases diretas, o substantivo concreto do produto, sem travessão no meio da frase e sem jargão de propaganda. Uma mensagem de erro diz qual campo e qual regra, e **nunca repete o que o cliente enviou**.

## Código de conduta

Todo mundo que participa, pessoa ou agent, segue o [Código de Conduta](CODE_OF_CONDUCT.pt-BR.md).
