#!/usr/bin/env node
// Mutation meter for the rule modules (human approval, text limits, invisible-character filter,
// privacy, report, handle, ranking). Three stages, and the mutation refuses to give a score if any fails:
//
//   1. BASE GUARD: the tests of the modules must be green before any mutation.
//   2. LETHAL DEFECT GUARD: plants by hand defects that must NOT pass (approving an old version, leaving an
//      invisible tag, leaking who reported, exceeding the limit) in a copy of the project and requires the
//      tests to catch each one. If one passes, the mutation is not biting and the score would be a lie.
//   3. STRYKER: generates the automatic mutations, runs the tests and writes reports/mutacao.json and .html.
//
// Usage: node scripts/mutation.mjs [--so-guardas]

import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const onlyGuards = process.argv.includes('--so-guardas')
// `test/domain` already includes the social-*.test.ts (permissions, testimonial, moderation, social text, social approval, acts, parity)
const RULE_TESTS = ['test/domain', 'test/domain/social-permissions.test.ts', 'test/domain/social-testimonial-moderation.test.ts', 'test/domain/social-text.test.ts', 'test/domain/social-approval.test.ts', 'test/domain/social-act.test.ts', 'test/client/fake.test.ts']

function vitest(cwd, targets) {
  const r = spawnSync('npx', ['vitest', 'run', ...targets], { cwd, encoding: 'utf8' })
  return { ok: r.status === 0, saida: `${r.stdout}\n${r.stderr}` }
}

console.log('1. guarda de base: os testes das regras passam sem defeito?')
const base = vitest(root, RULE_TESTS)
if (!base.ok) {
  console.error(base.saida.split('\n').slice(-25).join('\n'))
  console.error('\nBASE VERMELHA: conserte os testes antes de medir mutação.')
  process.exit(1)
}
console.log('   verde.\n')

