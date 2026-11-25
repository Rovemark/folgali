// A ESCRITA do cliente falso social: os gestos livres (`executar`), a criação dos objetos de texto
// depois da aprovação (`criar`) e a fila de rascunhos. Cada regra vem das tabelas de
// docs/API-REDE-SOCIAL.md (seções 4, 8 e 10) e das funções puras de src/lib/dominio. O autor é um
// parâmetro (a Lumi, quando vem pela ponte; qualquer rover nos testes e na semente), para as regras
// valerem para todo mundo e não só para o dono do navegador.

import {
  analisarSocial, aprovarSocial as aprovarPuro, bloqueiaSocial, editarSocial as editarPuro, recusarSocial as recusarPuro, ESQUEMA_SOCIAL,
  type Campos, type DestinoDoRascunho, type RascunhoSocial, type ResultadoAprovacaoSocial, type TipoSocial,
} from '../../dominio/aprovacao-social'
import { aplicarDecisao, podeEscreverOutro } from '../../dominio/depoimento'
import { resumo as hash } from '../../dominio/hash'
import { podeApelar, quemDecideApelacao, validarGestao } from '../../dominio/moderacao'
import {
  podeEditarTopico, podeMoverTopico, podeNaComunidade, podeNaPagina, podeNoPerfil, type Negacao, type RelacaoComODono, type Veredito,
} from '../../dominio/permissoes'
import { extrairMencoes } from '../../dominio/texto-social'
import { ErroRede, type TipoReacao } from '../../tipos'
import type { AtoSocial, ResultadoDeAto } from '../cliente-social'
import { MOTIVOS_DENUNCIA_SOCIAL, type MotivoModeracao, type TipoDeNotificacao } from '../tipos'
import { semAcento, iso } from './base'
import { DIA, HORA, type ComunidadeS, type RespostaS, type TopicoS } from './interno'
import { Leitura } from './leitura'

const nega = (v: Veredito | { ok: false; motivo: string } | { ok: true }): void => {
  if (!v.ok) throw new ErroRede(v.motivo as Negacao, 'a regra não permite')
}
const chaveNome = (s: string) => semAcento(s).replace(/[^a-z0-9]/g, '')
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

export class Escrita extends Leitura {
  // ---- ajudantes de regra ------------------------------------------------------------------------------

  protected relacaoCom(autor: string, alvo: string): RelacaoComODono {
    return {
      proprio: autor === alvo,
      amigo: this.ehAmigo(autor, alvo),
      amigoHaDias: this.amigoHaDias(autor, alvo),
      contaDias: this.contaDias(autor),
      bloqueio: this.bloqueio(autor, alvo),
      recados: this.rover(alvo).recados,
    }
  }
  protected roverAlvo(uid: string): void {
    this.rover(uid)
  }
  protected topicoDe(id: string, autor: string): { t: TopicoS; c: ComunidadeS } {
    const t = this.top(id)
    const c = this.bdComunidades.get(t.comunidade)
    if (!c || c.encerrada || !podeNaComunidade('ler', this.quem(c, autor), c.acesso).ok) throw new ErroRede('nao-encontrado', 'tópico não encontrado')
    return { t, c }
  }
  protected papelRegistro(c: ComunidadeS, autor: string): 'dono' | 'moderador' {
    return c.dono === autor ? 'dono' : 'moderador'
  }
  protected registrar(r: { escopo: 'comunidade' | 'pagina' | 'rele'; contexto: string | null; acao: 'remocao' | 'expulsao' | 'banimento' | 'dispensa'; alvoTipo: string | null; alvo: string; motivo: MotivoModeracao | 'dispensada'; por: 'dono' | 'moderador' | 'administrador' | 'rele'; apelacaoId?: string }) {
    const x = { id: this.novoId(), em: this.now(), ...r }
    this.registro.push(x)
    return x
  }
  protected notificarMencoes(texto: string, autor: string, o: { objeto: string; comunidade?: string | null; pagina?: string | null }, jaNotificados: Set<string>): void {
    const c = o.comunidade ? this.bdComunidades.get(o.comunidade) : undefined
    for (const h of extrairMencoes(texto)) {
      const r = [...this.rovers.values()].find((x) => x.handle === h)
      if (!r || jaNotificados.has(r.uid) || r.uid === autor) continue
      if (c && !podeNaComunidade('ler', this.quem(c, r.uid), c.acesso).ok) continue
      jaNotificados.add(r.uid)
      this.notificar(r.uid, 'mencao', { origem: autor, ...o })
    }
  }

  // ---- gestos livres -------------------------------------------------------------------------------------

  /** A Lumi age (a ponte do app). */
  async agir(ato: AtoSocial): Promise<ResultadoDeAto> {
    return this.executar(this.eu, ato)
  }

  executar(autor: string, ato: AtoSocial): ResultadoDeAto {
    switch (ato.tipo) {
      case 'estado':
        this.rover(autor).estado = { estado: ato.estado, em: iso(this.now()) }
        return {}
      case 'amizade':
        return this.amizadeAto(autor, ato.alvo, ato.acao)
      case 'relacao':
        return this.relacaoAto(autor, ato.alvo, ato.acao)
      case 'selo':
        return this.seloAto(autor, ato.alvo, ato.selo)
      case 'depoimento-decisao':
        return this.decidirDepoimento(autor, ato.depoimento, ato.decisao)
      case 'comunidade-adesao':
        return this.adesaoAto(autor, ato.comunidade, ato.acao)
      case 'comunidade-gestao':
        return this.gestaoAto(autor, ato)
      case 'topico-gestao':
        return this.topicoGestao(autor, ato)
      case 'topico-resolvido':
        return this.resolverAto(autor, ato.topico, ato.resposta)
      case 'voto':
        return this.votoAto(autor, ato.topico, ato.opcao)
      case 'pagina-seguir':
        return this.paginaSeguir(autor, ato.pagina, ato.acao)
      case 'pagina-gestao':
        return this.paginaGestao(autor, ato.pagina, ato.alvo, ato.acao)
      case 'remocao-por-responsavel':
        return this.removerPorResponsavel(autor, ato.alvo, ato.motivo)
      case 'remocao-pelo-autor':
        return this.removerPeloAutorSocial(autor, ato.alvo)
      case 'apelacao-decisao':
        return this.decidirApelacao(autor, ato.apelacao, ato.resultado)
      case 'denuncia':
        return this.denunciarAto(autor, ato.alvo, ato.motivo)
      case 'denuncia-dispensar':
        return this.dispensarDenuncia(autor, ato.comunidade, ato.alvo)
      case 'conversa-decidir':
      case 'conversa-apagar':
      case 'mensagem-denuncia':
        return this.atoDeMensagem(autor, ato)
    }
  }

