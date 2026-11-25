// Menções, tags, links e dado pessoal do 0.3 (docs/API-REDE-SOCIAL.md, seção 2).
import { describe, expect, it } from 'vitest'
import {
  ENCURTADORES, MAX_HASHTAGS, MAX_LINK, MAX_MENCOES, analisarLinks, contarMencoes, detectarPessoal03, dominioDoLink, extrairLinks, extrairMencoes, extrairTags, partir, problemaDoLink,
} from '@/lib/dominio/texto-social'

describe('menções @handle (2.1)', () => {
  it('uma menção é @ colado a 3 a 30 caracteres de a-z 0-9 . _', () => {
    expect(extrairMencoes('oi @pipa e @max.codigo_1')).toEqual(['pipa', 'max.codigo_1'])
    expect(extrairMencoes('@abc')).toEqual(['abc'])
    expect(extrairMencoes(`@${'a'.repeat(30)}`)).toEqual(['a'.repeat(30)])
    expect(extrairMencoes(`@${'a'.repeat(31)}`)).toEqual([])
  })
  it('menos de 3 caracteres, ou um @ sozinho, é texto comum', () => {
    expect(extrairMencoes('@ab e @ e @')).toEqual([])
    expect(contarMencoes('@ab @a')).toBe(0)
  })
  it('ponto e sublinhado no fim são pontuação: "oi @pipa." menciona pipa', () => {
    expect(extrairMencoes('oi @pipa.')).toEqual(['pipa'])
    expect(extrairMencoes('oi @pipa_ e @max..')).toEqual(['pipa', 'max'])
    expect(extrairMencoes('@ab._')).toEqual([])
  })
  it('não precedido de letra, dígito, ponto, sublinhado, @ ou barra', () => {
    expect(extrairMencoes('fulano@exemplo')).toEqual([])
    expect(extrairMencoes('a1@pipa')).toEqual([])
    expect(extrairMencoes('x.@pipa _@pipa @@pipa')).toEqual([])
    expect(extrairMencoes('rota/@pipa')).toEqual([])
    expect(extrairMencoes('(@pipa) "@max"')).toEqual(['pipa', 'max'])
    expect(extrairMencoes('oi\n@pipa')).toEqual(['pipa'])
  })
  it('o limite de 5 conta pessoas DISTINTAS, como o relé: citar a mesma 6 vezes é 1', () => {
    expect(MAX_MENCOES).toBe(5)
    expect(extrairMencoes('@pipa @pipa @pipa')).toEqual(['pipa'])
    expect(contarMencoes('@pipa @pipa @pipa')).toBe(1)
    expect(contarMencoes('@pipa @Pipa @PIPA')).toBe(1)
    expect(contarMencoes('@aaa @bbb @ccc @ddd @eee')).toBe(5)
    expect(contarMencoes('@aaa @bbb @ccc @ddd @eee @fff')).toBe(6)
  })
  it('o protocolo aceita maiúscula na menção e guarda em minúsculas (paridade)', () => {
    expect(extrairMencoes('oi @Pipa')).toEqual(['pipa'])
    expect(contarMencoes('@Aaa @Bbb @Ccc @Ddd @Eee @Fff')).toBe(6)
  })
})

describe('tags #tema (2.2)', () => {
  it('2 a 24 caracteres, começa por letra ou dígito, em minúsculas e sem repetir', () => {
    expect(extrairTags('#Rovers e #rovers #ab #a1-b2').tags).toEqual(['rovers', 'ab', 'a1-b2'])
    expect(extrairTags(`#${'a'.repeat(24)}`).tags).toEqual(['a'.repeat(24)])
  })
  it('um # seguido de 1 caractere é texto comum; hífen na frente não vale', () => {
    expect(extrairTags('#a #1 #').total).toBe(0)
    expect(extrairTags('#a #1 #').longa).toBe(false)
    expect(extrairTags('#-ab').tags).toEqual([])
  })
  it('sequência com mais de 24 caracteres é erro (não é ignorada)', () => {
    const r = extrairTags(`#${'a'.repeat(25)}`)
    expect(r.longa).toBe(true)
    expect(r.tags).toEqual([])
    expect(extrairTags(`#${'a'.repeat(24)}`).longa).toBe(false)
  })
  it('só uma corrida ASCII que COMEÇA por letra ou dígito, com mais de 24, é erro; as outras são ignoradas', () => {
    expect(extrairTags(`#-${'a'.repeat(24)}`).longa).toBe(false)
    expect(extrairTags(`#${'é'.repeat(30)}`).longa).toBe(false)
    expect(extrairTags(`#_${'a'.repeat(30)}`).longa).toBe(false)
    expect(extrairTags(`#a${'_'.repeat(30)}`).longa).toBe(false)
    expect(extrairTags(`#9${'b'.repeat(24)}`).longa).toBe(true)
    expect(extrairTags(`#${'a'.repeat(23)}`).longa).toBe(false)
  })
  it('não precedido de letra, dígito ou #', () => {
    expect(extrairTags('a#tag 1#tag ##tag').tags).toEqual([])
    expect(extrairTags('(#tag)').tags).toEqual(['tag'])
  })
  it('o teto de 5 conta tags DISTINTAS, como o relé', () => {
    expect(MAX_HASHTAGS).toBe(5)
    expect(extrairTags('#aa #aa #AA').total).toBe(1)
    expect(extrairTags('#aa #bb #cc #dd #ee #ff').total).toBe(6)
  })
  it('paridade com o protocolo: sublinhado e acento fazem a sequência inválida, não uma tag menor', () => {
    expect(extrairTags('#abc_def').tags).toEqual([])
    expect(extrairTags('#café').tags).toEqual([])
    expect(extrairTags('#ação').total).toBe(0)
  })
})

