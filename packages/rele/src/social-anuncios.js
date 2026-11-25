// SPDX-License-Identifier: AGPL-3.0-or-later
// Anúncios do relé (0.3.2, proposta 0007): a comunidade oficial `anuncios`, somente leitura. Só o operador do relé publica, pela
// credencial de administração (rotas /v1/admin/anuncios, que respondem 404 sem ela). É VIRTUAL: não é uma linha de `comunidades`, então
// nenhum objeto assinado a alcança (o id `anuncios` nem passa pela validação de id de comunidade) e nenhum rover escreve nela.
import { randomBytes } from 'node:crypto'
import { ANUNCIOS, ErroDoProtocolo, PAGINA_PADRAO, validarTexto } from '../../protocolo/src/index.js'
import { Leitura } from './social-leitura.js'

export const ID_DE_ANUNCIO_RE = /^an_[A-Za-z0-9_-]{22}$/
const CAMPOS_DE_ANUNCIO = ['titulo', 'texto', 'fixado']

export class Anuncios extends Leitura {
  _cartaoDeAnuncio(l) {
    return { id: l.id, titulo: l.titulo, texto: l.texto, em: l.criado_em, fixado: l.fixado === 1 }
  }

  /** Os anúncios: os fixados primeiro, depois os mais novos. Público. O cursor é de deslocamento. */
  listarAnuncios({ antes = null, limite = PAGINA_PADRAO }) {
    this.rele._sincronizar()
    return this.listaPorDeslocamento('SELECT * FROM anuncios ORDER BY fixado DESC, seq DESC', {}, antes, limite, (l) => this._cartaoDeAnuncio(l))
  }

  anuncio(id) {
    this.rele._sincronizar()
    const l = typeof id === 'string' && ID_DE_ANUNCIO_RE.test(id) ? this.a.um('SELECT * FROM anuncios WHERE id = :id', { id }) : null
    if (!l) throw new ErroDoProtocolo('nao_encontrado')
    return this._cartaoDeAnuncio(l)
  }

  /** Só a rota de administração chama isto. O corpo é fechado: `titulo`, `texto` e, se quiser, `fixado`. */
  publicarAnuncio(corpo) {
    this.rele._sincronizar()
    if (corpo === null || typeof corpo !== 'object' || Array.isArray(corpo)) throw new ErroDoProtocolo('esquema', { campo: 'corpo', detalhe: 'Informe titulo, texto e, se quiser, fixado.' })
    for (const k of Object.keys(corpo)) {
      if (!CAMPOS_DE_ANUNCIO.includes(k)) throw new ErroDoProtocolo('esquema', { campo: k, detalhe: `Campo ${k}: não existe num anúncio.` })
    }
    const fixado = corpo.fixado ?? false
    if (typeof fixado !== 'boolean') throw new ErroDoProtocolo('esquema', { campo: 'fixado', detalhe: 'Campo fixado: verdadeiro ou falso.' })
    // Texto puro: sem HTML, NFC, sem invisível. O operador pode ter endereço de contato no texto (dado pessoal liberado) e até 3 links https.
    const problemaDoTitulo = validarTexto(corpo.titulo, { ...ANUNCIOS.titulo, multilinha: false, permitirDadoPessoal: true, v3: true })
    if (problemaDoTitulo) throw new ErroDoProtocolo('esquema', { campo: 'titulo', detalhe: `Campo titulo: ${problemaDoTitulo}.` })
    const problemaDoTexto = validarTexto(corpo.texto, { ...ANUNCIOS.texto, multilinha: true, urls: 3, permitirDadoPessoal: true, v3: true })
    if (problemaDoTexto) throw new ErroDoProtocolo('esquema', { campo: 'texto', detalhe: `Campo texto: ${problemaDoTexto}.` })
    if (fixado && this.contar('FROM anuncios WHERE fixado = 1', {}) >= ANUNCIOS.fixados) {
      throw new ErroDoProtocolo('limite_de_estrutura', { detalhe: `O limite é de ${ANUNCIOS.fixados} anúncios fixados.` })
    }
    const id = `an_${randomBytes(16).toString('base64url')}`
    this.a.executar('INSERT INTO anuncios (id, titulo, texto, criado_em, fixado) VALUES (:id, :titulo, :texto, :em, :fixado)', {
      id, titulo: corpo.titulo, texto: corpo.texto, em: this.agora(), fixado: fixado ? 1 : 0
    })
    return { id }
  }

  removerAnuncio(id) {
    this.rele._sincronizar()
    if (typeof id !== 'string' || !ID_DE_ANUNCIO_RE.test(id) || this.a.um('SELECT 1 AS n FROM anuncios WHERE id = :id', { id }) === null) {
      throw new ErroDoProtocolo('nao_encontrado')
    }
    this.a.executar('DELETE FROM anuncios WHERE id = :id', { id })
    return { removido: true }
  }

  /** Para o painel de início: quantos são novos depois de `desde` e qual é o último (só id e carimbo, nunca o texto). */
  resumoDeAnuncios(desde) {
    const ultimo = this.a.um('SELECT id, criado_em FROM anuncios ORDER BY seq DESC LIMIT 1', {})
    return { novos: this.contar('FROM anuncios WHERE criado_em > :desde', { desde }), ultimo: ultimo ? { id: ultimo.id, em: ultimo.criado_em } : null }
  }
}
