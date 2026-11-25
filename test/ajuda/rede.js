// SPDX-License-Identifier: AGPL-3.0-or-later
// Ajudantes dos testes da rede social (0.3): um mundo com atalhos para cada gesto, para o teste dizer só o que importa.
import { ID_RE } from '../../packages/protocolo/src/index.js'
import { credencialDe, codigoDe, DIA, erroDe, novoMundo, publicar, roverRegistrado } from './rele-de-teste.js'

export { DIA, codigoDe, erroDe }

/** Credencial no formato que as rotas de leitura do relé recebem (sem HTTP): `{ cabecalho, metodo, alvo }`. */
export const como = (m, rover, alvo = '/v1/x') => ({ cabecalho: credencialDe(m, rover, alvo), metodo: 'GET', alvo })

export function nova(opcoes = {}) {
  const m = novoMundo(opcoes)
  const rele = m.rele
  const s = rele.social
  const rover = (o = {}) => roverRegistrado(m, o)
  /** Faz o rover publicar um objeto. Aprovação humana vem sozinha para os tipos que a exigem. */
  const faz = (r, tipo, corpo, o) => publicar(m, r, tipo, corpo, o)
  const ok = (r, tipo, corpo, o) => {
    const x = faz(r, tipo, corpo, o)
    if (x.estado !== 'aceito') throw new Error(`esperava aceito, veio ${x.estado}`)
    return x
  }
  const cod = (r, tipo, corpo, o) => codigoDe(() => faz(r, tipo, corpo, o))

  /** Dois rovers que são amigos há `dias` dias. */
  const amigos = (a, b, dias = 8) => {
    ok(a, 'amizade', { alvo: b.uid, acao: 'pedir' })
    ok(b, 'amizade', { alvo: a.uid, acao: 'aceitar' })
    if (dias) m.avancar(dias * DIA)
  }

  /** Cria uma comunidade e devolve o id (que é o id do objeto de criação). */
  const comunidade = (dono, { nome = `Comunidade ${Math.random().toString(36).slice(2, 8)}`, acesso = 'aberta', categorias = [], tema = 'rovers', descricao = 'Um lugar', regras = 'Seja gentil.' } = {}) =>
    ok(dono, 'comunidade-criar', { nome, descricao, regras, tema, acesso, categorias }).id

  /** Entra numa comunidade aberta e espera a carência de tópico (1 hora). */
  const entra = (r, com, { esperar = true } = {}) => {
    ok(r, 'comunidade-adesao', { comunidade: com, acao: 'entrar' })
    if (esperar) m.avancar(3601)
  }

  const topico = (autor, com, { titulo = 'Como vocês fazem isso?', texto = 'Queria ouvir a experiência de vocês.', tags = [], categoria = null, enquete = null } = {}) =>
    ok(autor, 'topico', { comunidade: com, categoria, titulo, texto, tags, enquete }).id

  const responde = (autor, t, texto = 'Eu faço assim.', { em = null, cita = null } = {}) =>
    ok(autor, 'resposta-forum', { topico: t, em, cita, texto }).id

  const gestao = (mod, com, alvo, acao, motivo = null) => ok(mod, 'comunidade-gestao', { comunidade: com, alvo: alvo.uid, acao, motivo })

  return { m, rele, s, rover, faz, ok, cod, amigos, comunidade, entra, topico, responde, gestao, avancar: m.avancar, como: (r, alvo) => como(m, r, alvo) }
}

export const ehId = (x) => ID_RE.test(x)
