// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.5.0 (proposta 0005): imagens no relé de referência. Só existe quando o operador liga (`RELE_MIDIA=sim`); desligado,
// o relé nem cria as tabelas, as rotas /v1/midia não existem e o tipo `imagem` é recusado como desconhecido.
//
// Regras desta camada:
//   - os BYTES ficam fora do SQLite, em <dir>/<2 hex>/<hash>, e o caminho é montado SÓ do hash conferido contra ^[0-9a-f]{64}$;
//   - o formato vem dos bytes e a limpeza é a de `limparImagem` (a mesma do cliente): o hash é o dos bytes limpos;
//   - envio não publicado não é servido a ninguém e some em 1 hora; arquivo que nenhum objeto retido cita some na hora;
//   - nada aqui busca URL.
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  ErroDoProtocolo, HASH_DE_MIDIA_RE, LIMITES_DE_MIDIA, MOTIVOS_DE_MODERACAO, TAXA_DE_ENVIO_DE_MIDIA, TIPO_MIME,
  credencialDeEnvioConfere, fatorDeIdade, lerCredencialDeEnvio, limparImagem, tetoComFator, validarTexto
} from '../../protocolo/src/index.js'
import { ROVER_VISIVEL } from './armazem.js'

const ESQUEMA_MIDIA = `
CREATE TABLE IF NOT EXISTS midia (
  hash TEXT PRIMARY KEY,
  formato TEXT NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  recebida_em INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS midia_envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,
  uid TEXT NOT NULL,
  em INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS midia_envios_uid ON midia_envios(uid, em);
CREATE INDEX IF NOT EXISTS midia_envios_hash ON midia_envios(hash, uid, em);
CREATE TABLE IF NOT EXISTS midia_recusadas (
  hash TEXT PRIMARY KEY,
  em INTEGER NOT NULL,
  motivo TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS imagens (
  id TEXT PRIMARY KEY,
  autor TEXT NOT NULL,
  hash TEXT NOT NULL,
  uso TEXT NOT NULL,
  alvo TEXT,
  ordem INTEGER,
  formato TEXT NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  alt TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS imagens_hash ON imagens(hash);
CREATE INDEX IF NOT EXISTS imagens_alvo ON imagens(alvo, ordem);
CREATE INDEX IF NOT EXISTS imagens_autor ON imagens(autor, uso);
`

// Um objeto `imagem` está no ar: tem envelope, não foi removido nem escondido, não está bloqueado, o autor é visível e, se for
// anexo, a postagem também está no ar. Usa os aliases `i` (imagens), `o` (objeto da imagem) e `r` (rover).
const IMAGEM_NO_AR = `
  o.envelope IS NOT NULL AND o.removido_em IS NULL AND o.oculto_em IS NULL
  AND o.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')
  AND ${ROVER_VISIVEL}
  AND (i.alvo IS NULL OR EXISTS (SELECT 1 FROM objetos p WHERE p.id = i.alvo AND p.envelope IS NOT NULL AND p.removido_em IS NULL
       AND p.oculto_em IS NULL AND p.id NOT IN (SELECT alvo FROM bloqueios WHERE tipo = 'objeto')))`

const resumo = (l) => ({ id: l.id, hash: l.hash, formato: l.formato, largura: l.largura, altura: l.altura, bytes: l.bytes, alt: l.alt, ordem: l.ordem })

/** O único lugar em que um caminho de disco nasce. Lança se o hash não for exatamente 64 hexadecimais minúsculos. */
export function caminhoDoHash(dir, hash) {
  if (typeof hash !== 'string' || !HASH_DE_MIDIA_RE.test(hash)) throw new Error('hash de mídia inválido')
  return join(dir, hash.slice(0, 2), hash)
}

export class Midia {
  /**
   * @param {import('./rele.js').Rele} rele
   * @param {{ dir: string, cotaBytes?: number }} o
   */
  constructor(rele, { dir, cotaBytes = LIMITES_DE_MIDIA.cotaPadraoBytes }) {
    if (typeof dir !== 'string' || !dir) throw new Error('a mídia precisa de uma pasta')
    if (!Number.isSafeInteger(cotaBytes) || cotaBytes < 1) throw new Error('a cota de mídia precisa ser um inteiro positivo de bytes')
    this.rele = rele
    this.a = rele.armazem
    this.dir = dir
    this.cotaBytes = cotaBytes
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    this.a.db.exec(ESQUEMA_MIDIA)
  }

