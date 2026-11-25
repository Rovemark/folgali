import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { corDoChip, resolverMarcas, STATUS_PADRAO, statusParaFiltro, statusValeNaCategoria } from '@/lib/dominio/vocabulario'
import { CORES_DE_VOCABULARIO, type Vocabulario } from '@/lib/social/tipos'
import { marcasAditivo, vocabularioAditivo } from '@/lib/social/sanear-social'

const voc: Vocabulario = {
  etiquetas: [{ chave: 'bug', rotulo: 'Bug', cor: 'vermelho' }, { chave: 'ideia', rotulo: 'Ideia', cor: 'azul' }],
  status: [
    { chave: 'aberto', rotulo: 'Aberto', cor: 'verde', categorias: null },
    { chave: 'respondido', rotulo: 'Respondido', cor: 'azul', categorias: ['Dúvidas'] },
  ],
  padrao: false,
}

describe('status por categoria', () => {
  it('sem lista vale em toda categoria, inclusive a ausente; com lista só nas dela', () => {
    expect(statusValeNaCategoria({ categorias: null }, null)).toBe(true)
    expect(statusValeNaCategoria({ categorias: null }, 'Dúvidas')).toBe(true)
    expect(statusValeNaCategoria({ categorias: ['Dúvidas'] }, 'Dúvidas')).toBe(true)
    expect(statusValeNaCategoria({ categorias: ['Dúvidas'] }, 'Dicas')).toBe(false)
    expect(statusValeNaCategoria({ categorias: ['Dúvidas'] }, null)).toBe(false)
  })
  it('o filtro oferece todos os status sem categoria escolhida e só os que valem com ela', () => {
    expect(statusParaFiltro(voc, undefined).map((s) => s.chave)).toEqual(['aberto', 'respondido'])
    expect(statusParaFiltro(voc, 'Dúvidas').map((s) => s.chave)).toEqual(['aberto', 'respondido'])
    expect(statusParaFiltro(voc, 'Dicas').map((s) => s.chave)).toEqual(['aberto'])
  })
})

describe('resolver as chaves de um tópico pelo vocabulário', () => {
  it('troca a chave pelo rótulo e pela cor, na ordem do tópico', () => {
    const r = resolverMarcas({ etiquetas: ['ideia', 'bug'], status: 'respondido' }, voc)!
    expect(r.etiquetas.map((e) => e.rotulo)).toEqual(['Ideia', 'Bug'])
    expect(r.status).toMatchObject({ chave: 'respondido', rotulo: 'Respondido', cor: 'azul' })
  })
  it('chave que o vocabulário não conhece some (nunca aparece como código)', () => {
    const r = resolverMarcas({ etiquetas: ['bug', 'apagada'], status: 'sumiu' }, voc)!
    expect(r.etiquetas.map((e) => e.chave)).toEqual(['bug'])
    expect(r.status).toBeNull()
    expect(resolverMarcas({ etiquetas: ['apagada'], status: 'sumiu' }, voc)).toBeNull()
  })
  it('só status, só etiqueta, sem marca e sem vocabulário', () => {
    expect(resolverMarcas({ etiquetas: [], status: 'aberto' }, voc)).toMatchObject({ etiquetas: [], status: { chave: 'aberto' } })
    expect(resolverMarcas({ etiquetas: ['bug'], status: null }, voc)).toMatchObject({ status: null, etiquetas: [{ chave: 'bug' }] })
    expect(resolverMarcas({ etiquetas: [], status: null }, voc)).toBeNull()
    expect(resolverMarcas(undefined, voc)).toBeNull()
    expect(resolverMarcas({ etiquetas: ['bug'], status: null }, undefined)).toBeNull()
  })
})

describe('cor do chip', () => {
  it('as oito do protocolo passam; qualquer outra vira cinza (nunca vira estilo escrito por estranho)', () => {
    for (const c of CORES_DE_VOCABULARIO) expect(corDoChip(c)).toBe(c)
    for (const c of ['red', '#f00', 'Azul', '', 'azul; background:url(x)', 'constructor']) expect(corDoChip(c)).toBe('cinza')
  })
})

// ---- paridade com o protocolo (packages/protocolo, mesma árvore) -----------------------------------------------------------------
const caminho = [process.env.ROVER_PROTOCOLO_03, fileURLToPath(new URL('../../../protocolo/src/index.js', import.meta.url))].filter((x): x is string => !!x).find((c) => existsSync(c))
type Protocolo = { CORES_DE_VOCABULARIO?: readonly string[]; STATUS_PADRAO?: readonly Record<string, unknown>[]; CHAVE_DE_VOCABULARIO_RE?: RegExp; ROTULO_DE_VOCABULARIO_RE?: RegExp }
const P = caminho ? ((await import(/* @vite-ignore */ caminho)) as Protocolo) : null
const tem032 = !!P && Array.isArray(P.CORES_DE_VOCABULARIO) && !!P.CHAVE_DE_VOCABULARIO_RE && !!P.ROTULO_DE_VOCABULARIO_RE

describe.skipIf(!tem032)(`paridade do vocabulário com o protocolo 0.3.2${tem032 ? '' : ' (desligado: o protocolo ao lado do site é anterior à 0.3.2)'}`, () => {
  it('as oito cores e o status padrão são os mesmos', () => {
    expect([...CORES_DE_VOCABULARIO]).toEqual([...P!.CORES_DE_VOCABULARIO!])
    expect(STATUS_PADRAO.map((s) => ({ ...s }))).toEqual(P!.STATUS_PADRAO!.map((s) => ({ ...s })))
  })
  const vocab = (rotulo: string, chave = 'bug') => ({ etiquetas: [{ chave, rotulo, cor: 'azul' }], status: [], padrao: false })
  it('o que o site aceita como rótulo e como chave o protocolo também aceita (e o que o protocolo recusa o site descarta)', () => {
    const rotulos = ['Bug', 'Dúvida', 'Em andamento', "D'água", 'Pré-venda', 'Sprint 2', '日本語', 'Ab', 'a'.repeat(24), 'a'.repeat(25), 'B', ' Bug', 'Bug-', 'Em  andamento', '**Bug**', 'http://x.com', 'Bug\nurgente', 'Bug!', '#bug', 'bug_x', 'Bug 🐛', 'Dúvida'.normalize('NFD')]
    for (const r of rotulos) {
      const site = vocabularioAditivo(vocab(r))?.etiquetas.length === 1
      const protocolo = P!.ROTULO_DE_VOCABULARIO_RE!.test(r) && !r.includes('  ') && r === r.normalize('NFC')
      expect(site, JSON.stringify(r)).toBe(protocolo)
    }
    for (const c of ['bug', 'em-andamento', 'a1', 'a'.repeat(20), 'a'.repeat(21), 'a', '1abc', '-abc', 'Bug', 'dúvida', 'bug bug', '']) {
      expect(vocabularioAditivo(vocab('Bug', c))?.etiquetas.length === 1, JSON.stringify(c)).toBe(P!.CHAVE_DE_VOCABULARIO_RE!.test(c))
      expect(marcasAditivo({ etiquetas: [c], status: null }) !== undefined, JSON.stringify(c)).toBe(P!.CHAVE_DE_VOCABULARIO_RE!.test(c))
    }
  })
})