  // ---- 0.4.0: mensagens privadas. As regras moram em ./mensagens.ts (a camada de cima); aqui só o gancho. ----------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gancho: a camada de mensagens (./mensagens.ts) sobrescreve
  protected atoDeMensagem(_autor: string, _ato: Extract<AtoSocial, { tipo: 'conversa-decidir' | 'conversa-apagar' | 'mensagem-denuncia' }>): ResultadoDeAto {
    throw new ErroRede('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- gancho: a camada de mensagens (./mensagens.ts) sobrescreve
  protected criarDeMensagem(_autor: string, _tipo: 'conversa-pedir' | 'mensagem', _campos: Campos, _id: string): string {
    throw new ErroRede('versao-nao-suportada', 'este relé não tem mensagens privadas')
  }

  // ---- amizade e relações --------------------------------------------------------------------------------------

  protected amizadeAto(autor: string, alvo: string, acao: 'pedir' | 'aceitar' | 'recusar' | 'desfazer'): ResultadoDeAto {
    this.roverAlvo(alvo)
    if (autor === alvo) throw new ErroRede('invalido', 'um rover não faz amizade consigo')
    const pedido = (de: string, para: string) => this.pedidos.findIndex((p) => p.de === de && p.para === para)
    if (this.bloqueio(autor, alvo) && acao !== 'desfazer') throw new ErroRede('interacao-nao-permitida', 'não é possível interagir')
    const t = this.now()
    if (acao === 'pedir') {
      if (this.ehAmigo(autor, alvo) || pedido(autor, alvo) >= 0) throw new ErroRede('ja-existe', 'já são amigos ou já pediu')
      if (this.recusadas.some((r) => ((r.de === autor && r.para === alvo) || (r.de === alvo && r.para === autor)) && t - r.em < 7 * DIA)) throw new ErroRede('limite', 'houve recusa há menos de 7 dias')
      if (this.amigosDe(autor).length >= 500) throw new ErroRede('limite-de-estrutura', 'limite de amigos')
      if (this.pedidos.filter((p) => p.de === autor).length >= 50) throw new ErroRede('limite-de-estrutura', 'pedidos enviados demais')
      if (this.pedidos.filter((p) => p.para === alvo).length >= 100) throw new ErroRede('limite-de-estrutura', 'o alvo tem pedidos demais')
      const volta = pedido(alvo, autor)
      if (volta >= 0) {
        this.pedidos.splice(volta, 1)
        this.amizades.push({ a: alvo, b: autor, desde: t })
        this.notificar(alvo, 'amizade-aceita', { origem: autor })
        return { resultado: 'ativa' }
      }
      this.pedidos.push({ de: autor, para: alvo, em: t })
      this.notificar(alvo, 'pedido-de-amizade', { origem: autor })
      return { resultado: 'pendente' }
    }
    if (acao === 'aceitar' || acao === 'recusar') {
      const i = pedido(alvo, autor)
      if (i < 0) throw new ErroRede('nao-encontrado', 'não há pedido')
      this.pedidos.splice(i, 1)
      if (acao === 'recusar') {
        this.recusadas.push({ de: alvo, para: autor, em: t })
        return { resultado: 'nenhuma' }
      }
      this.amizades.push({ a: alvo, b: autor, desde: t })
      this.notificar(alvo, 'amizade-aceita', { origem: autor })
      return { resultado: 'ativa' }
    }
    const am = this.amizade(autor, alvo)
    if (am) {
      this.amizades.splice(this.amizades.indexOf(am), 1)
      return { resultado: 'nenhuma' }
    }
    const i = pedido(autor, alvo)
    if (i < 0) throw new ErroRede('nao-encontrado', 'nada a desfazer')
    this.pedidos.splice(i, 1)
    return { resultado: 'nenhuma' }
  }

  protected relacaoAto(autor: string, alvo: string, acao: 'bloquear' | 'desbloquear' | 'silenciar' | 'dessilenciar'): ResultadoDeAto {
    this.roverAlvo(alvo)
    if (autor === alvo) throw new ErroRede('invalido', 'um rover não age sobre si')
    const k = this.chave(autor, alvo)
    const atual = this.bdRelacoes.get(k)?.relacao
    const quer = acao === 'bloquear' ? 'bloqueio' : acao === 'silenciar' ? 'silencio' : null
    if (quer) {
      if (atual === quer) throw new ErroRede('ja-existe', 'já está assim')
      const total = [...this.bdRelacoes.entries()].filter(([c, v]) => c.startsWith(`${autor}>`) && v.relacao === quer).length
      if (total >= 1000) throw new ErroRede('limite-de-estrutura', 'limite de relações')
      this.bdRelacoes.set(k, { relacao: quer, desde: this.now() })
      if (quer === 'bloqueio') {
        // desfaz amizade, pedidos e seguir nos dois sentidos, e esconde os depoimentos pendentes entre os dois
        const am = this.amizade(autor, alvo)
        if (am) this.amizades.splice(this.amizades.indexOf(am), 1)
        for (let i = this.pedidos.length - 1; i >= 0; i--) {
          const p = this.pedidos[i]
          if ((p.de === autor && p.para === alvo) || (p.de === alvo && p.para === autor)) this.pedidos.splice(i, 1)
        }
        this.ganchos.desfazerSeguir(autor, alvo)
        this.ganchos.desfazerSeguir(alvo, autor)
        for (const d of this.bdDepoimentos) if (d.estado === 'pendente' && ((d.autor === alvo && d.alvo === autor) || (d.autor === autor && d.alvo === alvo))) d.estado = 'recusado'
      }
      return {}
    }
    const tipo = acao === 'desbloquear' ? 'bloqueio' : 'silencio'
    if (atual !== tipo) throw new ErroRede('ja-existe', 'já está assim')
    this.bdRelacoes.delete(k)
    return {}
  }

  protected seloAto(autor: string, alvo: string, selo: import('../tipos').TipoSelo): ResultadoDeAto {
    this.roverAlvo(alvo)
    nega(podeNoPerfil('selo', this.relacaoCom(autor, alvo)))
    if (this.bdSelos.some((s) => !s.apagado && s.doador === autor && s.alvo === alvo && s.selo === selo)) throw new ErroRede('ja-existe', 'esse selo já foi dado')
    if (this.bdSelos.filter((s) => s.alvo === alvo && this.now() - s.em < DIA).length >= 10) throw new ErroRede('limite', 'selos demais por dia')
    this.bdSelos.push({ id: this.novoId(), doador: autor, alvo, selo, em: this.now() })
    this.notificar(alvo, 'selo-recebido', { origem: null })
    return {}
  }

  protected decidirDepoimento(autor: string, id: string, decisao: 'aceitar' | 'recusar'): ResultadoDeAto {
    const d = this.bdDepoimentos.find((x) => x.id === id && !x.apagado)
    if (!d) throw new ErroRede('nao-encontrado', 'depoimento não encontrado')
    if (d.alvo !== autor) throw new ErroRede('sem-permissao', 'só o dono do perfil decide')
    const novo = aplicarDecisao(d.estado, decisao)
    if (novo === null) throw new ErroRede('ja-existe', 'o depoimento já está assim')
    d.estado = novo
    if (novo === 'aceito') {
      d.aceitoEm = this.now()
      this.notificar(d.autor, 'depoimento-aceito', { origem: autor, objeto: d.id })
    } else d.recusadoEm = this.now()
    return { resultado: novo }
  }

  // ---- comunidades -------------------------------------------------------------------------------------------------

  protected adesaoAto(autor: string, id: string, acao: 'entrar' | 'sair' | 'aceitar-convite' | 'recusar-convite' | 'cancelar-pedido'): ResultadoDeAto {
    const c = this.com(id)
    const convite = c.convites.findIndex((x) => x.uid === autor)
    const q = this.quem(c, autor)
    // a fechada só existe para quem foi convidado ou já é membro
    if (c.acesso === 'fechada' && q.papel === null && convite < 0) throw new ErroRede('nao-encontrado', 'comunidade não encontrada')
    const t = this.now()
    const entrou = () => {
      c.membros.set(autor, { papel: 'membro', desde: t })
      c.entradas.push(t)
    }
    const quantas = () => [...this.bdComunidades.values()].filter((x) => !x.encerrada && x.membros.has(autor)).length
    switch (acao) {
      case 'entrar': {
        nega(podeNaComunidade(c.acesso === 'moderada' ? 'pedir-entrada' : 'entrar', q, c.acesso))
        if (quantas() >= 200) throw new ErroRede('limite-de-estrutura', 'comunidades demais')
        const raid = c.entradas.filter((e) => t - e < HORA).length > 30
        if (c.acesso === 'aberta' && !raid) {
          entrou()
          return { resultado: 'membro' }
        }
        if (c.pedidos.some((p) => p.uid === autor)) throw new ErroRede('ja-existe', 'já pediu')
        if ([...this.bdComunidades.values()].reduce((n, x) => n + x.pedidos.filter((p) => p.uid === autor).length, 0) >= 20) throw new ErroRede('limite-de-estrutura', 'pedidos demais')
        if (c.pedidos.length >= 500) throw new ErroRede('limite-de-estrutura', 'pedidos demais na comunidade')
        c.pedidos.push({ uid: autor, em: t })
        for (const [u, m] of c.membros) if (m.papel !== 'membro') this.notificar(u, 'pedido-de-entrada', { origem: autor, comunidade: c.id })
        return { resultado: 'pendente' }
      }
      case 'sair':
        nega(podeNaComunidade('sair', q, c.acesso))
        c.membros.delete(autor)
        return { resultado: 'fora' }
      case 'aceitar-convite':
        if (convite < 0) throw new ErroRede('nao-encontrado', 'não há convite')
        if (q.banido) throw new ErroRede('banido', 'banido')
        c.convites.splice(convite, 1)
        entrou()
        return { resultado: 'membro' }
      case 'recusar-convite':
        if (convite < 0) throw new ErroRede('nao-encontrado', 'não há convite')
        c.convites.splice(convite, 1)
        return { resultado: 'fora' }
      case 'cancelar-pedido': {
        const i = c.pedidos.findIndex((p) => p.uid === autor)
        if (i < 0) throw new ErroRede('nao-encontrado', 'não há pedido')
        c.pedidos.splice(i, 1)
        return { resultado: 'fora' }
      }
    }
  }

  protected gestaoAto(autor: string, a: Extract<AtoSocial, { tipo: 'comunidade-gestao' }>): ResultadoDeAto {
    if (validarGestao(a.acao, a.motivo) !== null) throw new ErroRede('invalido', 'motivo inválido para esta ação')
    if (a.alvo === autor) throw new ErroRede('invalido', 'um rover não age sobre si')
    const c = this.com(a.comunidade)
    const q = this.quem(c, autor)
    // quem não pode nem ler a comunidade não sabe que ela existe
    if (!podeNaComunidade('ler', q, c.acesso).ok) throw new ErroRede('nao-encontrado', 'comunidade não encontrada')
    this.roverAlvo(a.alvo)
    const alvoPapel = this.papel(c, a.alvo)
    if (alvoPapel === 'dono') throw new ErroRede('sem-permissao', 'ninguém age sobre o dono')
    if (this.bloqueio(autor, a.alvo) && a.acao === 'convidar') throw new ErroRede('interacao-nao-permitida', 'não é possível interagir')
    const t = this.now()
    const por = this.papelRegistro(c, autor)
    const quemPapel = { alvoPapel }
    switch (a.acao) {
      case 'convidar':
        nega(podeNaComunidade('convidar', q, c.acesso))
        if (alvoPapel !== null) throw new ErroRede('ja-existe', 'já é membro')
        if (this.banido(c, a.alvo)) throw new ErroRede('banido', 'o rover está banido')
        if (c.convites.some((x) => x.uid === a.alvo)) throw new ErroRede('ja-existe', 'já foi convidado')
        if (c.convites.length >= 100 || [...this.bdComunidades.values()].reduce((n, x) => n + x.convites.filter((v) => v.uid === a.alvo).length, 0) >= 50) throw new ErroRede('limite-de-estrutura', 'convites demais')
        c.convites.push({ uid: a.alvo, por: autor, em: t })
        this.notificar(a.alvo, 'convite-comunidade', { origem: autor, comunidade: c.id })
        return {}
      case 'cancelar-convite': {
        nega(podeNaComunidade('convidar', q, c.acesso))
        const i = c.convites.findIndex((x) => x.uid === a.alvo)
        if (i < 0) throw new ErroRede('nao-encontrado', 'não há convite')
        c.convites.splice(i, 1)
        return {}
      }
      case 'aprovar-pedido':
      case 'recusar-pedido': {
        nega(podeNaComunidade('decidir-pedido', q, c.acesso))
        const i = c.pedidos.findIndex((x) => x.uid === a.alvo)
        if (i < 0) throw new ErroRede('nao-encontrado', 'não há pedido')
        c.pedidos.splice(i, 1)
        if (a.acao === 'recusar-pedido') return { resultado: 'fora' }
        c.membros.set(a.alvo, { papel: 'membro', desde: t })
        c.entradas.push(t)
        this.notificar(a.alvo, 'entrada-aprovada', { origem: autor, comunidade: c.id })
        return { resultado: 'membro' }
      }
      case 'expulsar':
        nega(podeNaComunidade('expulsar', q, c.acesso, quemPapel))
        if (alvoPapel === null) throw new ErroRede('nao-encontrado', 'não é membro')
        c.membros.delete(a.alvo)
        this.registrar({ escopo: 'comunidade', contexto: c.id, acao: 'expulsao', alvoTipo: null, alvo: a.alvo, motivo: a.motivo!, por })
        this.notificar(a.alvo, 'expulso', { origem: null, comunidade: c.id })
        return { resultado: 'fora' }
      case 'banir': {
        nega(podeNaComunidade('banir', q, c.acesso, quemPapel))
        if (this.banido(c, a.alvo)) throw new ErroRede('ja-existe', 'já está banido')
        c.membros.delete(a.alvo)
        c.convites = c.convites.filter((x) => x.uid !== a.alvo)
        c.pedidos = c.pedidos.filter((x) => x.uid !== a.alvo)
        c.banidos.push({ uid: a.alvo, motivo: a.motivo!, por: por === 'dono' ? 'dono' : 'moderador', em: t })
        this.registrar({ escopo: 'comunidade', contexto: c.id, acao: 'banimento', alvoTipo: null, alvo: a.alvo, motivo: a.motivo!, por })
        this.notificar(a.alvo, 'banido', { origem: null, comunidade: c.id })
        return { resultado: 'fora' }
      }
      case 'desbanir': {
        nega(podeNaComunidade('desbanir', q, c.acesso))
        const i = c.banidos.findIndex((b) => b.uid === a.alvo)
        if (i < 0) throw new ErroRede('nao-encontrado', 'não está banido')
        c.banidos.splice(i, 1)
        return {}
      }
      case 'promover': {
        nega(podeNaComunidade('promover', q, c.acesso))
        if (alvoPapel === null) throw new ErroRede('nao-e-membro', 'o rover não é membro')
        if (alvoPapel === 'moderador') throw new ErroRede('ja-existe', 'já é moderador')
        if ([...c.membros.values()].filter((m) => m.papel === 'moderador').length >= 10) throw new ErroRede('limite-de-estrutura', 'moderadores demais')
        c.membros.get(a.alvo)!.papel = 'moderador'
        return {}
      }
      case 'rebaixar':
        nega(podeNaComunidade('rebaixar', q, c.acesso))
        if (alvoPapel !== 'moderador') throw new ErroRede('nao-encontrado', 'não é moderador')
        c.membros.get(a.alvo)!.papel = 'membro'
        return {}
    }
  }

  protected topicoGestao(autor: string, a: Extract<AtoSocial, { tipo: 'topico-gestao' }>): ResultadoDeAto {
    const { t, c } = this.topicoDe(a.topico, autor)
    const q = this.quem(c, autor)
    if (a.acao === 'mover') {
      const dest = this.com(a.comunidade ?? '')
      const qd = this.quem(dest, autor)
      if (!podeNaComunidade('ler', qd, dest.acesso).ok) throw new ErroRede('nao-encontrado', 'comunidade não encontrada')
      nega(podeMoverTopico({ papel: q.papel, acesso: c.acesso }, { papel: qd.papel, acesso: dest.acesso }))
      if (a.categoria !== null && !dest.categorias.includes(a.categoria)) throw new ErroRede('invalido', 'a categoria não existe no destino')
      t.comunidade = dest.id
      t.categoria = a.categoria
      t.fixado = false
      return {}
    }
    nega(podeNaComunidade(a.acao === 'fixar' || a.acao === 'desafixar' ? 'fixar' : 'trancar', q, c.acesso))
    if (a.acao === 'fixar') {
      if (!t.fixado && [...this.bdTopicos.values()].filter((x) => x.comunidade === c.id && x.fixado && !x.removido && !x.apagado).length >= 3) throw new ErroRede('limite-de-estrutura', 'só 3 fixados')
      t.fixado = true
    } else if (a.acao === 'desafixar') t.fixado = false
    else t.trancado = a.acao === 'trancar'
    return {}
  }

  protected resolverAto(autor: string, topico: string, resposta: string | null): ResultadoDeAto {
    const { t, c } = this.topicoDe(topico, autor)
    nega(podeNaComunidade('resolver', this.quem(c, autor), c.acesso, { meuTopico: t.autor === autor }))
    if (resposta === null) {
      t.resolvidoPor = null
      return {}
    }
    const r = this.bdRespostas.get(resposta)
    if (!r || r.topico !== t.id || r.removida || r.apagada) throw new ErroRede('nao-encontrado', 'resposta não encontrada')
    t.resolvidoPor = { resposta, por: autor, em: this.now() }
    this.notificar(r.autor, 'resolveu', { origem: autor, objeto: r.id, comunidade: c.id })
    return {}
  }

  protected votoAto(autor: string, topico: string, opcao: number): ResultadoDeAto {
    const { t, c } = this.topicoDe(topico, autor)
    nega(podeNaComunidade('votar', this.quem(c, autor), c.acesso))
    const e = t.enquete
    if (!e) throw new ErroRede('nao-encontrado', 'o tópico não tem enquete')
    if (this.now() >= e.encerraEm) throw new ErroRede('enquete-encerrada', 'a enquete terminou')
    if (!Number.isInteger(opcao) || opcao < 0 || opcao >= e.opcoes.length) throw new ErroRede('invalido', 'opção inexistente')
    if (e.votantes.has(autor)) throw new ErroRede('ja-existe', 'já votou: não há troca de voto')
    e.votantes.set(autor, opcao)
    e.votos[opcao]++
    return {}
  }

  // ---- páginas ---------------------------------------------------------------------------------------------------------

  protected paginaSeguir(autor: string, id: string, acao: 'seguir' | 'deixar'): ResultadoDeAto {
    const p = this.pag(id)
    if (acao === 'seguir') {
      if (p.seguidores.has(autor)) throw new ErroRede('ja-existe', 'já segue')
      if ([...this.bdPaginas.values()].filter((x) => !x.encerrada && x.seguidores.has(autor)).length >= 300) throw new ErroRede('limite-de-estrutura', 'páginas demais')
      p.seguidores.set(autor, this.now())
      if (p.dono !== autor && this.grafoPublico(autor)) this.notificar(p.dono, 'novo-seguidor', { origem: autor, pagina: p.id })
      return {}
    }
    if (!p.seguidores.has(autor)) throw new ErroRede('nao-encontrado', 'não segue')
    p.seguidores.delete(autor)
    return {}
  }

  protected paginaGestao(autor: string, id: string, alvo: string, acao: 'adicionar-admin' | 'remover-admin'): ResultadoDeAto {
    const p = this.pag(id)
    nega(podeNaPagina('gerir-administradores', this.papelNaPagina(p, autor)))
    this.roverAlvo(alvo)
    if (acao === 'adicionar-admin') {
      if (p.admins.includes(alvo)) throw new ErroRede('ja-existe', 'já é administrador')
      if (p.admins.length >= 10) throw new ErroRede('limite-de-estrutura', 'administradores demais')
      p.admins.push(alvo)
      return {}
    }
    if (alvo === p.dono) throw new ErroRede('invalido', 'o dono não se remove')
    if (!p.admins.includes(alvo)) throw new ErroRede('nao-encontrado', 'não é administrador')
    p.admins = p.admins.filter((u) => u !== alvo)
    return {}
  }

  // ---- remoção, apelação, denúncia ---------------------------------------------------------------------------------

  protected reter(id: string, o: { texto: string; tipo: string; autor: string; porPapel: 'dono' | 'moderador' | 'administrador' | 'rele'; comunidade: string | null; pagina: string | null }) {
    this.retidos.set(id, { ...o, removidoEm: this.now() })
  }

  protected removerPorResponsavel(autor: string, id: string, motivo: MotivoModeracao): ResultadoDeAto {
    const rec = this.bdRecados.find((x) => x.id === id)
    if (rec) {
      if (rec.alvo !== autor) throw new ErroRede('sem-permissao', 'só o dono do mural remove')
      if (!rec.removido) {
        rec.removido = true
        this.reter(id, { texto: rec.texto, tipo: 'recado', autor: rec.autor, porPapel: 'dono', comunidade: null, pagina: null })
        this.notificar(rec.autor, 'removido-por-responsavel', { origem: null, objeto: id })
      }
      return {}
    }
    const dep = this.bdDepoimentos.find((x) => x.id === id)
    if (dep) {
      if (dep.alvo !== autor) throw new ErroRede('sem-permissao', 'só o dono do perfil remove')
      if (!dep.apagado) {
        dep.apagado = true
        this.reter(id, { texto: dep.texto, tipo: 'depoimento', autor: dep.autor, porPapel: 'dono', comunidade: null, pagina: null })
        this.notificar(dep.autor, 'removido-por-responsavel', { origem: null, objeto: id })
      }
      return {}
    }
    const t = this.bdTopicos.get(id)
    const r = this.bdRespostas.get(id)
    if (t || r) {
      const tp = t ?? this.bdTopicos.get(r!.topico)
      const c = tp ? this.bdComunidades.get(tp.comunidade) : undefined
      if (!tp || !c || c.encerrada || !podeNaComunidade('ler', this.quem(c, autor), c.acesso).ok) throw new ErroRede('nao-encontrado', 'não encontrado')
      const dono = (t ?? r!).autor
      if (dono === autor) throw new ErroRede('sem-permissao', 'para o seu próprio conteúdo, apague')
      nega(podeNaComunidade('remover-alheio', this.quem(c, autor), c.acesso, { conteudoDoDono: dono === c.dono }))
      const ja = t ? t.removido : r!.removida
      if (ja) return {}
      const por = this.papelRegistro(c, autor)
      if (t) t.removido = { por, em: this.now() }
      else r!.removida = { por, em: this.now() }
      this.reter(id, { texto: t ? `${t.titulo}\n${t.texto}` : r!.texto, tipo: t ? 'topico' : 'resposta-forum', autor: dono, porPapel: por, comunidade: c.id, pagina: null })
      this.registrar({ escopo: 'comunidade', contexto: c.id, acao: 'remocao', alvoTipo: t ? 'topico' : 'resposta-forum', alvo: id, motivo, por })
      this.notificar(dono, 'removido-por-responsavel', { origem: null, objeto: id, comunidade: c.id })
      return {}
    }
    const at = this.bdAtualizacoes.get(id)
    if (at) {
      const p = this.bdPaginas.get(at.pagina)
      if (!p || p.encerrada) throw new ErroRede('nao-encontrado', 'página não encontrada')
      nega(podeNaPagina('remover-atualizacao-alheia', this.papelNaPagina(p, autor)))
      if (at.autor === autor) throw new ErroRede('sem-permissao', 'para o seu próprio conteúdo, apague')
      if (!at.removida) {
        at.removida = { por: 'dono', em: this.now() }
        this.reter(id, { texto: `${at.titulo ?? ''}\n${at.texto}`, tipo: 'pagina-publicar', autor: at.autor, porPapel: 'dono', comunidade: null, pagina: p.id })
        this.registrar({ escopo: 'pagina', contexto: p.id, acao: 'remocao', alvoTipo: 'pagina-publicar', alvo: id, motivo, por: 'dono' })
        this.notificar(at.autor, 'removido-por-responsavel', { origem: null, objeto: id, pagina: p.id })
      }
      return {}
    }
    throw new ErroRede(this.bdComunidades.has(id) || this.bdPaginas.has(id) ? 'sem-permissao' : 'nao-encontrado', 'não é possível remover isto por aqui')
  }

  protected removerPeloAutorSocial(autor: string, id: string): ResultadoDeAto {
    const so = (dono: string) => {
      if (dono !== autor) throw new ErroRede('sem-permissao', 'só quem escreveu apaga')
    }
    const rec = this.bdRecados.find((x) => x.id === id && !x.apagado)
    if (rec) {
      so(rec.autor)
      rec.apagado = true
      return {}
    }
    const dep = this.bdDepoimentos.find((x) => x.id === id && !x.apagado)
    if (dep) {
      so(dep.autor)
      dep.apagado = true
      return {}
    }
    const sl = this.bdSelos.find((x) => x.id === id && !x.apagado)
    if (sl) {
      so(sl.doador)
      sl.apagado = true
      return {}
    }
    const en = this.bdEntregas.find((x) => x.id === id && !x.apagado)
    if (en) {
      so(en.autor)
      en.apagado = true
      return {}
    }
    const t = this.bdTopicos.get(id)
    if (t && !t.apagado) {
      so(t.autor)
      t.apagado = true
      return {}
    }
    const r = this.bdRespostas.get(id)
    if (r && !r.apagada) {
      so(r.autor)
      r.apagada = true
      return {}
    }
    const at = this.bdAtualizacoes.get(id)
    if (at && !at.apagada) {
      so(at.autor)
      at.apagada = true
      return {}
    }
    const pg = this.bdPaginas.get(id)
    if (pg && !pg.encerrada) {
      so(pg.dono)
      pg.encerrada = true
      return {}
    }
    if (this.ganchos.removerPostagemAntiga(id, autor)) return {}
    throw new ErroRede('nao-encontrado', 'não encontrado')
  }

  protected decidirApelacao(autor: string, id: string, resultado: 'mantida' | 'revertida'): ResultadoDeAto {
    const a = this.apelacoes.find((x) => x.id === id)
    if (!a) throw new ErroRede('nao-encontrado', 'apelação não encontrada')
    const c = a.comunidade ? this.bdComunidades.get(a.comunidade) : undefined
    if (!c || quemDecideApelacao(a.agiuPor) !== 'dono' || c.dono !== autor) throw new ErroRede('sem-permissao', 'só o dono decide, e só quando quem agiu foi um moderador')
    if (a.situacao !== 'aberta') throw new ErroRede('ja-existe', 'a apelação já foi decidida')
    a.situacao = resultado
    if (resultado === 'revertida') {
      if (a.tipo === 'banimento') c.banidos = c.banidos.filter((b) => b.uid !== a.autor)
      else {
        const t = this.bdTopicos.get(a.alvo)
        const r = this.bdRespostas.get(a.alvo)
        if (t) t.removido = undefined
        if (r) r.removida = undefined
        this.retidos.delete(a.alvo)
      }
    }
    this.notificar(a.autor, 'apelacao-decidida', { origem: null, comunidade: c.id, objeto: a.tipo === 'remocao' ? a.alvo : null })
    return {}
  }

  /**
   * 0.3.1 (`denuncia-dispensar`): a moderação concluiu que não há o que fazer. As denúncias abertas daquele alvo, naquela comunidade, saem da fila;
   * o conteúdo continua visível e nada é apagado; quem já denunciou não denuncia de novo; uma denúncia nova, de outra pessoa, reabre o caso.
   * Entra no registro público com `acao: 'dispensa'` e o PAPEL de quem dispensou, nunca quem denunciou.
   */
  protected dispensarDenuncia(autor: string, comunidade: string, alvo: string): ResultadoDeAto {
    const c = this.bdComunidades.get(comunidade)
    if (!c || c.encerrada || !podeNaComunidade('ler', this.quem(c, autor), c.acesso).ok) throw new ErroRede('nao-encontrado', 'comunidade não encontrada')
    if (!this.ehEquipe(c, autor)) throw new ErroRede('sem-permissao', 'só o dono e a moderação dispensam denúncias')
    const t = this.bdTopicos.get(alvo)
    const r = this.bdRespostas.get(alvo)
    const tp = t ?? (r ? this.bdTopicos.get(r.topico) : undefined)
    const abertas = this.denuncias.filter((d) => d.alvo === alvo && d.dispensadaEm === undefined)
    if (!tp || tp.comunidade !== c.id || abertas.length === 0) throw new ErroRede('nao-encontrado', 'não há denúncia aberta para isto nesta comunidade')
    const agora = this.now()
    for (const d of abertas) d.dispensadaEm = agora
    this.registrar({ escopo: 'comunidade', contexto: c.id, acao: 'dispensa', alvoTipo: t ? 'topico' : 'resposta-forum', alvo, motivo: 'dispensada', por: this.papelRegistro(c, autor) })
    return {}
  }

  protected denunciarAto(autor: string, alvo: string, motivo: import('../tipos').MotivoDenunciaSocial): ResultadoDeAto {
    if (!(MOTIVOS_DENUNCIA_SOCIAL as readonly string[]).includes(motivo)) throw new ErroRede('invalido', 'motivo inválido')
    const quem = hash(`sal-social|${autor}`)
    const hoje = (this.denunciasPorQuem.get(quem) ?? []).filter((t) => this.now() - t < DIA)
    if (hoje.length >= 10) throw new ErroRede('limite', 'denúncias demais hoje')
    hoje.push(this.now())
    this.denunciasPorQuem.set(quem, hoje)
    if (this.ganchos.denunciarAntiga(alvo, motivo)) return {}
    // quem não podia ver o alvo (fechada de que não participa) tem a denúncia DESCARTADA, com a mesma resposta
    if (!this.existeEVisivel(alvo, autor)) return {}
    this.denuncias.push({ alvo, quem, motivo, em: this.now(), pesa: this.contaDias(autor) >= 7 })
    return {}
  }
  /** O id é de algum objeto social conhecido (visível ou não)? */
  conhece(id: string): boolean {
    return this.bdTopicos.has(id) || this.bdRespostas.has(id) || this.bdComunidades.has(id) || this.bdPaginas.has(id) || this.bdAtualizacoes.has(id) || this.bdRecados.some((x) => x.id === id) || this.bdEntregas.some((x) => x.id === id) || this.bdDepoimentos.some((x) => x.id === id)
  }
  protected existeEVisivel(id: string, leitor: string): boolean {
    const t = this.bdTopicos.get(id)
    const r = this.bdRespostas.get(id)
    if (t || r) {
      const tp = t ?? this.bdTopicos.get(r!.topico)
      const c = tp ? this.bdComunidades.get(tp.comunidade) : undefined
      return !!c && !c.encerrada && podeNaComunidade('ler', this.quem(c, leitor), c.acesso).ok
    }
    const c = this.bdComunidades.get(id)
    if (c) return !c.encerrada && podeNaComunidade('ler', this.quem(c, leitor), c.acesso).ok
    return this.bdPaginas.has(id) || this.bdAtualizacoes.has(id) || this.bdRecados.some((x) => x.id === id) || this.bdEntregas.some((x) => x.id === id) || this.bdDepoimentos.some((x) => x.id === id && x.estado === 'aceito')
  }

  // ---- reações nos objetos novos -----------------------------------------------------------------------------------

  /** Reage a um tópico, resposta de fórum ou atualização. Devolve falso se o id não é de nenhum deles. */
  reagirSocial(autor: string, id: string, reacao: TipoReacao): boolean {
    const t = this.bdTopicos.get(id)
    const r = this.bdRespostas.get(id)
    const at = this.bdAtualizacoes.get(id)
    const alvo = t ?? r ?? at
    if (!alvo) return false
    const reatores = alvo.reatores
    if (t || r) {
      const tp = t ?? this.bdTopicos.get(r!.topico)!
      const c = this.bdComunidades.get(tp.comunidade)
      if (!c || c.encerrada || !podeNaComunidade('ler', this.quem(c, autor), c.acesso).ok) throw new ErroRede('nao-encontrado', 'não encontrado')
      nega(podeNaComunidade('reagir', this.quem(c, autor), c.acesso))
      if (this.bloqueio(autor, (t ?? r!).autor)) throw new ErroRede('interacao-nao-permitida', 'não é possível interagir')
    }
    if (reatores.get(autor) === reacao) reatores.delete(autor)
    else reatores.set(autor, reacao)
    return true
  }

  // ---- criar os objetos de texto (depois da aprovação) -----------------------------------------------------------

  /** Cria o objeto que a aprovação liberou. Devolve o id. Cada tipo aplica as regras do protocolo. */
  criar(autor: string, tipo: TipoSocial, campos: Campos): string {
    const achados = analisarSocial({ tipo, campos, destino: null })
    if (bloqueiaSocial(achados.filter((a) => a.codigo !== 'sem-destino'))) throw new ErroRede('invalido', 'o objeto não passa nas regras de texto')
    const t = this.now()
    const id = this.novoId()
    switch (tipo) {
      case 'recado': {
        const alvo = str(campos.alvo)
        this.roverAlvo(alvo)
        nega(podeNoPerfil('recado', this.relacaoCom(autor, alvo)))
        const dia = this.bdRecados.filter((x) => x.alvo === alvo && t - x.em < DIA)
        if (dia.filter((x) => x.autor === autor).length >= 3) throw new ErroRede('limite', 'recados demais para este mural hoje')
        if (!this.ehAmigo(autor, alvo) && dia.filter((x) => !this.ehAmigo(x.autor, alvo)).length >= 30) throw new ErroRede('limite', 'o mural recebeu recados demais hoje')
        this.bdRecados.push({ id, autor, alvo, texto: str(campos.texto), em: t })
        this.notificar(alvo, 'recado', { origem: autor, objeto: id })
        this.notificarMencoes(str(campos.texto), autor, { objeto: id }, new Set([alvo]))
        return id
      }
      case 'depoimento': {
        const alvo = str(campos.alvo)
        this.roverAlvo(alvo)
        nega(podeNoPerfil('depoimento', this.relacaoCom(autor, alvo)))
        const doPar = this.bdDepoimentos.filter((d) => d.autor === autor && d.alvo === alvo && !d.apagado)
        const recusado = Math.max(0, ...doPar.filter((d) => d.estado === 'recusado').map((d) => d.recusadoEm ?? d.em))
        const v = podeEscreverOutro(doPar.map((d) => ({ estado: d.estado, criadoEm: iso(d.em) })), this.bdDepoimentos.filter((d) => d.alvo === alvo && d.estado === 'pendente' && !d.apagado).length, t, recusado || undefined)
        if (!v.ok) throw new ErroRede(v.motivo === 'espera' ? 'limite' : v.motivo, 'não pode escrever agora')
        this.bdDepoimentos.push({ id, autor, alvo, texto: str(campos.texto), estado: 'pendente', em: t })
        this.notificar(alvo, 'depoimento-para-aceitar', { origem: autor, objeto: id })
        return id
      }
      case 'entrega': {
        if (this.bdEntregas.filter((e) => e.autor === autor && !e.apagado).length >= 100) throw new ErroRede('limite-de-estrutura', 'entregas demais')
        this.bdEntregas.push({ id, autor, titulo: str(campos.titulo), descricao: str(campos.descricao), resultado: str(campos.resultado), tags: lista(campos.tags), em: t })
        return id
      }
      case 'comunidade-criar':
        return this.criarComunidade(autor, campos, id)
      case 'comunidade-atualizar':
        return this.atualizarComunidade(autor, campos)
      case 'comunidade-posse':
        return this.posse(autor, campos)
      case 'topico':
        return this.criarTopico(autor, campos, id)
      case 'topico-editar':
        return this.editarTopico(autor, campos)
      case 'resposta-forum':
        return this.criarResposta(autor, campos, id)
      case 'pagina-criar': {
        if (this.contaDias(autor) < 1) throw new ErroRede('conta-nova', 'a conta é nova demais')
        if ([...this.bdPaginas.values()].filter((p) => !p.encerrada && p.dono === autor).length >= 5) throw new ErroRede('limite-de-estrutura', 'páginas demais')
        const nome = str(campos.nome)
        if ([...this.bdPaginas.values()].some((p) => !p.encerrada && chaveNome(p.nome) === chaveNome(nome))) throw new ErroRede('ja-existe', 'o nome já existe')
        this.bdPaginas.set(id, { id, nome, descricao: str(campos.descricao), tema: str(campos.tema), dono: autor, admins: [autor], criadaEm: t, seguidores: new Map(), seguidoresExtras: 0 })
        return id
      }
      case 'pagina-atualizar': {
        const p = this.pag(str(campos.pagina))
        nega(podeNaPagina('atualizar', this.papelNaPagina(p, autor)))
        const nome = str(campos.nome)
        if ([...this.bdPaginas.values()].some((x) => x.id !== p.id && !x.encerrada && chaveNome(x.nome) === chaveNome(nome))) throw new ErroRede('ja-existe', 'o nome já existe')
        Object.assign(p, { nome, descricao: str(campos.descricao), tema: str(campos.tema) })
        return p.id
      }
      case 'pagina-publicar': {
        const p = this.pag(str(campos.pagina))
        nega(podeNaPagina('publicar', this.papelNaPagina(p, autor)))
        this.bdAtualizacoes.set(id, { id, pagina: p.id, autor, titulo: str(campos.titulo) || null, texto: str(campos.texto), tags: lista(campos.tags), em: t, reatores: new Map() })
        return id
      }
      case 'apelacao':
        return this.criarApelacao(autor, campos, id)
      case 'conversa-pedir':
      case 'mensagem':
        return this.criarDeMensagem(autor, tipo, campos, id)
    }
  }

  protected criarComunidade(autor: string, campos: Campos, id: string): string {
    if (this.contaDias(autor) < 1) throw new ErroRede('conta-nova', 'a conta é nova demais')
    if ([...this.bdComunidades.values()].filter((c) => !c.encerrada && c.dono === autor).length >= 10) throw new ErroRede('limite-de-estrutura', 'comunidades demais')
    const nome = str(campos.nome)
    const acesso = str(campos.acesso) as ComunidadeS['acesso']
    // a fechada não reserva nome (reservar vazaria que ela existe)
    if (acesso !== 'fechada' && [...this.bdComunidades.values()].some((c) => !c.encerrada && c.acesso !== 'fechada' && chaveNome(c.nome) === chaveNome(nome))) throw new ErroRede('ja-existe', 'o nome já existe')
    const t = this.now()
    this.bdComunidades.set(id, {
      id, nome, descricao: str(campos.descricao), regras: str(campos.regras), tema: str(campos.tema), acesso, categorias: lista(campos.categorias),
      dono: autor, criadaEm: t, membros: new Map([[autor, { papel: 'dono', desde: t }]]), pedidos: [], convites: [], banidos: [], entradas: [], membrosExtras: 0,
    })
    return id
  }

  protected atualizarComunidade(autor: string, campos: Campos): string {
    const c = this.com(str(campos.comunidade))
    const q = this.quem(c, autor)
    nega(podeNaComunidade('editar-dados', q, c.acesso))
    const acesso = str(campos.acesso) as ComunidadeS['acesso']
    if (acesso !== c.acesso) nega(podeNaComunidade('mudar-acesso', q, c.acesso))
    const nome = str(campos.nome)
    if (acesso !== 'fechada' && [...this.bdComunidades.values()].some((x) => x.id !== c.id && !x.encerrada && x.acesso !== 'fechada' && chaveNome(x.nome) === chaveNome(nome))) throw new ErroRede('ja-existe', 'o nome já existe')
    // tópicos de categorias que saíram da lista mantêm a categoria que tinham
    Object.assign(c, { nome, descricao: str(campos.descricao), regras: str(campos.regras), tema: str(campos.tema), acesso, categorias: lista(campos.categorias) })
    return c.id
  }

  protected posse(autor: string, campos: Campos): string {
    const c = this.com(str(campos.comunidade))
    nega(podeNaComunidade('transferir', this.quem(c, autor), c.acesso))
    if (campos.acao === 'encerrar') {
      c.encerrada = true
      return c.id
    }
    const novo = str(campos.novoDono)
    const m = c.membros.get(novo)
    if (!m) throw new ErroRede('nao-e-membro', 'o novo dono precisa ser membro')
    m.papel = 'dono'
    c.dono = novo
    const antigo = c.membros.get(autor)!
    antigo.papel = [...c.membros.values()].filter((x) => x.papel === 'moderador').length < 10 ? 'moderador' : 'membro'
    this.notificar(novo, 'posse-recebida', { origem: autor, comunidade: c.id })
    return c.id
  }

  protected criarTopico(autor: string, campos: Campos, id: string): string {
    const c = this.com(str(campos.comunidade))
    const q = this.quem(c, autor)
    if (!podeNaComunidade('ler', q, c.acesso).ok) throw new ErroRede('nao-encontrado', 'comunidade não encontrada')
    nega(podeNaComunidade('postar-topico', q, c.acesso))
    const categoria = campos.categoria === null || campos.categoria === undefined || campos.categoria === '' ? null : str(campos.categoria)
    if (categoria !== null && !c.categorias.includes(categoria)) throw new ErroRede('invalido', 'a categoria não existe')
    const opcoes = lista(campos.enquete)
    const t = this.now()
    const dias = Number(str(campos.enqueteDias) || '7')
    const texto = str(campos.texto)
    const titulo = str(campos.titulo)
    const tags = lista(campos.tags)
    this.bdTopicos.set(id, {
      id, comunidade: c.id, categoria, autor, em: t, titulo, texto, tags, fixado: false, trancado: false,
      enquete: opcoes.length >= 2 ? { opcoes, encerraEm: t + dias * DIA, votos: opcoes.map(() => 0), votantes: new Map() } : null,
      resolvidoPor: null, versoes: [{ versao: 1, titulo, texto, tags: [...tags], em: t }], reatores: new Map(),
    })
    this.notificarMencoes(`${titulo}\n${texto}`, autor, { objeto: id, comunidade: c.id }, new Set())
    return id
  }

  protected editarTopico(autor: string, campos: Campos): string {
    const { t } = this.topicoDe(str(campos.topico), autor)
    nega(podeEditarTopico({ meuTopico: t.autor === autor, criadoEmMs: t.em, agoraMs: this.now(), edicoes: t.versoes.length - 1, trancado: t.trancado }))
    const titulo = str(campos.titulo)
    const texto = str(campos.texto)
    const tags = lista(campos.tags)
    t.versoes.push({ versao: t.versoes.length + 1, titulo, texto, tags: [...tags], em: this.now() })
    Object.assign(t, { titulo, texto, tags })
    return t.id
  }

  protected criarResposta(autor: string, campos: Campos, id: string): string {
    const { t, c } = this.topicoDe(str(campos.topico), autor)
    if (t.removido) throw new ErroRede('removido', 'tópico escondido')
    const q = this.quem(c, autor)
    nega(podeNaComunidade('responder', q, c.acesso))
    const equipe = q.papel === 'dono' || q.papel === 'moderador'
    if (t.trancado && !equipe) throw new ErroRede('trancado', 'o tópico está trancado')
    const vivas = this.respostasVivas(t.id)
    const em = campos.em ? str(campos.em) : null
    const cita = campos.cita ? str(campos.cita) : null
    let mae: RespostaS | undefined
    if (em) {
      mae = this.bdRespostas.get(em)
      if (!mae || mae.topico !== t.id || mae.removida || mae.apagada) throw new ErroRede('nao-encontrado', 'resposta não encontrada')
      if (mae.paiId !== null) throw new ErroRede('resposta-funda', 'responda à mãe e cite esta')
    }
    let citada: RespostaS | undefined
    if (cita) {
      citada = this.bdRespostas.get(cita)
      if (!citada || citada.topico !== t.id || citada.removida || citada.apagada) throw new ErroRede('nao-encontrado', 'resposta citada não encontrada')
    }
    for (const outro of [mae?.autor, citada?.autor]) if (outro && this.bloqueio(autor, outro)) throw new ErroRede('interacao-nao-permitida', 'não é possível interagir')
    if (this.contaDias(autor) < 1 && vivas.filter((r) => r.autor === autor && this.now() - r.em < HORA).length >= 10) throw new ErroRede('limite', 'respostas demais por hora')
    const texto = str(campos.texto)
    this.bdRespostas.set(id, { id, topico: t.id, autor, texto, em: this.now(), paiId: em, cita, reatores: new Map() })
    // no máximo UMA notificação por pessoa, a de maior prioridade
    const feitos = new Set<string>([autor])
    const dar = (u: string | undefined, tipo: TipoDeNotificacao) => {
      if (!u || feitos.has(u)) return
      feitos.add(u)
      this.notificar(u, tipo, { origem: autor, objeto: id, comunidade: c.id })
    }
    dar(t.autor, 'resposta-no-topico')
    dar(mae?.autor, 'resposta-a-voce')
    dar(citada?.autor, 'citacao')
    this.notificarMencoes(texto, autor, { objeto: id, comunidade: c.id }, feitos)
    return id
  }

  protected criarApelacao(autor: string, campos: Campos, id: string): string {
    const tipo = str(campos.tipo) as 'remocao' | 'banimento'
    const alvo = str(campos.alvo)
    const t = this.now()
    if (this.apelacoes.some((a) => a.autor === autor && a.alvo === alvo)) throw new ErroRede('ja-existe', 'já apelou deste caso')
    if (tipo === 'remocao') {
      const ret = this.retidos.get(alvo)
      if (!ret || ret.autor !== autor) throw new ErroRede('nao-encontrado', 'conteúdo não encontrado')
      if (!ret.comunidade && !ret.pagina) throw new ErroRede('sem-permissao', 'remoção em mural não tem apelação')
      if (!podeApelar(iso(ret.removidoEm), this.agora())) throw new ErroRede('fora-da-janela', 'passaram mais de 14 dias')
      this.apelacoes.push({ id, tipo, alvo, autor, texto: str(campos.texto), em: t, comunidade: ret.comunidade, pagina: ret.pagina, agiuPor: ret.porPapel, situacao: 'aberta' })
      const reg = this.registro.find((r) => r.alvo === alvo && r.acao === 'remocao')
      if (reg) reg.apelacaoId = id
      const c = ret.comunidade ? this.bdComunidades.get(ret.comunidade) : undefined
      if (c && quemDecideApelacao(ret.porPapel) === 'dono') this.notificar(c.dono, 'apelacao-recebida', { origem: autor, comunidade: c.id })
      return id
    }
    const c = this.com(alvo)
    const b = c.banidos.find((x) => x.uid === autor)
    if (!b) throw new ErroRede('sem-permissao', 'só quem foi banido apela do banimento')
    if (!podeApelar(iso(b.em), this.agora())) throw new ErroRede('fora-da-janela', 'passaram mais de 14 dias')
    this.apelacoes.push({ id, tipo, alvo, autor, texto: str(campos.texto), em: t, comunidade: c.id, pagina: null, agiuPor: b.por, situacao: 'aberta' })
    b.apelacao = id
    const reg = this.registro.find((r) => r.contexto === c.id && r.acao === 'banimento' && r.alvo === autor)
    if (reg) reg.apelacaoId = id
    if (quemDecideApelacao(b.por) === 'dono') this.notificar(c.dono, 'apelacao-recebida', { origem: autor, comunidade: c.id })
    return id
  }

  // ---- a fila de rascunhos da Lumi -----------------------------------------------------------------------------------

  async propor(tipo: TipoSocial, campos: Campos, destino: DestinoDoRascunho | null): Promise<RascunhoSocial> {
    for (const c of ESQUEMA_SOCIAL[tipo]) if (!(c.nome in campos)) campos = { ...campos, [c.nome]: null }
    const r: RascunhoSocial = { id: this.novoRascunhoId(), tipo, rover: this.resumo(this.eu), campos, destino, criadoEm: iso(this.now()), versao: 1, estado: 'pendente' }
    this.rascunhos.push(r)
    return structuredClone(r)
  }
  async rascunhosSociais(): Promise<RascunhoSocial[]> {
    return structuredClone(this.rascunhos.filter((r) => r.estado === 'pendente'))
  }
  async rascunhoSocial(id: string): Promise<RascunhoSocial | null> {
    const r = this.rascunhos.find((x) => x.id === id)
    return r ? structuredClone(r) : null
  }
  protected achar(id: string): number {
    const i = this.rascunhos.findIndex((x) => x.id === id)
    if (i < 0) throw new ErroRede('nao-encontrado', 'rascunho não encontrado')
    return i
  }
  async editarSocial(id: string, campos: Campos): Promise<RascunhoSocial> {
    const i = this.achar(id)
    this.rascunhos[i] = editarPuro(this.rascunhos[i], campos)
    return structuredClone(this.rascunhos[i])
  }
  async recusarSocial(id: string): Promise<RascunhoSocial> {
    const i = this.achar(id)
    this.rascunhos[i] = recusarPuro(this.rascunhos[i], this.agora())
    return structuredClone(this.rascunhos[i])
  }
  async aprovarSocial(id: string, versaoVista: number): Promise<ResultadoAprovacaoSocial & { objetoId?: string }> {
    const i = this.achar(id)
    const res = aprovarPuro(this.rascunhos[i], versaoVista, this.agora())
    if (!res.ok) return res
    // se o relé recusar (conta nova, limite, bloqueio...), o erro sobe e o rascunho CONTINUA pendente
    const objetoId = this.criar(this.eu, res.objeto.tipo, res.objeto.campos)
    this.rascunhos[i] = res.rascunho
    return { ...res, objetoId }
  }
}
