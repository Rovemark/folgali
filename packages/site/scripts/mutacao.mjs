#!/usr/bin/env node
// Medidor de mutação dos módulos de regra (aprovação humana, limites de texto, filtro de invisíveis,
// privacidade, denúncia, handle, ranking). Três etapas, e o medidor se recusa a dar nota se alguma falhar:
//
//   1. GUARDA DE BASE: os testes dos módulos precisam estar verdes antes de qualquer mutação.
//   2. GUARDA DE DEFEITO LETAL: planta à mão defeitos que NÃO podem passar (aprovar versão velha, deixar
//      etiqueta invisível, vazar quem denunciou, estourar o limite) numa cópia do projeto e exige que os
//      testes acusem cada um. Se um passar, o medidor não está mordendo e a nota seria mentira.
//   3. STRYKER: gera as mutações automáticas, roda os testes e escreve reports/mutacao.json e .html.
//
// Uso: node scripts/mutacao.mjs [--so-guardas]

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const soGuardas = process.argv.includes('--so-guardas')
// `test/dominio` já inclui os social-*.test.ts (permissões, depoimento, moderação, texto social, aprovação social, atos, paridade)
const TESTES_DE_REGRA = ['test/dominio', 'test/dominio/social-permissoes.test.ts', 'test/dominio/social-depoimento-moderacao.test.ts', 'test/dominio/social-texto.test.ts', 'test/dominio/social-aprovacao.test.ts', 'test/dominio/social-ato.test.ts', 'test/cliente/falso.test.ts']

function vitest(cwd, alvos) {
  const r = spawnSync('npx', ['vitest', 'run', ...alvos], { cwd, encoding: 'utf8' })
  return { ok: r.status === 0, saida: `${r.stdout}\n${r.stderr}` }
}

console.log('1. guarda de base: os testes das regras passam sem defeito?')
const base = vitest(raiz, TESTES_DE_REGRA)
if (!base.ok) {
  console.error(base.saida.split('\n').slice(-25).join('\n'))
  console.error('\nBASE VERMELHA: conserte os testes antes de medir mutação.')
  process.exit(1)
}
console.log('   verde.\n')

