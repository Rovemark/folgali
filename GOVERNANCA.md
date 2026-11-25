<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Governança

## Quem decide hoje

Hoje a **equipe da Rovemark** decide o que entra no protocolo e no relé de referência, pelo processo de propostas aberto a qualquer pessoa ou agente (`docs/propostas/`).

Em dúvida sobre segurança de usuário, privacidade ou obrigação legal, a decisão é adiada até haver resposta, e a resposta fica registrada em `docs/propostas/`.

## Como as mudanças entram

1. Mudança de código: revisão da equipe da Rovemark, testes verdes, medidor de mutação sem furo novo.
2. Mudança de protocolo: proposta em `docs/propostas/`, revisão, aceite da equipe da Rovemark, depois o código (ver `CONTRIBUTING.md`).
3. Agents propõem e escrevem; só pessoas aceitam.

## Como isso muda

Metas, sem data prometida:

1. **Mais de um revisor com poder de aceitar**, vindos de fora da Rovemark, assim que houver quem contribua de forma recorrente.
2. **Protocolo menos dependente da empresa.** Decidido em 05/11/2026: o repositório fica **na Rovemark**, não numa organização separada (próxima seção). A meta passa a ser reduzir a dependência por outros meios (itens 1, 3 e 4), e reabrir a decisão se a conta única atrapalhar a federação.
3. **Proposta aceita por consenso de mantenedores**, com registro público da discussão, em vez de decisão de uma só equipe.
4. **Emissores e relés independentes.** O Rover Hangar é um emissor entre outros; nenhum emissor nem relé, inclusive os da Rovemark, tem privilégio no protocolo.
5. **Aviso prévio** antes de qualquer mudança de licença ou de nome, que só acontece com concordância dos mantenedores.

O que **não** muda: o código continua sob a AGPL-3.0-or-later, e a Rovemark não guarda dinheiro de rover.

## Onde o repositório mora

Decisão da Rovemark de 05/11/2026: **na Rovemark.** Quando o repositório for publicado, ele fica **sob a conta da Rovemark no GitHub**, e não numa organização separada. O endereço, decidido em 24/11/2026, é `https://github.com/Rovemark/folgali`; o repositório ainda não foi publicado nesse endereço.

### O efeito, dito de frente

O projeto aparece como **produto de uma empresa só**. Isso pesa na federação, que só vale se houver relés e emissores de outras mãos:

- um operador independente tem motivo para desconfiar de um protocolo cujo repositório, primeiro emissor e primeiro relé são da mesma empresa, e pode tratá-lo como extensão de um produto, e não como bem comum;
- quem hesitar pode bifurcar o protocolo, o que divide a rede;
- o poder de aceitar mudança, de arquivar o repositório e de mudar permissões fica numa só conta;
- pareceres, termos e marca da Rovemark passam a valer também para o projeto aos olhos de terceiros.

### O que a Rovemark se compromete a fazer para mitigar

Isto é registro de intenção do projeto, **não promessa jurídica**, e não cria direito de ninguém contra a Rovemark:

1. **Federação e protocolo abertos.** O protocolo fica documentado em `docs/PROTOCOLO.md` e qualquer pessoa pode escrever um relé, um emissor ou um cliente próprio, sem pedir licença à Rovemark; o código deste repositório segue a AGPL-3.0-or-later. Nenhum emissor nem relé, inclusive os da Rovemark, tem privilégio no protocolo.
2. **Mudança de protocolo passa por proposta pública** em `docs/propostas/`, com a discussão registrada, antes de qualquer código. A Rovemark não muda o protocolo por fora desse caminho, e mudança que afeta relés de terceiros declara o efeito neles e traz teste de compatibilidade.
3. **O Rover Hangar é um emissor entre outros.** Cada relé escolhe em quais emissores confia, e nenhum relé de terceiro é obrigado a incluir o da Rovemark.
4. **Revisores de fora** com poder de aceitar mudança, assim que houver quem contribua de forma recorrente (meta 1).
5. **Decisão reaberta com aviso prévio** se a conta única se mostrar um obstáculo real à federação (por exemplo, um operador de relé que deixou de aderir por isso). Mover o repositório para uma organização própria continua possível; a licença não muda com isso.

## Relés e emissores não são o protocolo

Quem opera um relé ou um emissor responde por ele. O protocolo não dá a nenhum operador o poder de apagar conteúdo da rede inteira, e isso é intencional (ver seção 9 de `docs/PROTOCOLO.md`).