describe('links (2.3)', () => {
  const ok = (l: string) => expect(problemaDoLink(l)).toBeNull()
  it('https com domínio de verdade serve', () => {
    ok('https://exemplo.com')
    ok('https://www.exemplo.com.br/caminho?q=1#topo')
    ok('https://sub.dominio-legal.org/a/b')
  })
  it('só https: http, ftp e o resto são recusados', () => {
    for (const l of ['http://exemplo.com', 'ftp://exemplo.com', 'file:///etc/passwd', 'data://x', 'blob://x', 'javascript://x']) expect(problemaDoLink(l)).toBe('link-esquema')
    expect(problemaDoLink('HTTP://exemplo.com')).toBe('link-esquema')
  })
  it('no máximo 200 caracteres, contando pontos de código', () => {
    expect(MAX_LINK).toBe(200)
    const base = 'https://exemplo.com/'
    ok(base + 'a'.repeat(200 - base.length))
    expect(problemaDoLink(base + 'a'.repeat(201 - base.length))).toBe('link-longo')
  })
  it('sem IP, localhost, usuário e senha, porta, xn-- ou encurtador', () => {
    for (const l of ['https://127.0.0.1/a', 'https://10.0.0.1', 'https://[::1]/a', 'https://localhost/a', 'https://usuario:senha@exemplo.com', 'https://usuario@exemplo.com', 'https://exemplo.com:8443/a', 'https://xn--bcher-kva.example', 'https://sub.xn--bcher-kva.example', 'https://semponto']) {
      expect(problemaDoLink(l), l).toBe('link-host')
    }
    for (const e of ENCURTADORES) {
      expect(problemaDoLink(`https://${e}/abc`), e).toBe('link-host')
      expect(problemaDoLink(`https://www.${e}/abc`), `www.${e}`).toBe('link-host')
    }
    expect(ENCURTADORES).toHaveLength(11)
  })
  it('sem rastreador: utm_* e os parâmetros da lista, em qualquer caixa', () => {
    for (const p of ['utm_source=x', 'UTM_medium=x', 'fbclid=1', 'gclid=1', 'dclid=1', 'msclkid=1', 'mc_eid=1', 'mc_cid=1', 'igshid=1', 'yclid=1', '_hsenc=1', '_hsmi=1', 'ref_src=1', 's_cid=1', 'wickedid=1', 'vero_id=1', 'FBCLID=1']) {
      expect(problemaDoLink(`https://exemplo.com/a?ok=1&${p}`), p).toBe('link-rastreador')
    }
    ok('https://exemplo.com/a?utm=1&source=2&ref=3')
  })
  it('extrair links tira a pontuação do fim e acha qualquer esquema', () => {
    expect(extrairLinks('veja https://exemplo.com/a. e (https://b.org/x), ou ftp://c.net/y!')).toEqual(['https://exemplo.com/a', 'https://b.org/x', 'ftp://c.net/y'])
    expect(extrairLinks('sem link aqui')).toEqual([])
  })
  it('analisarLinks: conta, acha o problema, e `demais` quando passa do máximo do campo', () => {
    const t = 'https://a.com e https://b.com e https://c.com'
    expect(analisarLinks(t, 2)).toMatchObject({ total: 3, demais: true, achados: [] })
    expect(analisarLinks(t, 3)).toMatchObject({ total: 3, demais: false })
    expect(analisarLinks('https://a.com', 0)).toMatchObject({ total: 1, demais: true })
    expect(analisarLinks('nada', 0)).toEqual({ total: 0, achados: [], demais: false })
    expect(analisarLinks('http://a.com', 2).achados).toEqual([{ codigo: 'link-esquema', trecho: 'http://a.com' }])
  })
  it('esquemas sem barras que executam são recusados: javascript:, vbscript:, data: com MIME, file: e blob:', () => {
    for (const t of ['clique javascript:alert(1)', 'JavaScript :x', 'vbscript:x', 'data:text/html,abc', 'file:/etc/passwd', 'blob:https://a.com/x']) {
      expect(analisarLinks(t, 2).achados.some((a) => a.codigo === 'link-esquema'), t).toBe(true)
    }
  })
  it('"Data: hoje" e "arquivo: nome" são texto comum (paridade com o protocolo)', () => {
    for (const t of ['Data: hoje às 10h', 'data: 12/11', 'arquivo: relatório', 'file: pronto']) expect(analisarLinks(t, 2).achados, t).toEqual([])
  })
  it('o trecho de 40 caracteres cabe inteiro; o de 41 vira 37 mais reticências', () => {
    const l40 = `http://exemplo.com/${'a'.repeat(21)}`
    expect(l40).toHaveLength(40)
    expect(analisarLinks(l40, 2).achados[0].trecho).toBe(l40)
    expect(analisarLinks(`${l40}a`, 2).achados[0].trecho).toBe(`${l40.slice(0, 37)}...`)
  })
  it('o trecho do achado é encurtado para a tela', () => {
    const longo = `http://exemplo.com/${'a'.repeat(100)}`
    const t = analisarLinks(longo, 2).achados[0].trecho
    expect(t.length).toBe(40)
    expect(t.endsWith('...')).toBe(true)
  })
  it('link quebrado depois do https://', () => {
    expect(problemaDoLink('https://a%.com')).toBe('link-invalido')
    expect(problemaDoLink('https://[abc')).toBe('link-invalido')
  })
  it('só o esquema https exato vale: xhttps:// não é https://', () => {
    expect(problemaDoLink('xhttps://exemplo.com')).toBe('link-esquema')
    expect(problemaDoLink('ahttps://exemplo.com')).toBe('link-esquema')
    expect(extrairLinks('1https://exemplo.com')).toEqual(['https://exemplo.com'])
  })
  it('senha sem usuário também é recusada; .local, .internal e .localhost são rede local', () => {
    expect(problemaDoLink('https://:senha@exemplo.com')).toBe('link-host')
    for (const l of ['https://impressora.local', 'https://x.internal', 'https://a.localhost']) expect(problemaDoLink(l), l).toBe('link-host')
    ok('https://localhosted.com')
    ok('https://minhalocal.com')
  })
  it('o domínio por inteiro, só de https', () => {
    expect(dominioDoLink('https://www.exemplo.com.br/a?b=1')).toBe('www.exemplo.com.br')
    expect(dominioDoLink('http://exemplo.com')).toBeNull()
    expect(dominioDoLink('lixo')).toBeNull()
  })
  it('paridade com o protocolo: rótulo de domínio inválido, .local e .internal', () => {
    for (const l of ['https://a_b.com', 'https://-a.com', 'https://a-.com', 'https://impressora.local', 'https://x.internal', 'https://a.localhost']) expect(problemaDoLink(l), l).not.toBeNull()
  })
})