// cada defeito: arquivo, trecho exato a trocar, troca, e o nome do que ele quebra
const DEFEITOS = [
  { arq: 'src/lib/dominio/aprovacao.ts', de: 'if (versaoVista !== r.versao) return', para: 'if (false) return', nome: 'aprovar uma versão que a pessoa não viu' },
  { arq: 'src/lib/dominio/aprovacao.ts', de: "if (r.estado !== 'pendente') return { ok: false, motivo: 'estado'", para: "if (false) return { ok: false, motivo: 'estado'", nome: 'aprovar de novo um rascunho já decidido' },
  { arq: 'src/lib/dominio/aprovacao.ts', de: 'if (bloqueia(achados)) return', para: 'if (false) return', nome: 'aprovar texto com dado privado' },
  { arq: 'src/lib/dominio/aprovacao.ts', de: 'return a.selo === resumo(conteudoDoSelo(p, a.rascunhoId, a.versao))', para: 'return true', nome: 'aceitar objeto com selo adulterado' },
  { arq: 'src/lib/dominio/invisivel.ts', de: 'if (cp >= 0xe0000 && cp <= 0xe007f) {', para: 'if (false) {', nome: 'deixar passar etiqueta invisível (instrução escondida)' },
  { arq: 'src/lib/dominio/invisivel.ts', de: 'function ehBidi(cp: number): boolean {\n  return', para: 'function ehBidi(cp: number): boolean {\n  return false &&', nome: 'deixar passar controle de direção (U+202E)' },
  { arq: 'src/lib/dominio/limites.ts', de: 'if (usados > limite) return', para: 'if (false) return', nome: 'aceitar texto acima do limite' },
  { arq: 'src/lib/dominio/limites.ts', de: 'return Array.from(texto).length', para: 'return 0', nome: 'contar zero caracteres' },
  { arq: 'src/lib/dominio/privacidade.ts', de: "['email', /[^\\s@]{1,64}@", para: "['email', /NUNCA_CASA@", nome: 'não enxergar e-mail' },
  { arq: 'src/lib/dominio/denuncia.ts', de: 'return { alvo: d.alvo, motivo: d.motivo }', para: 'return { alvo: d.alvo, motivo: d.motivo, quem: "pessoa" } as never', nome: 'denúncia levando identificação de quem denuncia' },
  { arq: 'src/lib/dominio/denuncia.ts', de: 'doAlvo.length >= TETO_POR_ALVO', para: 'false', nome: 'denúncia em massa contra um alvo sem freio' },
  { arq: 'src/lib/dominio/denuncia.ts', de: 'this.horas.length >= TETO_GLOBAL_POR_HORA', para: 'false', nome: 'denúncia em massa no total sem freio' },
  // ---- rede social (0.3): permissões, depoimento, moderação, texto, aprovação por esquema, atos ----
  { arq: 'src/lib/dominio/permissoes.ts', de: "return x.alvoPapel === 'moderador' || x.alvoPapel === 'dono' ? nega('sem-permissao') : OK", para: 'return OK', nome: 'moderador banir moderador ou dono' },
  { arq: 'src/lib/dominio/permissoes.ts', de: "return acesso !== 'fechada' || membro ? OK : nega('nao-encontrado')", para: 'return OK', nome: 'quem está fora ler uma comunidade fechada' },
  { arq: 'src/lib/dominio/permissoes.ts', de: "return q.papel === 'dono' ? nega('sem-permissao') : OK", para: 'return OK', nome: 'o dono sair sem transferir a posse' },
  { arq: 'src/lib/dominio/permissoes.ts', de: "return q.papel === 'moderador' && x.conteudoDoDono ? nega('sem-permissao') : OK", para: 'return OK', nome: 'moderador remover conteúdo do dono' },
  { arq: 'src/lib/dominio/permissoes.ts', de: "return q.membroHa === undefined || q.membroHa >= exigido ? OK : nega('conta-nova')", para: 'return OK', nome: 'membro novo postar sem a carência' },
  { arq: 'src/lib/dominio/permissoes.ts', de: 'if (r.bloqueio || r.recados === ', para: 'if (r.recados === ', nome: 'recado atravessar um bloqueio' },
  { arq: 'src/lib/dominio/permissoes.ts', de: "return r.amigoHaDias >= dias && r.contaDias >= dias ? OK : nega('conta-nova')", para: 'return OK', nome: 'depoimento e selo de amigo recém-chegado' },
  { arq: 'src/lib/dominio/permissoes.ts', de: "if (origem.acesso === 'fechada' && destino.acesso !== 'fechada'", para: "if (false && destino.acesso !== 'fechada'", nome: 'moderador tornar público um tópico de comunidade fechada' },
  { arq: 'src/lib/dominio/permissoes.ts', de: 'if (x.agoraMs - x.criadoEmMs > EDICAO_TOPICO_S * 1000) return', para: 'if (false) return', nome: 'editar o tópico depois dos 30 minutos' },
  { arq: 'src/lib/dominio/depoimento.ts', de: "if (atual === 'recusado') return null", para: "if (false) return null", nome: 'aceitar um depoimento já recusado' },
  { arq: 'src/lib/dominio/depoimento.ts', de: 'return leitorUid === d.alvo || leitorUid === d.autor.uid', para: 'return true', nome: 'depoimento pendente público' },
  { arq: 'src/lib/dominio/moderacao.ts', de: "return acao === 'expulsar' || acao === 'banir'", para: "return acao === 'expulsar'", nome: 'banir sem motivo' },
  { arq: 'src/lib/dominio/moderacao.ts', de: 'return passou >= 0 && passou <= JANELA_DE_APELACAO_DIAS * 86_400_000', para: 'return passou >= 0', nome: 'apelar depois dos 14 dias' },
  { arq: 'src/lib/dominio/moderacao.ts', de: 'return [...itens].sort(', para: 'return [...itens].filter((d) => d.total < 5).sort(', nome: 'esconder da fila o que tem denúncia demais (moderação por contagem)' },
  { arq: 'src/lib/dominio/moderacao.ts', de: "return quemAgiu === 'moderador' ? 'dono' : 'rele'", para: "return 'dono'", nome: 'o próprio dono decidir a apelação contra ele' },
  { arq: 'src/lib/dominio/aprovacao-social.ts', de: "if (versaoVista !== r.versao) return { ok: false, motivo: 'versao-antiga'", para: "if (false) return { ok: false, motivo: 'versao-antiga'", nome: 'aprovar, num tipo social, uma versão que a pessoa não viu' },
  { arq: 'src/lib/dominio/aprovacao-social.ts', de: "if (bloqueiaSocial(achados)) return { ok: false, motivo: 'bloqueado'", para: "if (false) return { ok: false, motivo: 'bloqueado'", nome: 'aprovar texto social com dado pessoal' },
  { arq: 'src/lib/dominio/aprovacao-social.ts', de: "if (r.estado !== 'pendente') return { ok: false, motivo: 'estado'", para: "if (false) return { ok: false, motivo: 'estado'", nome: 'aprovar de novo um rascunho social já decidido' },
  { arq: 'src/lib/dominio/aprovacao-social.ts', de: 'return a.selo === resumo(conteudoDoSelo(o.tipo, o.autor, o.campos, a.rascunhoId, a.versao))', para: 'return true', nome: 'o selo adulterado de um objeto social valer' },
  { arq: 'src/lib/dominio/aprovacao-social.ts', de: 'if (c.editavel && c.nome in novos)', para: 'if (c.nome in novos)', nome: 'a edição mudar o destino (campo que não é editável)' },
  { arq: 'src/lib/dominio/aprovacao-social.ts', de: 'if (mencoes > MAX_MENCOES)', para: 'if (false)', nome: 'deixar passar mais de 5 menções' },
  { arq: 'src/lib/dominio/texto-social.ts', de: "if (!/^https:\\/\\//.test(link)) return 'link-esquema'", para: "if (false) return 'link-esquema'", nome: 'deixar passar link http' },
  { arq: 'src/lib/dominio/texto-social.ts', de: 'const RE_ESQUEMA_SEM_BARRAS = /\\b(?:javascript|vbscript)\\s*:|', para: 'const RE_ESQUEMA_SEM_BARRAS = /NUNCA_CASA|', nome: 'deixar passar javascript:' },
  { arq: 'src/lib/dominio/texto-social.ts', de: 'const RE_CEP = /(?<![\\d-])\\d{5}-\\d{3}(?![\\d-])/', para: 'const RE_CEP = /NUNCA_CASA_CEP/', nome: 'deixar passar CEP' },
  { arq: 'src/lib/dominio/texto-social.ts', de: "if (chave.startsWith('utm_') || RASTREADORES.includes(chave)) return 'link-rastreador'", para: "if (false) return 'link-rastreador'", nome: 'deixar passar link com rastreador' },
  { arq: 'src/lib/dominio/texto-social.ts', de: "seguro: problemaDoLink(l) === null }", para: 'seguro: true }', nome: 'desenhar como clicável um link que as regras recusam' },
  { arq: 'src/lib/dominio/ato.ts', de: "return ehIdObjeto(o.alvo) ? { tipo: 'remocao-pelo-autor', alvo: o.alvo as string } : null", para: "return { tipo: 'remocao-pelo-autor', alvo: o.alvo as string }", nome: 'aceitar ato do navegador com id inválido' },
  { arq: 'src/lib/dominio/ato.ts', de: 'if (validarGestao(o.acao as AcaoDeGestao, motivo) !== null) return null', para: 'if (false) return null', nome: 'aceitar do navegador banir sem motivo' },
  { arq: 'src/lib/dominio/ato.ts', de: '(o.opcao as number) <= 5', para: 'true', nome: 'aceitar do navegador voto em opção que não existe' },
  // ---- aprovar social (a fila única e a tela dos tipos novos) ----
  { arq: 'src/lib/dominio/fila-aprovacao.ts', de: '(a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0)', para: '(a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : 0)', nome: 'fila com o rascunho mais novo na frente' },
]

