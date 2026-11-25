import { describe, expect, it } from 'vitest'
import { detectarDadoPrivado, detectarProibido } from '@/lib/dominio/privacidade'

const codigos = (t: string) => detectarDadoPrivado(t).map((d) => d.codigo)

describe('detectarDadoPrivado', () => {
  it('texto comum não acende nada', () => {
    expect(codigos('Revisei 14 arquivos hoje e achei um TODO de 2019.')).toEqual([])
    expect(codigos('Cardápio da semana fechado: segunda sopa, terça massa.')).toEqual([])
  })
  it('e-mail', () => {
    expect(codigos('fale com maria.souza@exemplo.com hoje')).toEqual(['email'])
    expect(detectarDadoPrivado('maria@exemplo.com')[0].trecho).toBe('maria@exemplo.com')
  })
  it('número longo: telefone, CPF, cartão', () => {
    expect(codigos('liga em (11)91234-5678')).toEqual(['numero-longo'])
    expect(codigos('liga em 11 91234-5678')).toEqual(['numero-longo'])
    expect(codigos('cpf 123.456.789-09')).toEqual(['numero-longo'])
    expect(codigos('cartão 4111 1111 1111 1111')).toEqual(['numero-longo'])
  })
  it('número curto e anos passam', () => {
    expect(codigos('412 arquivos, 38 km, 6 mil páginas, em 2019')).toEqual([])
    expect(codigos('123456789')).toEqual([])
  })
  it('caminho de pasta de usuário', () => {
    expect(codigos('abri /Users/maria/Documentos')).toEqual(['caminho'])
    expect(codigos('em C:\\Users\\joao\\Desktop')).toEqual(['caminho'])
    expect(codigos('em /home/ana/projeto')).toEqual(['caminho'])
  })
  it('segredos conhecidos', () => {
    expect(codigos('chave sk-abcdefghijklmnopqrstuv')).toEqual(['segredo'])
    expect(codigos('AKIAABCDEFGHIJKLMNOP')).toEqual(['segredo'])
    expect(codigos('ghp_' + 'a'.repeat(36))).toEqual(['segredo'])
    expect(codigos('-----BEGIN PRIVATE KEY-----')).toEqual(['segredo'])
    expect(codigos('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc')).toEqual(['segredo'])
    expect(codigos('a'.repeat(40))).toEqual(['segredo'])
  })
  it('os ids da própria rede não são segredo', () => {
    expect(codigos('veja ob_' + 'A'.repeat(43))).toEqual([])
    expect(codigos('fale com rvr_' + 'A'.repeat(22))).toEqual([])
  })
  it('link com credencial na URL', () => {
    expect(codigos('abre https://exemplo.com/a?token=abc123')).toEqual(['link-com-chave'])
    expect(codigos('abre https://exemplo.com/a?pagina=2')).toEqual([])
  })
  it('encurta trecho grande para a tela', () => {
    const t = detectarDadoPrivado('sk-' + 'a'.repeat(60))[0].trecho
    expect(t.length).toBeLessThanOrEqual(28)
    expect(t.endsWith('...')).toBe(true)
  })
  it('reporta cada código uma vez', () => {
    expect(codigos('a@exemplo.com e b@exemplo.com')).toEqual(['email'])
  })
})

describe('detectarProibido', () => {
  it('html', () => {
    expect(detectarProibido('olha <b>isso</b>', 2)).toEqual(['html'])
    expect(detectarProibido('&#60;script', 2)).toEqual(['html'])
    expect(detectarProibido('a &amp; b', 2)).toEqual(['html'])
    expect(detectarProibido('2 < 3 e 5 > 4', 2)).toEqual([])
  })
  it('esquema perigoso', () => {
    expect(detectarProibido('javascript:alert(1)', 2)).toEqual(['esquema-perigoso'])
    expect(detectarProibido('VBScript :x', 2)).toEqual(['esquema-perigoso'])
  })
  it('links demais: passa com o máximo, recusa com um a mais', () => {
    expect(detectarProibido('https://a.com https://b.com', 2)).toEqual([])
    expect(detectarProibido('https://a.com https://b.com https://c.com', 2)).toEqual(['links-demais'])
    expect(detectarProibido('https://a.com', 0)).toEqual(['links-demais'])
  })
  it('texto limpo', () => {
    expect(detectarProibido('Nada de especial aqui.', 2)).toEqual([])
  })
})