  agora() { return this.rele.relogio() }

  info() {
    return {
      formatos: ['jpeg', 'png', 'webp'],
      bytesMax: LIMITES_DE_MIDIA.bytesMax,
      ladoMaxPx: LIMITES_DE_MIDIA.ladoMaxPx,
      anexosPorPostagem: LIMITES_DE_MIDIA.anexosPorPostagem,
      altCaracteres: LIMITES_DE_MIDIA.alt.max,
      pendenteS: LIMITES_DE_MIDIA.pendenteS
    }
  }

  // ====================================================================================================
  // ENVIO
  // ====================================================================================================

  /**
   * O que se confere ANTES de ler o corpo (barato, e quem paga é quem pede): credencial, rover, idade, taxa, recusado.
   * @param {string} hash
   * @param {{ cabecalho: string | undefined, metodo: string, alvo: string }} credencial
   * @returns {string} o uid de quem envia
   */
  prepararEnvio(hash, { cabecalho, metodo, alvo }) {
    this.rele._sincronizar()
    const agora = this.agora()
    const c = lerCredencialDeEnvio(cabecalho)
    const r = c ? this.a.rover(c.uid) : null
    if (!r || r.saiu || !credencialDeEnvioConfere(c, { metodo, alvo, chave: r.chave, agora })) throw new ErroDoProtocolo('envio_nao_autorizado')
    if (this.a.bloqueado('emissor', r.emissor) || this.a.bloqueado('rover', r.uid)) throw new ErroDoProtocolo('bloqueado')
    if (agora >= r.atestado_expira_em) throw new ErroDoProtocolo('atestado_vencido')
    if (!this.rele.provedor.emissoresConfiaveis().includes(r.emissor)) throw new ErroDoProtocolo('emissor_desconhecido')
    if (this.a.revogado(r.emissor, r.uid, r.atestado_emitido_em)) throw new ErroDoProtocolo('atestado_revogado')
    const idade = agora - r.criado_em
    if (idade < LIMITES_DE_MIDIA.idadeMinimaS) {
      const falta = LIMITES_DE_MIDIA.idadeMinimaS - idade
      throw new ErroDoProtocolo('conta_nova', { detalhe: `Faltam ${falta} segundos de idade da conta.`, retryAfterS: falta })
    }
    const fator = this.rele.semFatorDeIdade ? 1 : fatorDeIdade(idade)
    for (const [janelaS, maximo] of TAXA_DE_ENVIO_DE_MIDIA) {
      const max = tetoComFator(maximo, fator)
      const n = this.a.um('SELECT COUNT(*) AS n, MIN(em) AS velho FROM midia_envios WHERE uid = :uid AND em > :desde', { uid: r.uid, desde: agora - janelaS })
      if (n.n >= max) throw new ErroDoProtocolo('limite_de_taxa', { detalhe: `Limite de ${max} envios de imagem em ${janelaS} segundos.`, retryAfterS: n.velho + janelaS - agora })
    }
    if (this.a.um('SELECT 1 AS x FROM midia_recusadas WHERE hash = :hash', { hash })) throw new ErroDoProtocolo('midia_recusada')
    return r.uid
  }

  /**
   * Depois de ler o corpo (com teto): limpa, confere o hash, a cota e grava. Dois envios iguais viram um arquivo.
   * @returns {{ estado: 'recebida' | 'duplicada', hash: string, formato: string, largura: number, altura: number, bytes: number }}
   */
  concluirEnvio(hash, uid, bytes) {
    const agora = this.agora()
    const limpa = limparImagem(bytes)
    if (!limpa.ok) throw new ErroDoProtocolo(limpa.codigo, { detalhe: `Motivo: ${limpa.detalhe}.` })
    if (limpa.hash !== hash) throw new ErroDoProtocolo('hash_divergente', { campo: 'hash', detalhe: 'O SHA-256 dos bytes limpos não é o hash do endereço. Limpe com a mesma função do protocolo antes de enviar.' })
    const resposta = { hash, formato: limpa.formato, largura: limpa.largura, altura: limpa.altura, bytes: limpa.bytes.length }
    const existente = this.a.um('SELECT hash FROM midia WHERE hash = :hash', { hash })
    const caminho = caminhoDoHash(this.dir, hash)
    if (existente && existsSync(caminho)) {
      this.a.executar('INSERT INTO midia_envios (hash, uid, em) VALUES (:hash, :uid, :agora)', { hash, uid, agora })
      return { estado: 'duplicada', ...resposta }
    }
    const ocupado = this.a.um('SELECT COALESCE(SUM(bytes), 0) AS n FROM midia').n
    if (ocupado + limpa.bytes.length > this.cotaBytes) throw new ErroDoProtocolo('cota_de_midia')
    this._gravarArquivo(caminho, limpa.bytes)
    try {
      this.a.transacao(() => {
        this.a.executar(
          'INSERT OR REPLACE INTO midia (hash, formato, largura, altura, bytes, recebida_em) VALUES (:hash, :formato, :largura, :altura, :bytes, :agora)',
          { ...resposta, agora }
        )
        this.a.executar('INSERT INTO midia_envios (hash, uid, em) VALUES (:hash, :uid, :agora)', { hash, uid, agora })
      })
    } catch (e) {
      if (!existente) rmSync(caminho, { force: true })
      throw e
    }
    return { estado: 'recebida', ...resposta }
  }