console.log('2. guarda de defeito letal: cada defeito plantado precisa ser acusado pelos testes.')
const tmp = join(raiz, '.stryker-tmp', 'letal')
let furou = 0
for (const [i, d] of DEFEITOS.entries()) {
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  for (const pasta of ['src', 'test', 'public']) cpSync(join(raiz, pasta), join(tmp, pasta), { recursive: true })
  for (const f of ['package.json', 'tsconfig.json', 'vitest.config.ts']) cpSync(join(raiz, f), join(tmp, f))
  symlinkSync(join(raiz, 'node_modules'), join(tmp, 'node_modules'))
  const alvo = join(tmp, d.arq)
  const antes = readFileSync(alvo, 'utf8')
  if (!antes.includes(d.de)) {
    console.error(`   defeito ${i + 1} (${d.nome}): o trecho a trocar não existe mais no código. Atualize a lista.`)
    process.exit(1)
  }
  writeFileSync(alvo, antes.replace(d.de, d.para))
  const r = vitest(tmp, TESTES_DE_REGRA)
  if (r.ok) {
    furou++
    console.error(`   NÃO ACUSADO: ${d.nome}`)
  } else console.log(`   acusado: ${d.nome}`)
}
rmSync(tmp, { recursive: true, force: true })
if (furou) {
  console.error(`\n${furou} defeito(s) letal(is) passaram. O medidor não morde: nota recusada.`)
  process.exit(1)
}
console.log(`   ${DEFEITOS.length} de ${DEFEITOS.length} acusados.\n`)
if (soGuardas) process.exit(0)

console.log('3. stryker (mutações automáticas)...')
const s = spawnSync('npx', ['stryker', 'run'], { cwd: raiz, stdio: 'inherit' })
process.exit(s.status ?? 1)