describe('dado pessoal do 0.3 (2.4)', () => {
  it('CEP: 12345-678', () => {
    expect(detectarPessoal03('moro no 12345-678')).toEqual([{ codigo: 'cep', trecho: '12345-678' }])
    expect(detectarPessoal03('12345-6789')).toEqual([])
    expect(detectarPessoal03('212345-678')).toEqual([])
    expect(detectarPessoal03('12345-67')).toEqual([])
  })
  it('CEP colado a hífen não conta (paridade com o protocolo)', () => {
    expect(detectarPessoal03('-12345-678')).toEqual([])
    expect(detectarPessoal03('12345-678-9')).toEqual([])
  })
  it('par de coordenadas: -23.5505, -46.6333', () => {
    expect(detectarPessoal03('estou em -23.5505, -46.6333 agora')).toEqual([{ codigo: 'coordenadas', trecho: '-23.5505, -46.6333' }])
    expect(detectarPessoal03('23.5505,46.6333')).toHaveLength(1)
    expect(detectarPessoal03('versão 1.2.3.4')).toEqual([])
    expect(detectarPessoal03('1234.5678, 12.3456')).toEqual([])
  })
  it('preços e números curtos com duas casas não são coordenada (paridade: exige 3 casas)', () => {
    expect(detectarPessoal03('custa 10.50, 20.25')).toEqual([])
    expect(detectarPessoal03('12.345, 67.890')).toHaveLength(1)
  })
  it('CEP e coordenadas juntos dão dois achados, nessa ordem', () => {
    expect(detectarPessoal03('12345-678 e 10.1234, 20.5678').map((a) => a.codigo)).toEqual(['cep', 'coordenadas'])
  })
})

