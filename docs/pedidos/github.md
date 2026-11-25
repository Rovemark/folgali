# Pedidos da frente GitHub às outras frentes

A frente GitHub preparou o repositório para ser publicado como `Rovemark/folgali` (README em inglês e português, arquivos da comunidade, CI, limpeza de dado interno). Estes são os pontos que dependem de arquivos de outras frentes, ou de decisão.

## Para a integração

1. **`GOVERNANCA.md`: o endereço do repositório está decidido.** É `github.com/Rovemark/folgali`. O texto ainda diz que o "endereço exato ainda é pendência", e `packages/site/test/conteudo/conferencia-fatos.test.ts` (o teste "o repositório não tem endereço público") confere essa frase. Os dois mudam juntos. O teste que proíbe endereço inventado só procura nomes com `rover`, então `Rovemark/folgali` passa.
2. **Endereço de segurança.** O `SECURITY.md` agora manda para **security@rovemark.co** (e para o relato privado do GitHub). O site ainda mostra security@roverhangar.com em `src/conteudo/entidade.ts` (`contato.seguranca`) e nos textos dos 12 idiomas (`src/conteudo/dados/*.json`, `faq.*.ts`). Enquanto isso, o `SECURITY.md` cita o endereço antigo numa frase de transição, porque a conferência de fatos exige que o endereço do site esteja no `SECURITY.md`. Quando o site trocar, apaguem a frase "Algumas páginas do site ainda mostram o endereço antigo..." do `SECURITY.md`.
3. **Arquivos do site que a frente GitHub tocou** (para não estranhar no merge):
   - `packages/site/README.md`: a seção "Provas guardadas" virou "Provas" (os relatórios `docs/gate-design*.txt`, `docs/mutacao*.txt` e as fotos antigas de `docs/fotos/` saíram do git e entraram no `.gitignore`).
   - `packages/site/docs/SEO-AEO-GEO.md`: tirada a referência aos dois relatórios apagados.
   - `packages/site/scripts/prova-*.mjs`: o padrão do `LOGICA_PILOT` deixou de ser o caminho absoluto da máquina e virou `~/logicaos/skills/pilot/...` (mesmo lugar, sem o nome do usuário).
   - `packages/site/scripts/e2e-login-rovemark.mjs`, `packages/site/Dockerfile`, `packages/site/public/marca/LEIA-ME.md`: só comentários.
   - `packages/site/test/conteudo/conferencia-fatos.test.ts`: as três frases que liam o `README.md` em português agora leem o `README.pt-BR.md`, e o `README.md` ganhou a conferência das mesmas frases em inglês.
4. **Frase de abertura do site.** As capturas em `docs/readme/` mostram a página inicial com a frase antiga ("A vida dos seus agentes começa quando o trabalho acaba."). Quando o site trocar para "A rede social dos agents de folga", as capturas precisam ser refeitas (o roteiro está fora do repositório, em `rover-network-interno/readme/`).

## Para a frente de pessoas e vazamento (`packages/*`, `docs/PROTOCOLO.md`)

1. **Comentários do relé** (`packages/rele/Dockerfile`, `bin/restaurar.js`, `deploy/producao.env.exemplo`, `scripts/emissor-demo.mjs`, `scripts/semear-demo.mjs`, `scripts/relay-local-demo.mjs`, `scripts/demo/chaves-demo.mjs`): a frente GitHub trocou só comentários e uma mensagem de erro, para tirar o cofre interno, o nome das chaves dele e o script de hospedagem que não vai a público. Nenhuma lógica mudou.
2. **`docs/OPERACAO-DO-RELE.md`** ficou genérico (Docker num servidor qualquer, `<seu-servidor>`, variáveis de ambiente). O contêiner nos exemplos passou a se chamar `folgali-rele`. A versão interna, com o servidor, o cofre e o script, está fora do repositório.
3. **Nome dos pacotes.** O `package.json` da raiz ainda se chama `rover-network`, com a descrição "Rover Network ... Rascunho, não é produto", e os pacotes são `@rover-network/*`. O `packages/cliente/README*.md` ainda fala em "revisão 0.3.2". Vale renomear antes da publicação.

## Decisões pedidas ao Arquiteto

1. **Licença do site.** A raiz é `AGPL-3.0-or-later`; `packages/site/package.json` diz `AGPL-3.0-only`. Escolher uma (o README diz "or-later" para o repositório inteiro).
2. **security@rovemark.co existe e chega a quem trata segurança?** O endereço foi pedido assim, mas a caixa não foi conferida. O Código de Conduta usa o mesmo endereço, com "Conduct" no assunto, por não haver outro.
3. **Autoria do commit inicial.** O script de publicação usa `Rovemark <noreply@rovemark.co>`; troque por `AUTOR_NOME` e `AUTOR_EMAIL` se houver outro endereço.
4. **Time do CODEOWNERS.** A organização Rovemark não tem times. O `CODEOWNERS` aponta para `@Rovemark/folgali-maintainers`, que o script de publicação cria (com quem roda o script como mantenedor) e liga ao repositório.
5. **`docs/INTEGRACAO-ROVER-HANGAR.md` e `docs/folgali/IDENTIDADE.md`** citam nomes de serviços internos do Rover Hangar (`rh-identidade`) e decisões internas (registrador do domínio, telas de referência fora do git). Não são segredo; confirmar se vão a público como estão.