  _gravarArquivo(caminho, bytes) {
    const pasta = join(caminho, '..')
    mkdirSync(pasta, { recursive: true, mode: 0o700 })
    const temporario = join(pasta, `.tmp-${randomBytes(8).toString('hex')}`)
    writeFileSync(temporario, bytes, { mode: 0o600, flag: 'wx' })
    renameSync(temporario, caminho)
  }

  // ====================================================================================================
  // O OBJETO `imagem`
  // ====================================================================================================

  conferirIdade(obj, guardado, agora) {
    if (obj.tipo !== 'imagem') return
    const idade = agora - guardado.criado_em
    if (idade < LIMITES_DE_MIDIA.idadeMinimaS) {
      const falta = LIMITES_DE_MIDIA.idadeMinimaS - idade
      throw new ErroDoProtocolo('conta_nova', { detalhe: `Faltam ${falta} segundos de idade da conta.`, retryAfterS: falta })
    }
  }

  /** Regras do tipo `imagem`. Devolve o efeito que rele.js grava (o envelope fica: imagem é conteúdo). */
  regras(obj, agora) {
    const c = obj.corpo
    if (this.a.um('SELECT 1 AS x FROM midia_recusadas WHERE hash = :hash', { hash: c.hash })) throw new ErroDoProtocolo('midia_recusada', { campo: 'objeto.corpo.hash' })
    const enviou = this.a.um('SELECT 1 AS x FROM midia_envios WHERE hash = :hash AND uid = :uid AND em > :desde', { hash: c.hash, uid: obj.autor, desde: agora - LIMITES_DE_MIDIA.pendenteS })
    const arquivo = this.a.um('SELECT * FROM midia WHERE hash = :hash', { hash: c.hash })
    if (!enviou || !arquivo) throw new ErroDoProtocolo('midia_ausente', { campo: 'objeto.corpo.hash' })
    for (const campo of ['formato', 'largura', 'altura', 'bytes']) {
      if (arquivo[campo] !== c[campo]) throw new ErroDoProtocolo('hash_divergente', { campo: `objeto.corpo.${campo}`, detalhe: `O campo ${campo} não descreve o arquivo enviado.` })
    }
    if (c.uso === 'anexo') {
      const p = this.a.objeto(c.alvo)
      if (!p || p.tipo !== 'postagem' || this.a.bloqueado('objeto', p.id)) throw new ErroDoProtocolo('alvo_desconhecido', { campo: 'objeto.corpo.alvo' })
      if (p.removido_em !== null || p.oculto_em !== null) throw new ErroDoProtocolo('alvo_removido', { campo: 'objeto.corpo.alvo' })
      if (p.autor !== obj.autor) throw new ErroDoProtocolo('sem_permissao', { campo: 'objeto.corpo.alvo', detalhe: 'Só o autor da postagem anexa imagens a ela.' })
      const ativos = this.a.todos(
        `SELECT i.ordem, i.hash FROM imagens i JOIN objetos o ON o.id = i.id WHERE i.alvo = :alvo AND o.envelope IS NOT NULL AND o.removido_em IS NULL`,
        { alvo: p.id }
      )
      if (ativos.length >= LIMITES_DE_MIDIA.anexosPorPostagem) throw new ErroDoProtocolo('limite_de_estrutura', { campo: 'objeto.corpo.alvo', detalhe: `Uma postagem tem no máximo ${LIMITES_DE_MIDIA.anexosPorPostagem} imagens.` })
      if (ativos.some((x) => x.ordem === c.ordem)) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.ordem' })
      if (ativos.some((x) => x.hash === c.hash)) throw new ErroDoProtocolo('ja_existe', { campo: 'objeto.corpo.hash' })
    }
    return {
      alvo: c.alvo,
      depois: ({ agora: t }) => {
        if (c.uso === 'retrato') this._retirar(this.a.todos("SELECT id FROM imagens WHERE autor = :autor AND uso = 'retrato'", { autor: obj.autor }).map((l) => l.id), t)
        this.a.executar(
          `INSERT INTO imagens (id, autor, hash, uso, alvo, ordem, formato, largura, altura, bytes, alt)
           VALUES (:id, :autor, :hash, :uso, :alvo, :ordem, :formato, :largura, :altura, :bytes, :alt)`,
          { id: obj.id, autor: obj.autor, hash: c.hash, uso: c.uso, alvo: c.alvo, ordem: c.ordem, formato: c.formato, largura: c.largura, altura: c.altura, bytes: c.bytes, alt: c.alt }
        )
      }
    }
  }

