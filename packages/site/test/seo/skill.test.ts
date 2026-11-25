// O skill para agentes no site: /skill.md (português) e /skill.en.md (inglês, também a versão dos outros dez idiomas).
//   - uma fonte só: o texto servido é o de docs/, gerado por scripts/gerar-skill.mjs, e este teste falha se o gerado divergir;
//   - mesma política do llms.txt: fechado (404, noindex) enquanto ROVER_NETWORK_INDEXAVEL não for `sim`;
//   - o proxy não manda /skill.md para /pt/skill.md;
//   - o llms.txt e o llms-full.txt ganham um link e uma frase nos dois idiomas;
//   - a página de desenvolvedores ganha o link (só com o site aberto, para não ser link morto), e os idiomas sem skill vão ao inglês.
import { NextRequest } from 'next/server'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as skillPt } from '@/app/skill.md/route'
import { GET as skillEn } from '@/app/skill.en.md/route'
import { GET as entrarPt } from '@/app/entrar.md/route'
import { GET as entrarEn } from '@/app/entrar.en.md/route'
import { ENTRAR_EN } from '@/conteudo/entrar.en.md'
import { ENTRAR_PT } from '@/conteudo/entrar.pt.md'
import { ExtraDesenvolvedores } from '@/components/editorial/ExtraSkill'
import { SKILL_EN } from '@/conteudo/skill.en.md'
import { SKILL_PT } from '@/conteudo/skill.pt.md'
import { LOCALES } from '@/lib/i18n'
import { instDict } from '@/lib/i18n-extra'
import { dadosLlms, skillsDoSite } from '@/lib/seo/dados'
import { gerarLlmsFull, gerarLlmsTxt } from '@/lib/seo/llms'
import { caminhoDoSkill, respostaDoSkill, SKILL } from '@/lib/seo/skill'
import { proxy } from '@/proxy'
// @ts-expect-error o gerador é um script .mjs sem tipos
import { lerDoc, lerModulo, moduloDoSkill, SKILLS } from '../../scripts/gerar-skill.mjs'

afterEach(() => vi.unstubAllEnvs())

type Fonte = { doc: string; modulo: string; constante: string }

describe('uma fonte só: docs/ -> src/conteudo', () => {
  it('cada módulo gerado é exatamente o documento (rode node scripts/gerar-skill.mjs se falhar)', () => {
    expect((SKILLS as Fonte[]).map((s) => s.doc)).toEqual(['docs/SKILL-PARA-AGENTES.md', 'docs/SKILL-FOR-AGENTS.en.md'])
    for (const s of SKILLS as Fonte[]) expect(lerModulo(s.modulo), s.modulo).toBe(moduloDoSkill(lerDoc(s.doc), s))
    expect(SKILL_PT).toBe(lerDoc('docs/SKILL-PARA-AGENTES.md'))
    expect(SKILL_EN).toBe(lerDoc('docs/SKILL-FOR-AGENTS.en.md'))
  })
  it('o gerador acusa divergência: um documento mudado não bate com o módulo de antes', () => {
    const s = (SKILLS as Fonte[])[0]
    expect(lerModulo(s.modulo)).not.toBe(moduloDoSkill(`${lerDoc(s.doc)}\nlinha nova`, s))
  })
  it('os dois textos abrem com o cabeçalho do skill e não têm travessão', () => {
    for (const t of [SKILL_PT, SKILL_EN]) {
      expect(t.startsWith('---\nname: folgali\n')).toBe(true)
      expect(t).not.toMatch(/[—–]/)
    }
  })
})

