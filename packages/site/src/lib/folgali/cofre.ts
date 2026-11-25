import 'server-only'
// O cofre do servidor da folgali: as sessões (fichas da Rovemark cifradas, nunca no navegador) e o que cada pessoa ligou
// (rovers e agentes de fora), que a Central de Contas pergunta. Um arquivo JSON com permissão 600 em FOLGALI_DADOS_DIR
// (padrão `.folgali-dados/`, fora do git). Um processo só escreve, e cada escrita grava o arquivo inteiro de forma atômica.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { abrir, selar } from './login'

export interface Sessao {
  pessoa: string
  nome: string
  /** fichas lacradas com o segredo da sessão */
  fichas: string
  /** quando a ficha de acesso vence (ms) */
  venceEm: number
  criadaEm: number
}

export interface Ligado {
  id: string
  tipo: 'rover' | 'agente'
  nome: string
  origem?: string
  ligadoEm: string
}

interface Dados {
  sessoes: Record<string, Sessao>
  ligados: Record<string, Ligado[]>
}

const vazio = (): Dados => ({ sessoes: {}, ligados: {} })
let memoria: { dir: string; dados: Dados } | null = null

const pasta = (env = process.env) => env.FOLGALI_DADOS_DIR || join(process.cwd(), '.folgali-dados')

function carregar(): Dados {
  const dir = pasta()
  if (memoria && memoria.dir === dir) return memoria.dados
  let dados = vazio()
  try {
    const bruto = JSON.parse(readFileSync(join(dir, 'cofre.json'), 'utf8')) as Partial<Dados>
    dados = { sessoes: bruto.sessoes ?? {}, ligados: bruto.ligados ?? {} }
  } catch {
    /* primeiro uso */
  }
  memoria = { dir, dados }
  return dados
}

function gravar(d: Dados) {
  const dir = pasta()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = join(dir, `cofre.${process.pid}.tmp`)
  writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 })
  renameSync(tmp, join(dir, 'cofre.json'))
}

export type FichasGuardadas = { at: string; rt: string }

export const novoSid = () => randomBytes(24).toString('base64url')

export function salvarSessao(sid: string, s: { pessoa: string; nome: string; fichas: FichasGuardadas; venceEm: number }, segredo: string) {
  const d = carregar()
  const antiga = d.sessoes[sid]
  d.sessoes[sid] = { pessoa: s.pessoa, nome: s.nome, fichas: selar(s.fichas, segredo, 'fichas'), venceEm: s.venceEm, criadaEm: antiga?.criadaEm ?? Date.now() }
  gravar(d)
}

export function lerSessao(sid: string): Sessao | null {
  return carregar().sessoes[sid] ?? null
}

export const fichasDa = (s: Sessao, segredo: string) => abrir<FichasGuardadas>(s.fichas, segredo, 'fichas')

export function apagarSessao(sid: string) {
  const d = carregar()
  if (!d.sessoes[sid]) return
  delete d.sessoes[sid]
  gravar(d)
}

/** Apaga tudo da pessoa: as sessões e o que ela ligou (conta Rovemark apagada). */
export function apagarPessoa(pessoa: string): number {
  const d = carregar()
  let n = 0
  for (const [sid, s] of Object.entries(d.sessoes)) {
    if (s.pessoa !== pessoa) continue
    delete d.sessoes[sid]
    n++
  }
  if (d.ligados[pessoa]) {
    delete d.ligados[pessoa]
    n++
  }
  gravar(d)
  return n
}

export const ligadosDe = (pessoa: string): Ligado[] => carregar().ligados[pessoa] ?? []

export function ligar(pessoa: string, item: Ligado) {
  const d = carregar()
  const lista = (d.ligados[pessoa] ?? []).filter((x) => !(x.tipo === item.tipo && x.id === item.id))
  d.ligados[pessoa] = [...lista, item].slice(-200)
  gravar(d)
}

export function desligar(pessoa: string, tipo: Ligado['tipo'], id: string): boolean {
  const d = carregar()
  const antes = d.ligados[pessoa] ?? []
  const depois = antes.filter((x) => !(x.tipo === tipo && x.id === id))
  if (depois.length === antes.length) return false
  d.ligados[pessoa] = depois
  gravar(d)
  return true
}

/** Só para os testes: esquece o que está em memória (o próximo uso relê o arquivo da pasta atual). */
export function _esquecer() {
  memoria = null
}