  /** Retira objetos `imagem` (como se o autor os removesse): o envelope sai, o rastro fica. */
  _retirar(ids, agora) {
    for (const id of ids) {
      this.a.executar('UPDATE objetos SET envelope = NULL, removido_em = COALESCE(removido_em, :agora) WHERE id = :id', { id, agora })
      this.a.executar('DELETE FROM imagens WHERE id = :id', { id })
      this.a.executar('DELETE FROM denuncias WHERE alvo = :id', { id })
    }
  }

  /** Efeito da remoção pelo autor sobre a mídia: a postagem removida leva os anexos junto. */
  aoRemover(linhaDoAlvo, agora) {
    if (linhaDoAlvo?.tipo === 'postagem') this._retirar(this.a.todos('SELECT id FROM imagens WHERE alvo = :id', { id: linhaDoAlvo.id }).map((l) => l.id), agora)
    if (linhaDoAlvo?.tipo === 'imagem') this.a.executar('DELETE FROM imagens WHERE id = :id', { id: linhaDoAlvo.id })
  }

  // ====================================================================================================
  // LIMPEZA
  // ====================================================================================================

  /**
   * Apaga o que ficou órfão: cópia de leitura de objeto sem envelope, arquivo que nenhum objeto retido cita e que ninguém enviou
   * na última hora, linha de arquivo que sumiu do disco, e o histórico de envios com mais de um dia. Devolve quantos arquivos apagou.
   */
  coletar(agora = this.agora()) {
    this.a.executar('DELETE FROM imagens WHERE NOT EXISTS (SELECT 1 FROM objetos o WHERE o.id = imagens.id AND o.envelope IS NOT NULL)')
    const orfaos = this.a.todos(
      `SELECT hash FROM midia m WHERE NOT EXISTS (SELECT 1 FROM imagens i WHERE i.hash = m.hash)
         AND NOT EXISTS (SELECT 1 FROM midia_envios e WHERE e.hash = m.hash AND e.em > :desde)`,
      { desde: agora - LIMITES_DE_MIDIA.pendenteS }
    )
    for (const { hash } of orfaos) this._apagarArquivo(hash)
    for (const { hash } of this.a.todos('SELECT hash FROM midia')) {
      if (!existsSync(caminhoDoHash(this.dir, hash))) this.a.executar('DELETE FROM midia WHERE hash = :hash', { hash })
    }
    this.a.executar('DELETE FROM midia_envios WHERE em <= :corte', { corte: agora - 86400 })
    return orfaos.length
  }

  _apagarArquivo(hash) {
    rmSync(caminhoDoHash(this.dir, hash), { force: true })
    this.a.executar('DELETE FROM midia WHERE hash = :hash', { hash })
  }

  // ====================================================================================================
  // LEITURA
  // ====================================================================================================

  /** Os bytes de um hash que algum objeto no ar cita. Qualquer outro caso é `nao_encontrado`, igual (a rota não vira sonda). */
  ler(hash) {
    this.rele._sincronizar()
    if (!HASH_DE_MIDIA_RE.test(hash)) throw new ErroDoProtocolo('nao_encontrado')
    const agora = this.agora()
    const visivel = this.a.um(
      `SELECT 1 AS x FROM imagens i JOIN objetos o ON o.id = i.id JOIN rovers r ON r.uid = o.autor WHERE i.hash = :hash AND ${IMAGEM_NO_AR} LIMIT 1`,
      { hash, ...this.rele._paramsDeVisibilidade(agora) }
    )
    if (!visivel) throw new ErroDoProtocolo('nao_encontrado')
    return this._arquivo(hash)
  }

