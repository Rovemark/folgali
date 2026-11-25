// Tudo o que chega do relé vem de estranhos. Antes de virar tela, passa por aqui: a forma é conferida,
// o texto perde o que é invisível, os tamanhos são cortados e a ficha do rover só aceita corpo,
// cor e acessórios conhecidos (o nome do corpo vira parte de um endereço de imagem).

import { filtrarInvisiveis } from './dominio/invisivel'
import { LIMITES, cortar, normalizar } from './dominio/limites'
import { ehIdObjeto, ehUid, TOPICO_RE } from './dominio/ids'
import { rostoPorUid } from './dominio/expressao'
import { ACESSORIOS, BOCAS, CORPOS, OLHOS } from './rover/motor'
import { sanearImagem, sanearImagens } from './imagens'
import { ErroRede, HUMORES, REACOES, type Ficha, type Humor, type Pagina, type PerfilRover, type Postagem, type ResumoRover } from './tipos'

const ESTRANHO = () => new ErroRede('indisponivel', 'resposta do relé fora do contrato')

type Obj = Record<string, unknown>
const obj = (x: unknown): Obj => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw ESTRANHO()
  return x as Obj
}
const texto = (x: unknown, limite: number): string => {
  if (typeof x !== 'string') throw ESTRANHO()
  return cortar(normalizar(filtrarInvisiveis(x).texto), limite)
}
const inteiro = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0)
const data = (x: unknown): string => {
  if (typeof x !== 'string' || Number.isNaN(Date.parse(x))) throw ESTRANHO()
  return new Date(x).toISOString()
}

export function sanearFicha(x: unknown, uid: string): Ficha {
  // O protocolo 0.1 não tem ficha: sem ela, o mesmo uid sempre vira o mesmo rover de pelúcia.
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return rostoPorUid(uid)
  const o = x as Obj
  const corpo = typeof o.corpo === 'string' && (CORPOS as readonly string[]).includes(o.corpo) ? o.corpo : 'seixo'
  const cor = typeof o.cor === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.cor) ? o.cor.toLowerCase() : '#f2e8d6'
  const acessorios = Array.isArray(o.acessorios) ? o.acessorios.filter((a): a is string => typeof a === 'string' && a in ACESSORIOS).slice(0, 3) : []
  const f: Ficha = { corpo, cor, acessorios }
  if (typeof o.olhos === 'string' && (OLHOS as readonly string[]).includes(o.olhos)) f.olhos = o.olhos
  if (typeof o.boca === 'string' && (BOCAS as readonly string[]).includes(o.boca)) f.boca = o.boca
  return f
}

export function sanearResumo(x: unknown): ResumoRover {
  const o = obj(x)
  if (typeof o.uid !== 'string' || !ehUid(o.uid)) throw ESTRANHO()
  const handle = typeof o.handle === 'string' ? o.handle.toLowerCase() : ''
  if (!/^[a-z0-9._]{3,30}$/.test(handle)) throw ESTRANHO()
  return { uid: o.uid, handle, nome: texto(o.nome, LIMITES.nome), rosto: sanearFicha(o.rosto, o.uid) }
}

export function sanearPerfil(x: unknown): PerfilRover {
  const o = obj(x)
  const p: PerfilRover = {
    ...sanearResumo(o),
    // `descricao` é o nome do campo no objeto `perfil` do protocolo; `apresentacao` é o do relé.
    apresentacao: texto(o.apresentacao ?? o.descricao ?? '', LIMITES.apresentacao),
    sabeFazer: Array.isArray(o.sabeFazer) ? o.sabeFazer.filter((s): s is string => typeof s === 'string').slice(0, 6).map((s) => cortar(normalizar(filtrarInvisiveis(s).texto), 40)).filter(Boolean) : [],
    seguindo: inteiro(o.seguindo),
    seguidores: inteiro(o.seguidores),
  }
  if (o.desde !== undefined) p.desde = data(o.desde)
  if (o.idioma === 'pt' || o.idioma === 'en') p.idioma = o.idioma
  if (typeof o.euSigo === 'boolean') p.euSigo = o.euSigo
  if (o.sintetico === true) p.sintetico = true
  // 0.5.0: o retrato em imagem só entra se confere com o protocolo (hash, formato, dimensões, texto alternativo)
  const retratoImagem = sanearImagem(o.retratoImagem)
  if (retratoImagem) p.retratoImagem = retratoImagem
  return p
}

export function sanearPostagem(x: unknown): Postagem {
  const o = obj(x)
  if (typeof o.id !== 'string' || !ehIdObjeto(o.id)) throw ESTRANHO()
  const tipo = o.tipo === 'resposta' ? 'resposta' : 'postagem'
  const r = obj(o.reacoes ?? {})
  const removida = o.removida === true
  const p: Postagem = {
    id: o.id,
    tipo,
    autor: sanearResumo(o.autor),
    texto: removida ? '' : texto(o.texto ?? '', tipo === 'resposta' ? LIMITES.resposta : LIMITES.postagem),
    topicos: Array.isArray(o.topicos) ? o.topicos.filter((t): t is string => typeof t === 'string' && TOPICO_RE.test(t)).slice(0, LIMITES.topicos) : [],
    criadaEm: data(o.criadaEm),
    respostas: inteiro(o.respostas),
    reacoes: { curtir: inteiro(r.curtir), util: inteiro(r.util) },
  }
  if (o.idioma === 'pt' || o.idioma === 'en') p.idioma = o.idioma
  if ((HUMORES as readonly string[]).includes(o.humor as string)) p.humor = o.humor as Humor
  if (typeof o.respondeA === 'string' && ehIdObjeto(o.respondeA)) p.respondeA = o.respondeA
  if (typeof o.minhaReacao === 'string' && (REACOES as readonly string[]).includes(o.minhaReacao)) p.minhaReacao = o.minhaReacao as Postagem['minhaReacao']
  if (removida) p.removida = true
  // 0.5.0: anexos, só os que conferem com o protocolo; postagem apagada não mostra imagem
  const imagens = removida ? [] : sanearImagens(o.imagens)
  if (imagens.length) p.imagens = imagens
  return p
}

export function sanearPagina<T>(x: unknown, item: (v: unknown) => T): Pagina<T> {
  const o = obj(x)
  if (!Array.isArray(o.itens)) throw ESTRANHO()
  const pagina: Pagina<T> = { itens: o.itens.slice(0, 100).map(item) }
  if (typeof o.proximo === 'string' && o.proximo.length > 0 && o.proximo.length <= 200) pagina.proximo = o.proximo
  return pagina
}
