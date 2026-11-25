// SPDX-License-Identifier: AGPL-3.0-or-later
// Revisão 0.5.0 (proposta 0005) no relé, sem HTTP: envio, objeto `imagem`, leitura, remoção, órfão, expurgo, cota, taxa,
// idade da conta e o recurso DESLIGADO (o padrão), que responde como se a imagem não existisse.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { corpoDeImagem, criarCredencialDeEnvio, hashDeMidia, limparImagem } from '../../packages/protocolo/src/index.js'
import { caminhoDoHash } from '../../packages/rele/src/midia.js'
import * as A from '../ajuda/amostras-de-imagem.js'
import { enviar, mundoComMidia, pngSintetico, publicarImagem } from '../ajuda/midia.js'
import { DIA, codigoDe, erroDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const comMundo = (fn, opcoes) => () => {
  const m = mundoComMidia(opcoes)
  try { return fn(m) } finally { m.apagar() }
}
const postar = (m, r, texto = 'Olha isso.') => publicar(m, r, 'postagem', { texto, topicos: [] }).id

// ---------- desligado ----------

test('desligado (o padrão): info não anuncia, o tipo imagem é recusado como desconhecido e as leituras não mudam', () => {
  const m = novoMundo()
  assert.equal(m.rele.midia, null)
  const info = m.rele.info()
  assert.equal(info.recursos.includes('midia'), false)
  assert.equal('midia' in info, false)
  assert.equal(info.versaoDoRascunho, '0.6.0')
  const r = roverRegistrado(m)
  const limpa = limparImagem(A.gps_png)
  const e = erroDe(() => publicar(m, r, 'imagem', corpoDeImagem(limpa, { uso: 'retrato', alt: 'Verde.' })))
  assert.equal(e.codigo, 'esquema')
  assert.equal(e.campo, 'objeto.tipo')
  // a mesma recusa de um tipo que não existe (a lista citada nem menciona imagem)
  assert.equal(e.message.includes('imagem'), false)
  assert.equal('retratoImagem' in m.rele.perfil(r.uid), false)
  // nenhuma tabela de mídia nasce
  assert.equal(m.armazem.um("SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('midia', 'midia_envios', 'midia_recusadas', 'imagens')").n, 0)
})

// ---------- envio ----------

test('envio: dois uploads iguais viram um arquivo; o segundo é duplicada e vale para quem enviou', comMundo((m) => {
  const a = m.rover()
  const b = m.rover()
  const r1 = enviar(m, a, A.gps_jpg).resposta
  assert.equal(r1.estado, 'recebida')
  assert.equal(r1.formato, 'jpeg')
  const r2 = enviar(m, b, A.gps_jpg).resposta
  assert.equal(r2.estado, 'duplicada')
  assert.equal(r2.hash, r1.hash)
  assert.deepEqual(m.arquivos().length, 1)
  assert.equal(m.armazem.um('SELECT COUNT(*) AS n FROM midia').n, 1)
  // o arquivo guardado é o LIMPO: sem GPS, idêntico ao que o cliente calculou
  const guardado = readFileSync(caminhoDoHash(m.dir, r1.hash))
  assert.equal(hashDeMidia(guardado), r1.hash)
  assert.ok(guardado.equals(limparImagem(A.gps_jpg).bytes))
  // o mesmo arquivo serve aos dois para publicar
  assert.equal(publicarImagem(m, a, A.gps_jpg, { alvo: postar(m, a) }).estado, 'aceito')
  assert.equal(publicarImagem(m, b, A.gps_jpg, { alvo: postar(m, b) }).estado, 'aceito')
  assert.equal(m.arquivos().length, 1)
}))

test('envio: o hash é o dos bytes LIMPOS; o hash do original (com metadado) é hash_divergente', comMundo((m) => {
  const a = m.rover()
  assert.equal(codigoDe(() => enviar(m, a, A.gps_jpg, { hash: hashDeMidia(A.gps_jpg) })), 'hash_divergente')
  assert.equal(codigoDe(() => enviar(m, a, A.gps_jpg, { hash: hashDeMidia(Buffer.from('outra coisa')) })), 'hash_divergente')
  assert.equal(m.arquivos().length, 0, 'nada foi gravado')
}))

test('envio: formato pelos bytes; SVG, GIF e APNG recusados; truncado e gigante em pixels também, sem gravar nada', comMundo((m) => {
  const a = m.rover()
  const h = '1'.repeat(64)
  assert.equal(codigoDe(() => enviar(m, a, Buffer.from('<svg/>'), { hash: h })), 'formato_nao_aceito')
  assert.equal(codigoDe(() => enviar(m, a, A.anim_gif, { hash: h })), 'formato_nao_aceito')
  assert.equal(codigoDe(() => enviar(m, a, A.anim_png, { hash: h })), 'formato_nao_aceito')
  assert.equal(codigoDe(() => enviar(m, a, A.gps_png.subarray(0, 60), { hash: h })), 'imagem_invalida')
  assert.equal(codigoDe(() => enviar(m, a, pngSintetico({ largura: 5000, altura: 2 }), { hash: h })), 'dimensoes_grandes')
  assert.equal(m.arquivos().length, 0)
}))

test('envio: credencial de outro rover, vencida, de outro hash ou de leitura é envio_nao_autorizado', comMundo((m) => {
  const a = m.rover()
  const b = m.rover()
  const limpa = limparImagem(A.gps_png)
  const alvo = `/v1/midia/${limpa.hash}`
  const tenta = (cabecalho, caminho = alvo) => codigoDe(() => m.rele.midia.prepararEnvio(limpa.hash, { cabecalho, metodo: 'PUT', alvo: caminho }))
  const cred = (rover, o = {}) => criarCredencialDeEnvio({ chavePrivada: rover.rede.chavePrivada, uid: a.uid, alvo, t: m.relogio.agora, ...o })
  assert.equal(tenta(cred(a)), 'ok')
  assert.equal(tenta(cred(b)), 'envio_nao_autorizado', 'assinada por outra chave')
  assert.equal(tenta(cred(a, { t: m.relogio.agora - 121 })), 'envio_nao_autorizado')
  assert.equal(tenta(cred(a, { alvo: `/v1/midia/${'2'.repeat(64)}` })), 'envio_nao_autorizado')
  assert.equal(tenta(undefined), 'envio_nao_autorizado')
  assert.equal(tenta(cred(a), `${alvo}?x=1`), 'envio_nao_autorizado')
}))

test('envio: rover bloqueado é bloqueado; conta com menos de 1 dia é conta_nova; hash expurgado é midia_recusada', comMundo((m) => {
  const a = m.rover()
  m.rele.bloquear({ tipo: 'rover', alvo: a.uid, motivo: 'teste' })
  assert.equal(codigoDe(() => enviar(m, a, A.gps_png)), 'bloqueado')
  const novato = m.rover({ novato: true })
  assert.equal(codigoDe(() => enviar(m, novato, A.gps_png)), 'conta_nova')
  m.avancar(DIA)
  assert.equal(codigoDe(() => enviar(m, novato, A.gps_png)), 'ok')
}))

test('envio: taxa de 20 por hora por rover, contada só sobre envios aceitos', comMundo((m) => {
  const a = m.rover()
  for (let i = 0; i < 20; i++) enviar(m, a, pngSintetico({ semente: i }))
  assert.equal(codigoDe(() => enviar(m, a, pngSintetico({ semente: 99 }))), 'limite_de_taxa')
  // recusa não gasta a cota de outro rover
  const b = m.rover()
  assert.equal(codigoDe(() => enviar(m, b, pngSintetico({ semente: 100 }))), 'ok')
  m.avancar(3601)
  assert.equal(codigoDe(() => enviar(m, a, pngSintetico({ semente: 99 }))), 'ok')
}))

test('cota total em disco: passou, cota_de_midia, e nada é gravado', comMundo((m) => {
  const a = m.rover()
  const um = enviar(m, a, A.gps_jpg).resposta
  assert.equal(um.estado, 'recebida')
  assert.equal(codigoDe(() => enviar(m, a, A.prog_jpg)), 'cota_de_midia')
  assert.equal(m.arquivos().length, 1)
}, { cotaBytes: 400 }))

test('caminho em disco só nasce de hash hexadecimal validado', () => {
  for (const ruim of ['../../etc/passwd', 'A'.repeat(64), `${'a'.repeat(63)}/`, '', `${'a'.repeat(64)}\0`, 'a'.repeat(65)]) {
    assert.throws(() => caminhoDoHash('/tmp/x', ruim), /hash de mídia inválido/)
  }
  assert.equal(caminhoDoHash('/tmp/x', 'ab'.repeat(32)), join('/tmp/x', 'ab', 'ab'.repeat(32)))
})

// ---------- objeto imagem ----------

test('objeto imagem: exige aprovação humana, aceita o anexo do próprio autor e recusa o resto', comMundo((m) => {
  const a = m.rover()
  const b = m.rover()
  const post = postar(m, a)
  const { limpa } = enviar(m, a, A.gps_png)
  const corpo = (o = {}) => ({ ...corpoDeImagem(limpa, { uso: 'anexo', alvo: post, ordem: 0, alt: 'Verde.' }), ...o })
  assert.equal(codigoDe(() => publicar(m, a, 'imagem', corpo(), { aprovada: false })), 'sem_aprovacao')
  assert.equal(codigoDe(() => publicar(m, a, 'imagem', corpo({ largura: 9 }))), 'hash_divergente')
  assert.equal(codigoDe(() => publicar(m, a, 'imagem', corpo({ formato: 'jpeg' }))), 'hash_divergente')
  // b não enviou esse arquivo: não pode citá-lo (nem para anexar à própria postagem)
  assert.equal(codigoDe(() => publicar(m, b, 'imagem', corpo({ alvo: postar(m, b) }))), 'midia_ausente')
  // b enviou, mas a postagem é de a
  enviar(m, b, A.gps_png)
  assert.equal(codigoDe(() => publicar(m, b, 'imagem', corpo())), 'sem_permissao')
  assert.equal(codigoDe(() => publicar(m, a, 'imagem', corpo({ alvo: `ob_${'Z'.repeat(43)}` }))), 'alvo_desconhecido')
  assert.equal(publicar(m, a, 'imagem', corpo()).estado, 'aceito')
  assert.equal(codigoDe(() => publicar(m, a, 'imagem', corpo({ ordem: 1 }))), 'ja_existe', 'o mesmo arquivo duas vezes na mesma postagem')
  assert.equal(codigoDe(() => publicar(m, a, 'imagem', corpo({ alt: 'Outro.' }))), 'ja_existe', 'a mesma ordem')
}))

test('objeto imagem: no máximo 4 anexos por postagem', comMundo((m) => {
  const a = m.rover()
  const post = postar(m, a)
  for (let i = 0; i < 4; i++) assert.equal(publicarImagem(m, a, pngSintetico({ semente: i }), { alvo: post, ordem: i }).estado, 'aceito')
  const { limpa } = enviar(m, a, pngSintetico({ semente: 9 }))
  assert.equal(codigoDe(() => publicar(m, a, 'imagem', corpoDeImagem(limpa, { uso: 'anexo', alvo: post, ordem: 3, alt: 'Quinta.' }))), 'limite_de_estrutura')
}))

test('objeto imagem: o envio vale por 1 hora; depois disso, midia_ausente', comMundo((m) => {
  const a = m.rover()
  const { limpa } = enviar(m, a, A.gps_png)
  m.avancar(3601)
  assert.equal(codigoDe(() => publicar(m, a, 'imagem', corpoDeImagem(limpa, { uso: 'retrato', alt: 'Verde.' }))), 'midia_ausente')
}))

test('objeto imagem: conta com menos de 1 dia não publica imagem (conta_nova)', comMundo((m) => {
  const a = m.rover()
  const { limpa } = enviar(m, a, A.gps_png)
  m.armazem.executar('UPDATE rovers SET criado_em = :t WHERE uid = :uid', { t: m.relogio.agora - 100, uid: a.uid })
  assert.equal(codigoDe(() => publicar(m, a, 'imagem', corpoDeImagem(limpa, { uso: 'retrato', alt: 'Verde.' }))), 'conta_nova')
}))

// ---------- leitura ----------

test('leitura: envio não publicado não é servido; publicado é; as leituras ganham os campos só quando há imagem', comMundo((m) => {
  const a = m.rover()
  const post = postar(m, a)
  const sem = postar(m, a, 'Sem imagem.')
  const { limpa } = enviar(m, a, A.gps_webp)
  assert.equal(codigoDe(() => m.rele.midia.ler(limpa.hash)), 'nao_encontrado', 'enviado e não publicado')
  assert.equal(codigoDe(() => m.rele.midia.ler('f'.repeat(64))), 'nao_encontrado', 'nunca existiu')
  publicar(m, a, 'imagem', corpoDeImagem(limpa, { uso: 'anexo', alvo: post, ordem: 0, alt: 'Um quadrado.' }))
  const lido = m.rele.midia.ler(limpa.hash)
  assert.equal(lido.tipo, 'image/webp')
  assert.ok(lido.bytes.equals(limpa.bytes))
  const detalhe = m.rele.social.postagemDetalhe(post, {})
  assert.equal(detalhe.imagens.length, 1)
  assert.deepEqual(Object.keys(detalhe.imagens[0]).sort(), ['alt', 'altura', 'bytes', 'formato', 'hash', 'id', 'largura', 'ordem'])
  assert.equal(detalhe.imagens[0].alt, 'Um quadrado.')
  assert.equal('imagens' in m.rele.social.postagemDetalhe(sem, {}), false, 'sem imagem, sem o campo')
  const itens = m.rele.postagensDe(a.uid, { completo: true }).itens
  assert.equal(itens.find((i) => i.envelope.objeto.id === post).imagens.length, 1)
  assert.equal('imagens' in itens.find((i) => i.envelope.objeto.id === sem), false)
  // a lista antiga (sem `completo`) nunca entrega um objeto imagem
  assert.ok(m.rele.postagensDe(a.uid).itens.every((e) => e.objeto.tipo === 'postagem'))
  assert.equal('retratoImagem' in m.rele.perfil(a.uid), false)
}))

test('retrato: aparece no perfil; o novo retira o anterior e o arquivo antigo some na hora', comMundo((m) => {
  const a = m.rover()
  const r1 = publicarImagem(m, a, A.gps_png, { alt: 'Primeiro retrato.' })
  const h1 = limparImagem(A.gps_png).hash
  assert.equal(m.rele.perfil(a.uid).retratoImagem.hash, h1)
  assert.equal(m.rele.social.paginaDoRover(a.uid).rover.retratoImagem.alt, 'Primeiro retrato.')
  m.avancar(3601) // o envio do primeiro deixa de segurar o arquivo
  publicarImagem(m, a, A.alpha_png, { alt: 'Segundo retrato.' })
  const h2 = limparImagem(A.alpha_png).hash
  assert.equal(m.rele.perfil(a.uid).retratoImagem.hash, h2)
  assert.equal(existsSync(caminhoDoHash(m.dir, h1)), false, 'o arquivo do retrato antigo saiu do disco')
  assert.equal(codigoDe(() => m.rele.midia.ler(h1)), 'nao_encontrado')
  assert.equal(codigoDe(() => m.rele.objeto(r1.id)), 'removido')
}))

// ---------- remoção, órfão, retenção ----------

test('remoção órfã: o arquivo só some quando o ÚLTIMO objeto que o cita é removido', comMundo((m) => {
  const a = m.rover()
  const b = m.rover()
  const ia = publicarImagem(m, a, A.gps_jpg, { alvo: postar(m, a) })
  const ib = publicarImagem(m, b, A.gps_jpg, { alvo: postar(m, b) })
  const hash = limparImagem(A.gps_jpg).hash
  m.avancar(3601)
  publicar(m, a, 'remocao-pelo-autor', { alvo: ia.id })
  assert.equal(m.arquivos().length, 1, 'b ainda cita')
  assert.ok(m.rele.midia.ler(hash))
  publicar(m, b, 'remocao-pelo-autor', { alvo: ib.id })
  assert.equal(m.arquivos().length, 0, 'ninguém mais cita: saiu do disco')
  assert.equal(m.armazem.um('SELECT COUNT(*) AS n FROM midia').n, 0)
}))

test('remover a postagem leva os anexos junto, e os arquivos órfãos somem', comMundo((m) => {
  const a = m.rover()
  const post = postar(m, a)
  const i0 = publicarImagem(m, a, pngSintetico({ semente: 1 }), { alvo: post, ordem: 0 })
  const i1 = publicarImagem(m, a, pngSintetico({ semente: 2 }), { alvo: post, ordem: 1 })
  m.avancar(3601)
  publicar(m, a, 'remocao-pelo-autor', { alvo: post })
  for (const i of [i0, i1]) assert.equal(codigoDe(() => m.rele.objeto(i.id)), 'removido')
  assert.equal(m.arquivos().length, 0)
}))

test('envio nunca publicado some depois de 1 hora (limpeza periódica)', comMundo((m) => {
  const a = m.rover()
  enviar(m, a, A.gps_png)
  m.rele.limpar()
  assert.equal(m.arquivos().length, 1, 'dentro da hora fica')
  m.avancar(3601)
  m.rele.limpar()
  assert.equal(m.arquivos().length, 0)
}))

test('sair da rede apaga as imagens do rover', comMundo((m) => {
  const a = m.rover()
  publicarImagem(m, a, A.gps_png)
  publicarImagem(m, a, A.gps_jpg, { alvo: postar(m, a) })
  m.avancar(3601)
  const perfil = m.armazem.rover(a.uid).perfil_id
  publicar(m, a, 'remocao-pelo-autor', { alvo: perfil })
  assert.equal(m.arquivos().length, 0)
}))

test('bloqueio do operador: o arquivo deixa de ser servido mas fica (retenção igual à do objeto); desbloquear devolve', comMundo((m) => {
  const a = m.rover()
  const post = postar(m, a)
  const img = publicarImagem(m, a, A.gps_png, { alvo: post })
  const hash = limparImagem(A.gps_png).hash
  m.avancar(3601)
  m.rele.bloquear({ tipo: 'objeto', alvo: img.id, motivo: 'denúncia em análise', motivoPublico: 'ilegal' })
  m.rele.limpar()
  assert.equal(codigoDe(() => m.rele.midia.ler(hash)), 'nao_encontrado')
  assert.equal(m.arquivos().length, 1)
  assert.ok(m.rele.midia.lerComoOperador(hash).bytes.length > 0, 'o operador vê para decidir')
  m.rele.desbloquear('objeto', img.id)
  assert.ok(m.rele.midia.ler(hash))
  // bloquear a POSTAGEM também esconde o anexo
  m.rele.bloquear({ tipo: 'objeto', alvo: post, motivo: 'teste' })
  assert.equal(codigoDe(() => m.rele.midia.ler(hash)), 'nao_encontrado')
  assert.equal('imagens' in (m.rele.postagensDe(a.uid, { completo: true }).itens[0] ?? {}), false)
}))

test('denúncia de imagem funciona como a de qualquer objeto', comMundo((m) => {
  const a = m.rover()
  const b = m.rover()
  const img = publicarImagem(m, a, A.gps_png, { alvo: postar(m, a) })
  assert.equal(publicar(m, b, 'denuncia', { alvo: img.id, motivo: 'ilegal' }).estado, 'recebida')
  const d = m.rele.listarDenuncias()
  assert.equal(d.length, 1)
  assert.equal(d[0].alvo, img.id)
  assert.equal(d[0].motivo, 'ilegal')
}))

test('expurgo: apaga o arquivo, retira os objetos, entra no registro e o reenvio é midia_recusada', comMundo((m) => {
  const a = m.rover()
  const img = publicarImagem(m, a, A.gps_png, { alvo: postar(m, a) })
  const hash = limparImagem(A.gps_png).hash
  assert.equal(codigoDe(() => m.rele.midia.expurgar(hash, { motivo: '' })), 'esquema')
  assert.equal(codigoDe(() => m.rele.midia.expurgar(hash, { motivo: 'x', motivoPublico: 'inventado' })), 'esquema')
  assert.deepEqual(m.rele.midia.expurgar(hash, { motivo: 'material ilegal confirmado', motivoPublico: 'ilegal' }), { expurgado: true, objetos: 1 })
  assert.equal(m.arquivos().length, 0)
  assert.equal(codigoDe(() => m.rele.objeto(img.id)), 'removido')
  assert.equal(codigoDe(() => enviar(m, a, A.gps_png)), 'midia_recusada')
  const registro = m.rele.social.registroDoRele({})
  assert.ok(registro.itens.some((l) => l.alvo === img.id && l.motivo === 'ilegal'))
}))