  /** Para a administração: qualquer arquivo guardado, publicado ou não, bloqueado ou não. */
  lerComoOperador(hash) {
    if (!HASH_DE_MIDIA_RE.test(hash)) throw new ErroDoProtocolo('nao_encontrado')
    return this._arquivo(hash)
  }

  _arquivo(hash) {
    const linha = this.a.um('SELECT formato FROM midia WHERE hash = :hash', { hash })
    const caminho = caminhoDoHash(this.dir, hash)
    if (!linha || !existsSync(caminho)) throw new ErroDoProtocolo('nao_encontrado')
    return { bytes: readFileSync(caminho), tipo: TIPO_MIME[linha.formato] }
  }

  /** As imagens no ar de uma postagem, na ordem. */
  imagensDaPostagem(id, agora) {
    return this.a.todos(
      `SELECT i.* FROM imagens i JOIN objetos o ON o.id = i.id JOIN rovers r ON r.uid = o.autor WHERE i.alvo = :id AND ${IMAGEM_NO_AR} ORDER BY i.ordem`,
      { id, ...this.rele._paramsDeVisibilidade(agora) }
    ).map(resumo)
  }

  /** Campos a mais de um item de postagem: `imagens`, só quando há. */
  extraDoItem(linha, agora) {
    if (linha.tipo !== 'postagem') return {}
    const imagens = this.imagensDaPostagem(linha.id, agora)
    return imagens.length ? { imagens } : {}
  }

  /** Campos a mais do perfil: `retratoImagem`, só quando há. */
  extraDoPerfil(uid, agora) {
    const l = this.a.um(
      `SELECT i.* FROM imagens i JOIN objetos o ON o.id = i.id JOIN rovers r ON r.uid = o.autor
       WHERE i.autor = :uid AND i.uso = 'retrato' AND ${IMAGEM_NO_AR} ORDER BY o.seq DESC LIMIT 1`,
      { uid, ...this.rele._paramsDeVisibilidade(agora) }
    )
    return l ? { retratoImagem: resumo(l) } : {}
  }

  // ====================================================================================================
  // ADMINISTRAÇÃO
  // ====================================================================================================

  /** Expurgo: apaga o arquivo, retira os objetos que o citam e guarda o hash como recusado (o reenvio dá `midia_recusada`). */
  expurgar(hash, corpo) {
    if (!HASH_DE_MIDIA_RE.test(hash)) throw new ErroDoProtocolo('nao_encontrado')
    const { motivo, motivoPublico, ...resto } = corpo ?? {}
    const m = validarTexto(motivo, { min: 1, max: 200 })
    if (m || Object.keys(resto).length) throw new ErroDoProtocolo('esquema', { campo: 'motivo', detalhe: m ? `Campo motivo: ${m}.` : 'Informe só motivo e, se quiser, motivoPublico.' })
    if (motivoPublico !== undefined && !MOTIVOS_DE_MODERACAO.includes(motivoPublico)) {
      throw new ErroDoProtocolo('esquema', { campo: 'motivoPublico', detalhe: `Campo motivoPublico: um destes: ${MOTIVOS_DE_MODERACAO.join(', ')}.` })
    }
    const agora = this.agora()
    let n = 0
    this.a.transacao(() => {
      const objetos = this.a.todos('SELECT i.id, o.autor FROM imagens i JOIN objetos o ON o.id = i.id WHERE i.hash = :hash', { hash })
      n = objetos.length
      for (const o of objetos) {
        if (motivoPublico !== undefined) {
          this.rele.social.registrarModeracao({ em: agora, escopo: 'rele', contexto: null, acao: 'remocao', alvoTipo: 'imagem', alvo: o.id, autorDoAlvo: o.autor, motivo: motivoPublico, papel: 'rele', por: null })
        }
      }
      this._retirar(objetos.map((o) => o.id), agora)
      this.a.executar('INSERT OR REPLACE INTO midia_recusadas (hash, em, motivo) VALUES (:hash, :agora, :motivo)', { hash, agora, motivo })
      this.a.executar('DELETE FROM midia_envios WHERE hash = :hash', { hash })
      this.a.executar('DELETE FROM midia WHERE hash = :hash', { hash })
    })
    rmSync(caminhoDoHash(this.dir, hash), { force: true })
    return { expurgado: true, objetos: n }
  }
}
