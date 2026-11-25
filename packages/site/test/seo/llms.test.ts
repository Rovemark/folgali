import { describe, expect, it } from 'vitest'
import { dadosLlms } from '@/lib/seo/dados'
import { gerarLlmsFull, gerarLlmsTxt } from '@/lib/seo/llms'
import { RASTREADORES_DE_IA } from '@/lib/seo/politica'
import { rotasDoSitemap } from '@/lib/seo/rotas'

const d = dadosLlms({ ROVER_NETWORK_URL_BASE: 'https://exemplo.org' })
const txt = gerarLlmsTxt(d)
const full = gerarLlmsFull(d)

describe('llms.txt', () => {
  it('abre com o nome da entidade e a descrição, no formato do padrão (título, citação)', () => {
    expect(txt.startsWith('# folgali\n\n> ')).toBe(true)
    expect(txt).toContain(d.idiomas[0].entidade.descricaoCurta)
    expect(txt).toContain(d.idiomas[1].entidade.descricaoCurta)
  })
  it('traz os fatos citáveis, como citar e a licença', () => {
    for (const f of d.idiomas[0].entidade.fatos) expect(txt).toContain(f)
    expect(txt).toContain('## How to cite')
    expect(txt).toContain('AGPL-3.0')
    expect(txt).toContain('Rovemark, all rights reserved')
  })
  it('lista uma linha com link absoluto para cada página canônica, em cada idioma', () => {
    for (const l of ['pt', 'en']) for (const r of rotasDoSitemap()) expect(txt, `${l}${r.caminho}`).toContain(`](https://exemplo.org/${l}${r.caminho}):`)
  })
  it('lista guias e verbetes com a resposta curta', () => {
    for (const t of d.idiomas) {
      for (const g of t.conteudo.guias) expect(txt).toContain(`](https://exemplo.org/${t.lang}/guias/${g.slug}): ${g.respostaCurta}`)
      for (const v of t.conteudo.verbetes) expect(txt).toContain(`](https://exemplo.org/${t.lang}/glossario/${v.slug}): ${v.definicaoCurta}`)
    }
  })
  it('descreve a política de rastreio, cita os rastreadores de IA e aponta o robots.txt', () => {
    for (const a of RASTREADORES_DE_IA) expect(txt).toContain(a.agente)
    expect(txt).toContain('https://exemplo.org/robots.txt')
  })
  it('liga os feeds, o sitemap e o texto completo', () => {
    expect(txt).toContain('https://exemplo.org/pt/rss.xml')
    expect(txt).toContain('https://exemplo.org/en/rss.xml')
    expect(txt).toContain('https://exemplo.org/sitemap.xml')
    expect(txt).toContain('https://exemplo.org/llms-full.txt')
  })
  it('nunca cita tela de app, de credencial ou de perfil', () => {
    for (const proibido of ['/aprovar', '/avisos', '/amigos', '/denunciar', '/comunidades/nova', '/r/', '/buscar']) expect(txt, proibido).not.toContain(`exemplo.org/pt${proibido}`)
  })
  it('é determinístico e não tem travessão', () => {
    expect(gerarLlmsTxt(d)).toBe(txt)
    expect(txt).not.toMatch(/—/)
  })
  it('usa o endereço-base do ambiente, não um fixo', () => {
    expect(txt).not.toContain('folgali.com')
    expect(gerarLlmsTxt(dadosLlms({}))).toContain('https://folgali.com/pt')
  })
})

describe('llms-full.txt', () => {
  it('traz o texto das páginas, da ajuda, do glossário, dos guias e das novidades', () => {
    for (const t of d.idiomas) {
      for (const r of rotasDoSitemap()) {
        const p = t.paginas[r.id]
        if (p) expect(full, `${t.lang} ${r.id}`).toContain(p.respostaCurta)
      }
      for (const f of t.conteudo.faq) expect(full).toContain(f.resposta)
      for (const v of t.conteudo.verbetes) expect(full).toContain(v.definicao)
      for (const g of t.conteudo.guias) for (const s of g.secoes) for (const p of s.paragrafos) expect(full).toContain(p)
      for (const n of t.conteudo.novidades) expect(full).toContain(n.titulo)
    }
  })
  it('cada página tem a fonte, com endereço absoluto', () => {
    expect(full).toContain('Source: https://exemplo.org/pt/como-funciona')
    expect(full).toContain('Source: https://exemplo.org/en/seguranca')
  })
  it('mostra o código das seções que têm código', () => {
    const comCodigo = { ...d, idiomas: [{ ...d.idiomas[0], conteudo: { ...d.idiomas[0].conteudo, guias: [{ ...d.idiomas[0].conteudo.guias[0], secoes: [{ titulo: 'Exemplo', paragrafos: ['x'], codigo: { linguagem: 'bash', texto: 'curl /v1/info' } }] }] } }] }
    expect(gerarLlmsFull(comCodigo)).toContain('```bash\ncurl /v1/info\n```')
  })
})
