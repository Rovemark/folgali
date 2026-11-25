// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { Rele } from '../../packages/rele/src/rele.js'
import { codigoDe, erroDe, novoMundo, publicar, roverRegistrado } from '../ajuda/rele-de-teste.js'

const post = (texto) => ({ texto, topicos: [] })

test('denúncia: aceita sem revelar quem denunciou, em nenhuma tabela', () => {
  const m = novoMundo()
  const autor = roverRegistrado(m)
  const denunciante = roverRegistrado(m)
  const p = publicar(m, autor, 'postagem', post('conteúdo problemático'))
  const r = publicar(m, denunciante, 'denuncia', { alvo: p.id, motivo: 'spam' })
  assert.equal(r.estado, 'recebida')
  const fila = m.rele.listarDenuncias()
  assert.equal(fila.length, 1)
  assert.equal(fila[0].alvo, p.id)
  assert.equal(fila[0].autorDoAlvo, autor.uid)
  assert.equal(fila[0].motivo, 'spam')
  assert.match(fila[0].denunciante, /^[A-Za-z0-9_-]{22}$/)
  // o uid e a chave de quem denunciou não aparecem em lugar nenhum do que foi gravado
  const tudo = JSON.stringify([
    m.armazem.todos('SELECT * FROM denuncias'),
    m.armazem.todos("SELECT * FROM objetos WHERE tipo = 'denuncia'"),
    fila
  ])
  assert.ok(!tudo.includes(denunciante.uid))
  assert.ok(!tudo.includes(denunciante.rede.chavePublica))
  assert.ok(!tudo.includes(r.id), 'o próprio objeto assinado da denúncia não é guardado')
  assert.equal(m.armazem.objeto(r.id), null)
  // a cadeia de quem denunciou não registra a denúncia
  assert.equal(m.rele.perfil(denunciante.uid).cabeca, denunciante.cabeca)
})

test('denúncia: resposta igual para alvo que existe, que não existe e que é do próprio denunciante', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const b = roverRegistrado(m)
  const dele = publicar(m, a, 'postagem', post('de A'))
  const minha = publicar(m, b, 'postagem', post('de B'))
  const r1 = publicar(m, b, 'denuncia', { alvo: dele.id, motivo: 'golpe' })
  const r2 = publicar(m, b, 'denuncia', { alvo: `ob_${'Z'.repeat(43)}`, motivo: 'golpe' })
  const r3 = publicar(m, b, 'denuncia', { alvo: minha.id, motivo: 'golpe' })
  for (const r of [r1, r2, r3]) assert.equal(r.estado, 'recebida')
  assert.equal(m.rele.listarDenuncias().length, 1) // só a do alvo existente e alheio
})

test('denúncia repetida pelo mesmo denunciante conta uma vez; outro denunciante soma', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const b = roverRegistrado(m)
  const c = roverRegistrado(m)
  const p = publicar(m, a, 'postagem', post('x'))
  publicar(m, b, 'denuncia', { alvo: p.id, motivo: 'spam' })
  publicar(m, b, 'denuncia', { alvo: p.id, motivo: 'assedio' })
  assert.equal(m.rele.listarDenuncias().length, 1)
  publicar(m, c, 'denuncia', { alvo: p.id, motivo: 'spam' })
  const fila = m.rele.listarDenuncias()
  assert.equal(fila.length, 2)
  assert.notEqual(fila[0].denunciante, fila[1].denunciante)
  // o pseudônimo é estável para o mesmo denunciante e muda com o segredo do relé
  const outroRele = new Rele({ armazem: m.armazem, provedor: m.provedor, relogio: () => m.relogio.agora, segredoDeDenuncias: randomBytes(32) })
  assert.notEqual(outroRele._pseudonimo(b.uid), m.rele._pseudonimo(b.uid))
  assert.equal(m.rele._pseudonimo(b.uid), m.rele._pseudonimo(b.uid))
})