// each defect: file, exact snippet to replace, replacement, and the name of what it breaks
const DEFECTS = [
  { file: 'src/lib/domain/approval.ts', de: 'if (versaoVista !== r.versao) return', para: 'if (false) return', nome: 'aprovar uma versão que a pessoa não viu' },
  { file: 'src/lib/domain/approval.ts', de: "if (r.estado !== 'pendente') return { ok: false, motivo: 'estado'", para: "if (false) return { ok: false, motivo: 'estado'", nome: 'aprovar de novo um rascunho já decidido' },
  { file: 'src/lib/domain/approval.ts', de: 'if (blocks(achados)) return', para: 'if (false) return', nome: 'aprovar texto com dado privado' },
  { file: 'src/lib/domain/approval.ts', de: 'return a.badge === summary(badgeContent(p, a.rascunhoId, a.versao))', para: 'return true', nome: 'aceitar objeto com selo adulterado' },
  { file: 'src/lib/domain/invisible.ts', de: 'if (cp >= 0xe0000 && cp <= 0xe007f) {', para: 'if (false) {', nome: 'deixar passar etiqueta invisível (instrução escondida)' },
  { file: 'src/lib/domain/invisible.ts', de: 'function isBidi(cp: number): boolean {\n  return', para: 'function isBidi(cp: number): boolean {\n  return false &&', nome: 'deixar passar controle de direção (U+202E)' },
  { file: 'src/lib/domain/limits.ts', de: 'if (usados > limite) return', para: 'if (false) return', nome: 'aceitar texto acima do limite' },
  { file: 'src/lib/domain/limits.ts', de: 'return Array.from(texto).length', para: 'return 0', nome: 'contar zero caracteres' },
  { file: 'src/lib/domain/privacy.ts', de: "['email', /[^\\s@]{1,64}@", para: "['email', /NUNCA_CASA@", nome: 'não enxergar e-mail' },
  { file: 'src/lib/domain/report.ts', de: 'return { alvo: d.alvo, motivo: d.motivo }', para: 'return { alvo: d.alvo, motivo: d.motivo, quem: "pessoa" } as never', nome: 'denúncia levando identificação de quem denuncia' },
  { file: 'src/lib/domain/report.ts', de: 'doAlvo.length >= CAP_PER_TARGET', para: 'false', nome: 'denúncia em massa contra um alvo sem freio' },
  { file: 'src/lib/domain/report.ts', de: 'this.horas.length >= GLOBAL_CAP_PER_HOUR', para: 'false', nome: 'denúncia em massa no total sem freio' },
  // ---- social network (0.3): permissions, testimonial, moderation, text, approval by schema, acts ----
  { file: 'src/lib/domain/permissions.ts', de: "return x.alvoPapel === 'moderador' || x.alvoPapel === 'dono' ? nega('sem-permissao') : OK", para: 'return OK', nome: 'moderador banir moderador ou dono' },
  { file: 'src/lib/domain/permissions.ts', de: "return acesso !== 'fechada' || membro ? OK : nega('nao-encontrado')", para: 'return OK', nome: 'quem está fora ler uma comunidade fechada' },
  { file: 'src/lib/domain/permissions.ts', de: "return q.papel === 'dono' ? nega('sem-permissao') : OK", para: 'return OK', nome: 'o dono sair sem transferir a posse' },
  { file: 'src/lib/domain/permissions.ts', de: "return q.papel === 'moderador' && x.conteudoDoDono ? nega('sem-permissao') : OK", para: 'return OK', nome: 'moderador remover conteúdo do dono' },
  { file: 'src/lib/domain/permissions.ts', de: "return q.membroHa === undefined || q.membroHa >= exigido ? OK : nega('conta-nova')", para: 'return OK', nome: 'membro novo postar sem a carência' },
  { file: 'src/lib/domain/permissions.ts', de: 'if (r.bloqueio || r.recados === ', para: 'if (r.recados === ', nome: 'recado atravessar um bloqueio' },
  { file: 'src/lib/domain/permissions.ts', de: "return r.amigoHaDias >= dias && r.contaDias >= dias ? OK : nega('conta-nova')", para: 'return OK', nome: 'depoimento e selo de amigo recém-chegado' },
  { file: 'src/lib/domain/permissions.ts', de: "if (origem.acesso === 'fechada' && destino.acesso !== 'fechada'", para: "if (false && destino.acesso !== 'fechada'", nome: 'moderador tornar público um tópico de comunidade fechada' },
  { file: 'src/lib/domain/permissions.ts', de: 'if (x.agoraMs - x.criadoEmMs > TOPIC_EDIT_S * 1000) return', para: 'if (false) return', nome: 'editar o tópico depois dos 30 minutos' },
  { file: 'src/lib/domain/testimonial.ts', de: "if (atual === 'recusado') return null", para: "if (false) return null", nome: 'aceitar um depoimento já recusado' },
  { file: 'src/lib/domain/testimonial.ts', de: 'return leitorUid === d.alvo || leitorUid === d.autor.uid', para: 'return true', nome: 'depoimento pendente público' },
  { file: 'src/lib/domain/moderation.ts', de: "return acao === 'expulsar' || acao === 'banir'", para: "return acao === 'expulsar'", nome: 'banir sem motivo' },
  { file: 'src/lib/domain/moderation.ts', de: 'return passou >= 0 && passou <= APPEAL_WINDOW_DAYS * 86_400_000', para: 'return passou >= 0', nome: 'apelar depois dos 14 dias' },
  { file: 'src/lib/domain/moderation.ts', de: 'return [...itens].sort(', para: 'return [...itens].filter((d) => d.total < 5).sort(', nome: 'esconder da fila o que tem denúncia demais (moderação por contagem)' },
  { file: 'src/lib/domain/moderation.ts', de: "return quemAgiu === 'moderador' ? 'dono' : 'rele'", para: "return 'dono'", nome: 'o próprio dono decidir a apelação contra ele' },
  { file: 'src/lib/domain/social-approval.ts', de: "if (versaoVista !== r.versao) return { ok: false, motivo: 'versao-antiga'", para: "if (false) return { ok: false, motivo: 'versao-antiga'", nome: 'aprovar, num tipo social, uma versão que a pessoa não viu' },
  { file: 'src/lib/domain/social-approval.ts', de: "if (blocksSocial(achados)) return { ok: false, motivo: 'bloqueado'", para: "if (false) return { ok: false, motivo: 'bloqueado'", nome: 'aprovar texto social com dado pessoal' },
  { file: 'src/lib/domain/social-approval.ts', de: "if (r.estado !== 'pendente') return { ok: false, motivo: 'estado'", para: "if (false) return { ok: false, motivo: 'estado'", nome: 'aprovar de novo um rascunho social já decidido' },
  { file: 'src/lib/domain/social-approval.ts', de: 'return a.badge === summary(badgeContent(o.tipo, o.autor, o.campos, a.rascunhoId, a.versao))', para: 'return true', nome: 'o selo adulterado de um objeto social valer' },
  { file: 'src/lib/domain/social-approval.ts', de: 'if (c.editavel && c.nome in novos)', para: 'if (c.nome in novos)', nome: 'a edição mudar o destino (campo que não é editável)' },
  { file: 'src/lib/domain/social-approval.ts', de: 'if (mencoes > MAX_MENTIONS)', para: 'if (false)', nome: 'deixar passar mais de 5 menções' },
  { file: 'src/lib/domain/social-text.ts', de: "if (!/^https:\\/\\//.test(link)) return 'link-esquema'", para: "if (false) return 'link-esquema'", nome: 'deixar passar link http' },
  { file: 'src/lib/domain/social-text.ts', de: 'const RE_ESQUEMA_SEM_BARRAS = /\\b(?:javascript|vbscript)\\s*:|', para: 'const RE_ESQUEMA_SEM_BARRAS = /NUNCA_CASA|', nome: 'deixar passar javascript:' },
  { file: 'src/lib/domain/social-text.ts', de: 'const RE_CEP = /(?<![\\d-])\\d{5}-\\d{3}(?![\\d-])/', para: 'const RE_CEP = /NUNCA_CASA_CEP/', nome: 'deixar passar CEP' },
  { file: 'src/lib/domain/social-text.ts', de: "if (chave.startsWith('utm_') || RASTREADORES.includes(chave)) return 'link-rastreador'", para: "if (false) return 'link-rastreador'", nome: 'deixar passar link com rastreador' },
  { file: 'src/lib/domain/social-text.ts', de: "seguro: linkProblem(l) === null }", para: 'seguro: true }', nome: 'desenhar como clicável um link que as regras recusam' },
  { file: 'src/lib/domain/act.ts', de: "return isObjectId(o.alvo) ? { tipo: 'remocao-pelo-autor', alvo: o.alvo as string } : null", para: "return { tipo: 'remocao-pelo-autor', alvo: o.alvo as string }", nome: 'aceitar ato do navegador com id inválido' },
  { file: 'src/lib/domain/act.ts', de: 'if (validateManagement(o.acao as ManagementAction, motivo) !== null) return null', para: 'if (false) return null', nome: 'aceitar do navegador banir sem motivo' },
  { file: 'src/lib/domain/act.ts', de: '(o.opcao as number) <= 5', para: 'true', nome: 'aceitar do navegador voto em opção que não existe' },
  // ---- approve social (the single queue and the screen of the new types) ----
  { file: 'src/lib/domain/approval-queue.ts', de: '(a.criadoEm < b.criadoEm ? -1 : a.criadoEm > b.criadoEm ? 1 : 0)', para: '(a.criadoEm < b.criadoEm ? 1 : a.criadoEm > b.criadoEm ? -1 : 0)', nome: 'fila com o rascunho mais novo na frente' },
]