describe('partir: desenhar sem HTML', () => {
  it('separa texto, menção, tag e link', () => {
    expect(partir('oi @pipa, veja #fio e https://exemplo.com/a.')).toEqual([
      { t: 'texto', v: 'oi ' }, { t: 'mencao', v: 'pipa' }, { t: 'texto', v: ', veja ' }, { t: 'tag', v: 'fio' },
      { t: 'texto', v: ' e ' }, { t: 'link', v: 'https://exemplo.com/a', dominio: 'exemplo.com', seguro: true }, { t: 'texto', v: '.' },
    ])
  })
  it('só marca como clicável (seguro) o link que passa em todas as regras', () => {
    const ruins = ['http://exemplo.com', 'https://127.0.0.1', 'https://exemplo.com/?utm_source=x', 'https://bit.ly/abc', 'https://u:p@exemplo.com', 'ftp://exemplo.com']
    for (const l of ruins) {
      const p = partir(l).find((x) => x.t === 'link')
      expect(p && p.t === 'link' && p.seguro, l).toBe(false)
    }
    const bom = partir('https://exemplo.com/a')[0]
    expect(bom).toMatchObject({ t: 'link', seguro: true })
  })
  it('menção e tag dentro de um link não viram menção nem tag', () => {
    const p = partir('https://exemplo.com/@pipa#fio')
    expect(p).toHaveLength(1)
    expect(p[0].t).toBe('link')
  })
  it('as partes remontam o texto original e nunca produzem marcação: o valor sai como veio', () => {
    const texto = 'a <b>negrito</b> @pipa #oi https://x.com/a?b=1 fim'
    const p = partir(texto)
    const prefixo = (x: (typeof p)[number]) => (x.t === 'mencao' ? '@' : x.t === 'tag' ? '#' : '')
    expect(p.map((x) => prefixo(x) + x.v).join('')).toBe(texto)
    for (const x of p) expect(Object.keys(x).every((k) => ['t', 'v', 'dominio', 'seguro'].includes(k))).toBe(true)
    expect(partir('')).toEqual([])
    expect(partir('só texto')).toEqual([{ t: 'texto', v: 'só texto' }])
  })
  it('menção e tag dentro de um link continuam parte do link, mesmo quando a regra deixaria casar', () => {
    for (const l of ['https://exemplo.com/#fio', 'https://exemplo.com/a?b=(@pipa)z', 'https://exemplo.com/?x=#fio']) {
      const p = partir(l)
      expect(p, l).toHaveLength(1)
      expect(p[0]).toMatchObject({ t: 'link', v: l })
    }
    expect(partir('veja https://exemplo.com/#fio e #fio')).toEqual([
      { t: 'texto', v: 'veja ' }, { t: 'link', v: 'https://exemplo.com/#fio', dominio: 'exemplo.com', seguro: true }, { t: 'texto', v: ' e ' }, { t: 'tag', v: 'fio' },
    ])
  })
  it('a menção sem o ponto ou o sublinhado do fim, e nos limites de 3 e 30 caracteres', () => {
    expect(partir('oi @pipa.')).toEqual([{ t: 'texto', v: 'oi ' }, { t: 'mencao', v: 'pipa' }, { t: 'texto', v: '.' }])
    expect(partir('@pipa..')).toEqual([{ t: 'mencao', v: 'pipa' }, { t: 'texto', v: '..' }])
    expect(partir('@pipa_')).toEqual([{ t: 'mencao', v: 'pipa' }, { t: 'texto', v: '_' }])
    expect(partir('@abc')).toEqual([{ t: 'mencao', v: 'abc' }])
    expect(partir(`@${'a'.repeat(30)}`)).toEqual([{ t: 'mencao', v: 'a'.repeat(30) }])
    expect(partir(`@${'a'.repeat(31)}`)).toEqual([{ t: 'texto', v: `@${'a'.repeat(31)}` }])
    expect(partir('@Pipa')).toEqual([{ t: 'mencao', v: 'pipa' }])
    expect(partir('@max.codigo_1')).toEqual([{ t: 'mencao', v: 'max.codigo_1' }])
  })
  it('limites: tag longa e menção curta continuam texto', () => {
    expect(partir(`#${'a'.repeat(25)}`)).toEqual([{ t: 'texto', v: `#${'a'.repeat(25)}` }])
    expect(partir('@ab')).toEqual([{ t: 'texto', v: '@ab' }])
  })
})