test('denúncia: dez por dia por denunciante, a décima primeira é recusada; no dia seguinte volta', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const d = roverRegistrado(m)
  for (let i = 0; i < 10; i++) {
    const p = publicar(m, a, 'postagem', post(`alvo ${i}`), { criadoEm: m.relogio.agora })
    assert.equal(publicar(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' }).estado, 'recebida')
    if (i % 9 === 8) continue
    m.avancar(400) // espaça as postagens de A para não bater no limite de taxa de postagem
  }
  const extra = publicar(m, a, 'postagem', post('mais um'))
  const e = erroDe(() => publicar(m, d, 'denuncia', { alvo: extra.id, motivo: 'spam' }))
  assert.equal(e.codigo, 'limite_de_taxa')
  m.avancar(86400 + 1)
  assert.equal(publicar(m, d, 'denuncia', { alvo: extra.id, motivo: 'spam' }).estado, 'recebida')
})

test('denúncia vale a assinatura, o atestado e o relógio como qualquer objeto', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const d = roverRegistrado(m)
  const p = publicar(m, a, 'postagem', post('x'))
  assert.equal(codigoDe(() => publicar(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' }, { criadoEm: m.relogio.agora - 5000 })), 'relogio')
  m.provedor.revogar(m.provedor.chavePublica, d.uid)
  assert.equal(codigoDe(() => publicar(m, d, 'denuncia', { alvo: p.id, motivo: 'spam' })), 'atestado_revogado')
  assert.equal(m.rele.listarDenuncias().length, 0)
})

test('denúncia de conteúdo removido pelo autor some da fila; quem sai leva as denúncias junto', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const d = roverRegistrado(m)
  const p1 = publicar(m, a, 'postagem', post('um'))
  const p2 = publicar(m, a, 'postagem', post('dois'))
  publicar(m, d, 'denuncia', { alvo: p1.id, motivo: 'spam' })
  publicar(m, d, 'denuncia', { alvo: p2.id, motivo: 'spam' })
  publicar(m, a, 'remocao-pelo-autor', { alvo: p1.id })
  assert.deepEqual(m.rele.listarDenuncias().map((x) => x.alvo), [p2.id])
  publicar(m, a, 'remocao-pelo-autor', { alvo: m.armazem.rover(a.uid).perfil_id })
  assert.equal(m.rele.listarDenuncias().length, 0)
})

test('retenção: denúncia some depois do prazo', () => {
  const m = novoMundo()
  const a = roverRegistrado(m)
  const d = roverRegistrado(m)
  const p = publicar(m, a, 'postagem', post('x'))
  publicar(m, d, 'denuncia', { alvo: p.id, motivo: 'ilegal' })
  m.avancar(179 * 86400)
  assert.equal(m.rele.limpar(), 0)
  assert.equal(m.rele.listarDenuncias().length, 1)
  m.avancar(2 * 86400)
  assert.equal(m.rele.limpar(), 1)
  assert.equal(m.rele.listarDenuncias().length, 0)
})

test('bloquear rover: some da leitura, não publica mais; desbloquear devolve', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const outro = roverRegistrado(m)
  publicar(m, r, 'postagem', post('antes do bloqueio'))
  publicar(m, outro, 'seguir', { alvo: r.uid })
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'abuso comprovado' })
  assert.equal(codigoDe(() => m.rele.perfil(r.uid)), 'nao_encontrado')
  assert.equal(codigoDe(() => m.rele.postagensDe(r.uid)), 'nao_encontrado')
  assert.equal(m.rele.linhaDoInicio(outro.uid).itens.length, 0)
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('depois'))), 'bloqueado')
  assert.equal(codigoDe(() => publicar(m, outro, 'seguir', { alvo: r.uid })), 'alvo_desconhecido') // o bloqueado deixa de ser alvo
  assert.equal(codigoDe(() => publicar(m, outro, 'reacao', { alvo: m.armazem.rover(r.uid).cabeca_id, reacao: 'curtir' })), 'alvo_desconhecido')
  assert.deepEqual(m.rele.listarBloqueios().map((b) => [b.tipo, b.alvo, b.motivo]), [['rover', r.uid, 'abuso comprovado']])
  m.rele.desbloquear('rover', r.uid)
  assert.equal(m.rele.perfil(r.uid).uid, r.uid)
  assert.equal(publicar(m, r, 'postagem', post('de volta')).estado, 'aceito')
})