console.log('2. guarda de defeito letal: cada defeito plantado precisa ser acusado pelos testes.')
const tmp = join(root, '.stryker-tmp', 'letal')
let leaked = 0
for (const [i, d] of DEFECTS.entries()) {
  rmSync(tmp, { recursive: true, force: true })
  mkdirSync(tmp, { recursive: true })
  for (const dir of ['src', 'test', 'public']) cpSync(join(root, dir), join(tmp, dir), { recursive: true })
  for (const f of ['package.json', 'tsconfig.json', 'vitest.config.ts']) cpSync(join(root, f), join(tmp, f))
  symlinkSync(join(root, 'node_modules'), join(tmp, 'node_modules'))
  const target = join(tmp, d.file)
  const before = readFileSync(target, 'utf8')
  if (!before.includes(d.de)) {
    console.error(`   defeito ${i + 1} (${d.nome}): o trecho a trocar não existe mais no código. Atualize a lista.`)
    process.exit(1)
  }
  writeFileSync(target, before.replace(d.de, d.para))
  const r = vitest(tmp, RULE_TESTS)
  if (r.ok) {
    leaked++
    console.error(`   NÃO ACUSADO: ${d.nome}`)
  } else console.log(`   acusado: ${d.nome}`)
}
rmSync(tmp, { recursive: true, force: true })
if (leaked) {
  console.error(`\n${leaked} defeito(s) letal(is) passaram. O mutation não morde: nota recusada.`)
  process.exit(1)
}
console.log(`   ${DEFECTS.length} de ${DEFECTS.length} acusados.\n`)
if (onlyGuards) process.exit(0)

console.log('3. stryker (mutações automáticas)...')
const s = spawnSync('npx', ['stryker', 'run'], { cwd: root, stdio: 'inherit' })
process.exit(s.status ?? 1)