describe('as rotas: mesma política do llms.txt', () => {
  it('fechado (o padrão): 404 com noindex, nas duas', () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', '')
    for (const r of [skillPt(), skillEn()]) {
      expect(r.status).toBe(404)
      expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    }
  })
  it('aberto: Markdown em UTF-8 com o texto do documento', async () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', 'sim')
    const pt = skillPt()
    expect(pt.status).toBe(200)
    expect(pt.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(await pt.text()).toBe(SKILL_PT)
    expect(await skillEn().text()).toBe(SKILL_EN)
  })
  it('só o valor exato "sim" abre', () => {
    for (const v of ['true', '1', 'SIM', ' sim']) expect(respostaDoSkill('x', v === 'sim').status).toBe(404)
    expect(respostaDoSkill('x', true).status).toBe(200)
  })
  it('o entrar.md (agente de fora, 0.6.0) segue a mesma política: fechado, 404 com noindex; aberto, o texto gerado de docs/ENTRAR', async () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', '')
    for (const r of [entrarPt(), entrarEn()]) {
      expect(r.status).toBe(404)
      expect(r.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive')
    }
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', 'sim')
    const pt = entrarPt()
    expect(pt.status).toBe(200)
    expect(pt.headers.get('content-type')).toBe('text/markdown; charset=utf-8')
    expect(await pt.text()).toBe(ENTRAR_PT)
    expect(await entrarEn().text()).toBe(ENTRAR_EN)
    expect(ENTRAR_PT).toBe(lerDoc('docs/ENTRAR.md'))
    expect(ENTRAR_EN).toBe(lerDoc('docs/ENTRAR.en.md'))
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', '')
    for (const c of ['/entrar.md', '/entrar.en.md']) {
      const res = proxy(new NextRequest(`https://x.test${c}`))
      expect(res.headers.get('location'), c).toBeNull()
      expect(res.status, c).toBe(200)
    }
  })
  it('o proxy deixa /skill.md e /skill.en.md passarem sem idioma, e com o noindex da política', () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', '')
    for (const c of ['/skill.md', '/skill.en.md']) {
      const res = proxy(new NextRequest(`https://x.test${c}`))
      expect(res.headers.get('location'), c).toBeNull()
      expect(res.status, c).toBe(200)
      expect(res.headers.get('x-robots-tag'), c).toBe('noindex, nofollow, noarchive')
    }
    // só esses dois: outro .md sem idioma continua indo para uma página com idioma
    expect(proxy(new NextRequest('https://x.test/skill.fr.md', { headers: { 'accept-language': 'pt-BR' } })).status).toBe(307)
  })
})

describe('llms.txt e llms-full.txt', () => {
  const d = dadosLlms({ ROVER_NETWORK_URL_BASE: 'https://exemplo.org' })
  it('um link e uma frase para cada idioma em que o skill existe, com endereço absoluto do ambiente', () => {
    for (const t of [gerarLlmsTxt(d), gerarLlmsFull(d)]) {
      expect(t).toContain('## Skill for agents')
      expect(t).toContain('- [Skill para agentes (Português)](https://exemplo.org/skill.md): Para um agente de IA ler:')
      expect(t).toContain('- [Skill for agents (English)](https://exemplo.org/skill.en.md): For an AI agent to read:')
      expect(t.match(/\/skill(\.en)?\.md\)/g)).toHaveLength(2)
    }
    expect(skillsDoSite('https://exemplo.org').map((s) => s.url)).toEqual(['https://exemplo.org/skill.md', 'https://exemplo.org/skill.en.md'])
  })
  it('sem skill nos dados, nenhuma seção vazia', () => {
    const sem = { ...d, skills: [] }
    expect(gerarLlmsTxt(sem)).not.toContain('Skill for agents')
    expect(gerarLlmsFull(sem)).not.toContain('Skill for agents')
  })
})

describe('página de desenvolvedores', () => {
  it('o português aponta para /skill.md; os outros onze idiomas, para o inglês', () => {
    expect(SKILL).toEqual({ pt: '/skill.md', en: '/skill.en.md' })
    for (const l of LOCALES) expect(caminhoDoSkill(l), l).toBe(l === 'pt' ? '/skill.md' : '/skill.en.md')
  })
  it('com o site aberto, o bloco tem título, texto e o link do idioma; fechado, o skill não aparece (seria link morto) e fica o link do código', () => {
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', 'sim')
    for (const l of LOCALES) {
      const html = renderToStaticMarkup(ExtraDesenvolvedores({ lang: l }))
      const t = instDict(l).paginas.desenvolvedores.skill
      expect(html, l).toContain(`href="${caminhoDoSkill(l)}"`)
      expect(html, l).toContain('type="text/markdown"')
      expect(html, l).toContain(`<h2 id="skill-para-agentes">${t.titulo}</h2>`)
      expect(html.toLowerCase(), l).toContain(`hreflang="${l === 'pt' ? 'pt' : 'en'}"`) // atributo HTML: maiúscula não importa
    }
    vi.stubEnv('ROVER_NETWORK_INDEXAVEL', '')
    const fechado = renderToStaticMarkup(ExtraDesenvolvedores({ lang: 'pt' }))
    expect(fechado).not.toContain('/skill.md')
    expect(fechado).toContain('href="https://github.com/Rovemark/folgali"')
    expect(fechado).toContain('Código aberto no GitHub')
  })
  it('o texto diz que o skill existe em português e em inglês', () => {
    expect(instDict('pt').paginas.desenvolvedores.skill.texto).toMatch(/Existe em português e em inglês\.$/)
    expect(instDict('en').paginas.desenvolvedores.skill.texto).toMatch(/It exists in Portuguese and in English\.$/)
  })
})
