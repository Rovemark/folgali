import { describe, expect, it } from 'vitest'
import { detectPrivateData, detectForbidden } from '@/lib/domain/privacy'

const codes = (t: string) => detectPrivateData(t).map((d) => d.codigo)

describe('detectarDadoPrivado', () => {
  it('ordinary text lights nothing', () => {
    expect(codes('Revisei 14 arquivos hoje e achei um TODO de 2019.')).toEqual([])
    expect(codes('Cardápio da semana fechado: segunda sopa, terça massa.')).toEqual([])
  })
  it('e-mail', () => {
    expect(codes('fale com maria.souza@exemplo.com hoje')).toEqual(['email'])
    expect(detectPrivateData('maria@exemplo.com')[0].trecho).toBe('maria@exemplo.com')
  })
  it('long number: phone, CPF, card', () => {
    expect(codes('liga em (11)91234-5678')).toEqual(['numero-longo'])
    expect(codes('liga em 11 91234-5678')).toEqual(['numero-longo'])
    expect(codes('cpf 123.456.789-09')).toEqual(['numero-longo'])
    expect(codes('cartão 4111 1111 1111 1111')).toEqual(['numero-longo'])
  })
  it('short numbers and years pass', () => {
    expect(codes('412 arquivos, 38 km, 6 mil páginas, em 2019')).toEqual([])
    expect(codes('123456789')).toEqual([])
  })
  it('user folder path', () => {
    expect(codes('abri /Users/maria/Documentos')).toEqual(['caminho'])
    expect(codes('em C:\\Users\\joao\\Desktop')).toEqual(['caminho'])
    expect(codes('em /home/ana/projeto')).toEqual(['caminho'])
  })
  it('segredos conhecidos', () => {
    expect(codes('chave sk-abcdefghijklmnopqrstuv')).toEqual(['segredo'])
    expect(codes('AKIAABCDEFGHIJKLMNOP')).toEqual(['segredo'])
    expect(codes('ghp_' + 'a'.repeat(36))).toEqual(['segredo'])
    expect(codes('-----BEGIN PRIVATE KEY-----')).toEqual(['segredo'])
    expect(codes('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc')).toEqual(['segredo'])
    expect(codes('a'.repeat(40))).toEqual(['segredo'])
  })
  it('the network\'s own ids are not secret', () => {
    expect(codes('veja ob_' + 'A'.repeat(43))).toEqual([])
    expect(codes('fale com rvr_' + 'A'.repeat(22))).toEqual([])
  })
  it('link with a credential in the URL', () => {
    expect(codes('abre https://exemplo.com/a?token=abc123')).toEqual(['link-com-chave'])
    expect(codes('abre https://exemplo.com/a?pagina=2')).toEqual([])
  })
  it('shortens a large excerpt for the screen', () => {
    const t = detectPrivateData('sk-' + 'a'.repeat(60))[0].trecho
    expect(t.length).toBeLessThanOrEqual(28)
    expect(t.endsWith('...')).toBe(true)
  })
  it('reports each code once', () => {
    expect(codes('a@exemplo.com e b@exemplo.com')).toEqual(['email'])
  })
})

describe('detectarProibido', () => {
  it('html', () => {
    expect(detectForbidden('olha <b>isso</b>', 2)).toEqual(['html'])
    expect(detectForbidden('&#60;script', 2)).toEqual(['html'])
    expect(detectForbidden('a &amp; b', 2)).toEqual(['html'])
    expect(detectForbidden('2 < 3 e 5 > 4', 2)).toEqual([])
  })
  it('esquema perigoso', () => {
    expect(detectForbidden('javascript:alert(1)', 2)).toEqual(['esquema-perigoso'])
    expect(detectForbidden('VBScript :x', 2)).toEqual(['esquema-perigoso'])
  })
  it('too many links: passes with the maximum, refuses with one more', () => {
    expect(detectForbidden('https://a.com https://b.com', 2)).toEqual([])
    expect(detectForbidden('https://a.com https://b.com https://c.com', 2)).toEqual(['links-demais'])
    expect(detectForbidden('https://a.com', 0)).toEqual(['links-demais'])
  })
  it('clean text', () => {
    expect(detectForbidden('Nada de especial aqui.', 2)).toEqual([])
  })
})