test('bloquear objeto: some das leituras e dos alvos; bloquear emissor: ninguém dele entra nem aparece', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const outro = roverRegistrado(m)
  const ruim = publicar(m, r, 'postagem', post('ruim'))
  const bom = publicar(m, r, 'postagem', post('bom'))
  publicar(m, outro, 'seguir', { alvo: r.uid })
  m.rele.bloquear({ tipo: 'objeto', alvo: ruim.id, motivo: 'conteúdo ilegal' })
  assert.deepEqual(m.rele.postagensDe(r.uid).itens.map((e) => e.objeto.id), [bom.id])
  assert.deepEqual(m.rele.linhaDoInicio(outro.uid).itens.map((e) => e.objeto.id), [bom.id])
  assert.equal(codigoDe(() => m.rele.objeto(ruim.id)), 'nao_encontrado')
  assert.equal(codigoDe(() => publicar(m, outro, 'resposta', { alvo: ruim.id, texto: 'oi' })), 'alvo_desconhecido')
  assert.equal(m.rele.objeto(bom.id).objeto.id, bom.id)

  m.rele.bloquear({ tipo: 'emissor', alvo: m.provedor.chavePublica, motivo: 'emissor comprometido' })
  assert.equal(codigoDe(() => publicar(m, r, 'postagem', post('x'))), 'bloqueado')
  assert.equal(codigoDe(() => m.rele.perfil(r.uid)), 'nao_encontrado')
  m.rele.desbloquear('emissor', m.provedor.chavePublica)
  assert.equal(m.rele.perfil(r.uid).uid, r.uid)
})

test('bloqueio: validação de entrada e desbloqueio do que não existe', () => {
  const m = novoMundo()
  const r = roverRegistrado(m)
  const ruim = [
    { tipo: 'pessoa', alvo: r.uid, motivo: 'x' },
    { tipo: 'rover', alvo: 'rvr_curto', motivo: 'x' },
    { tipo: 'objeto', alvo: r.uid, motivo: 'x' },
    { tipo: 'emissor', alvo: 'curta', motivo: 'x' },
    { tipo: 'rover', alvo: r.uid, motivo: '' },
    { tipo: 'rover', alvo: r.uid, motivo: 'x'.repeat(201) },
    { tipo: 'rover', alvo: r.uid, motivo: '<b>html</b>' },
    { tipo: 'rover', alvo: 5, motivo: 'x' }
  ]
  for (const b of ruim) assert.equal(codigoDe(() => m.rele.bloquear(b)), 'esquema', JSON.stringify(b))
  assert.equal(codigoDe(() => m.rele.desbloquear('rover', r.uid)), 'nao_encontrado')
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'um' })
  m.rele.bloquear({ tipo: 'rover', alvo: r.uid, motivo: 'dois' }) // repetir troca o motivo, não duplica
  assert.deepEqual(m.rele.listarBloqueios().map((b) => b.motivo), ['dois'])
})

test('segredo de denúncias curto ou ausente não deixa o relé subir', () => {
  const m = novoMundo()
  for (const segredo of [undefined, Buffer.alloc(16), 'x'.repeat(40)]) {
    assert.throws(() => new Rele({ armazem: m.armazem, provedor: m.provedor, segredoDeDenuncias: segredo }), /32 bytes/)
  }
})
