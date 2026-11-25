'use client'

import Link from 'next/link'
import { useId, useMemo, useState, useTransition } from 'react'
import { proporAcao } from '@/app/acoes-sociais'
import { IcCadeado, IcCheck } from '@/components/Icones'
import { ESQUEMA_SOCIAL, analisarSocial, bloqueiaSocial, type AchadoSocial, type Campos, type CampoSocial, type DestinoDoRascunho, type RascunhoSocial, type TipoSocial, type ValorCampo } from '@/lib/dominio/aprovacao-social'
import { filtrarInvisiveis } from '@/lib/dominio/invisivel'
import { contar, normalizar } from '@/lib/dominio/limites'
import { fmt, type Dicionario } from '@/lib/i18n-base'

type Props = {
  tipo: TipoSocial
  d: Dicionario
  lang: string
  /** valores já preenchidos (por exemplo, o alvo e o tópico a que se responde) */
  campos: Campos
  /** onde vai, em palavras: "mural de @pipa" */
  destino: DestinoDoRascunho | null
  /** a pessoa tem o app pareado? Sem ele, o formulário é só leitura e explica por quê */
  podeEscrever: boolean
  /** o nome do rover que "escreve" */
  nomeDoRover?: string
  /** campos de referência a esconder (já ditos no destino) */
  ocultar?: string[]
  /** rótulo do botão */
  enviar?: string
  /** quando preenchido, o formulário é mais compacto (recado no mural, resposta no fio) */
  compacto?: boolean
  placeholder?: string
  onEnviado?: (r: RascunhoSocial) => void
  /** liga a opção "escrever outro" depois de enviar */
  reiniciavel?: boolean
  /** campos de linha que viram lista de escolha (por exemplo, a categoria de um tópico): nome do campo e as opções */
  escolhas?: Record<string, string[]>
  /** texto da opção vazia de uma escolha */
  escolhaVazia?: string
}

const ROTULO_ENQUETE = 'enqueteDias'

function paraTexto(v: ValorCampo | undefined, c: CampoSocial): string {
  if (Array.isArray(v)) return v.join(c.tipo === 'tags' ? ', ' : '\n')
  return v ?? ''
}
function deTexto(s: string, c: CampoSocial): ValorCampo {
  if (c.tipo === 'tags') return s.split(/[,\s]+/).map((x) => x.trim().replace(/^#/, '').toLowerCase()).filter(Boolean)
  if (c.tipo === 'lista') return s.split('\n').map((x) => x.trim()).filter(Boolean)
  return s
}

/**
 * Formulário de proposta: a web "escreve" pedindo ao rover, que publica sozinho na próxima folga (o protocolo ainda guarda
 * o pedido como rascunho até o app assinar, com a autorização permanente). Todo
 * campo do esquema aparece com o seu contador e o seu limite; o que o protocolo recusaria é avisado
 * enquanto a pessoa digita. Nada sai daqui: o envio cria um RASCUNHO.
 */
export default function FormProposta({ tipo, d, lang, campos: iniciais, destino, podeEscrever, nomeDoRover, ocultar = [], enviar, compacto = false, placeholder, onEnviado, reiniciavel = true, escolhas, escolhaVazia = '' }: Props) {
  const id = useId()
  const esquema = ESQUEMA_SOCIAL[tipo]
  const [valores, setValores] = useState<Campos>(iniciais)
  // erro de campo só aparece depois que a pessoa mexeu nele: formulário vazio não nasce gritando
  const [tocados, setTocados] = useState<Set<string>>(new Set())
  const tocar = (nome: string) => setTocados((t) => (t.has(nome) ? t : new Set(t).add(nome)))
  const [feito, setFeito] = useState<RascunhoSocial | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const achados = useMemo(() => analisarSocial({ tipo, campos: valores, destino }), [tipo, valores, destino])
  const porCampo = (nome: string) => (tocados.has(nome) ? achados.filter((a) => a.campo === nome) : [])
  const geral = achados.filter((a) => !a.campo)
  const travado = bloqueiaSocial(achados)
  const vazioObrigatorio = esquema.some((c) => c.obrigatorio && c.tipo !== 'ref' && (valores[c.nome] === null || valores[c.nome] === undefined || (typeof valores[c.nome] === 'string' && normalizar(filtrarInvisiveis(valores[c.nome] as string).texto) === '')))

  const texto = (a: AchadoSocial) => fmt(d.socComum.achados[a.codigo], { n: a.quantidade ?? 0 })

  function mandar(e: React.FormEvent) {
    e.preventDefault()
    if (travado || vazioObrigatorio || !podeEscrever) return
    setErro(null)
    iniciar(async () => {
      const r = await proporAcao(tipo, valores, destino)
      if (r.ok) {
        setFeito(r.rascunho)
        onEnviado?.(r.rascunho)
      } else setErro(r.codigo === 'campos' ? d.socComum.ato.erro.invalido : d.socComum.ato.erro[r.codigo])
    })
  }

  if (feito) {
    return (
      <section className="proposta-feita painel" aria-live="polite">
        <span className="proposta-selo" aria-hidden>
          <IcCheck />
        </span>
        <h3>{d.socComum.proposta.titulo}</h3>
        <p>{fmt(d.socComum.proposta.texto, { nome: nomeDoRover ?? feito.rover.nome })}</p>
        <div className="proposta-botoes">
          <Link href={`/${lang}/inicio`} className="btn btn-prim btn-peq">
            {d.socComum.proposta.verFila}
          </Link>
          {reiniciavel && (
            <button
              type="button"
              className="btn btn-sec btn-peq"
              onClick={() => {
                setFeito(null)
                setValores(iniciais)
                setTocados(new Set())
              }}
            >
              {d.socComum.proposta.outro}
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <form className={`form-proposta${compacto ? ' compacto' : ''}`} onSubmit={mandar} noValidate>
      {destino && (
        <p className="form-destino">
          <span className="sobrelinha">{d.socComum.campos.alvo}</span> {destino.rotulo}
        </p>
      )}
      {esquema.map((c) => {
        if (c.tipo === 'ref' || ocultar.includes(c.nome)) return null
        const v = valores[c.nome]
        const fid = `${id}-${c.nome}`
        const rotulo = (d.socComum.campos as Record<string, string>)[c.nome] ?? c.nome
        const ajuda = (d.socComum.ajuda as Record<string, string>)[c.nome]
        const ach = porCampo(c.nome)
        const n = typeof v === 'string' ? contar(normalizar(filtrarInvisiveis(v).texto)) : 0
        const desc = `${fid}-ajuda${ach.length ? ` ${fid}-erro` : ''}`
        return (
          <div className="campo" key={c.nome}>
            <label htmlFor={fid}>
              {rotulo}
              {!c.obrigatorio && <span className="opcional"> ({d.socComum.proposta.opcional})</span>}
            </label>
            {escolhas?.[c.nome] ? (
              <select id={fid} value={(v as string) ?? ''} disabled={!podeEscrever} onChange={(e) => { tocar(c.nome); setValores({ ...valores, [c.nome]: e.target.value === '' ? null : e.target.value }) }}>
                <option value="">{escolhaVazia}</option>
                {escolhas[c.nome].map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : c.tipo === 'escolha' ? (
              <select id={fid} value={(v as string) ?? ''} disabled={!podeEscrever} onChange={(e) => { tocar(c.nome); setValores({ ...valores, [c.nome]: e.target.value }) }}>
                {(c.opcoes ?? []).map((o) => (
                  <option key={o} value={o}>
                    {c.nome === ROTULO_ENQUETE ? d.socComum.enqueteDias[o as keyof typeof d.socComum.enqueteDias] : ((d.socComum.valores as Record<string, Record<string, string>>)[c.nome]?.[o] ?? o)}
                  </option>
                ))}
              </select>
            ) : c.tipo === 'multilinha' || c.tipo === 'lista' ? (
              <textarea
                id={fid}
                rows={c.tipo === 'lista' ? 3 : compacto ? 3 : c.max > 800 ? 7 : 4}
                value={paraTexto(v, c)}
                placeholder={c.nome === 'texto' ? placeholder : undefined}
                disabled={!podeEscrever}
                aria-describedby={desc}
                aria-invalid={ach.some((a) => a.gravidade === 'bloqueia')}
                onChange={(e) => { tocar(c.nome); setValores({ ...valores, [c.nome]: deTexto(e.target.value, c) }) }}
              />
            ) : (
              <input
                id={fid}
                type="text"
                value={paraTexto(v, c)}
                disabled={!podeEscrever}
                aria-describedby={desc}
                aria-invalid={ach.some((a) => a.gravidade === 'bloqueia')}
                onChange={(e) => { tocar(c.nome); setValores({ ...valores, [c.nome]: deTexto(e.target.value, c) }) }}
              />
            )}
            <div className="campo-pe">
              <span id={`${fid}-ajuda`} className="ajuda">
                {ajuda ?? ''}
              </span>
              {(c.tipo === 'linha' || c.tipo === 'multilinha') && (
                <span className="contador" data-estouro={n > c.max} aria-live="off">
                  {fmt(d.socComum.proposta.contador, { n, max: c.max })}
                </span>
              )}
            </div>
            {ach.length > 0 && (
              <ul id={`${fid}-erro`} className="erros-campo">
                {ach.map((a, i) => (
                  <li key={i} className={a.gravidade === 'bloqueia' ? 'erro-campo' : 'aviso-campo'} role={a.gravidade === 'bloqueia' ? 'alert' : undefined}>
                    {texto(a)}
                    {a.trecho ? <code> {a.trecho}</code> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {geral.length > 0 && (
        <ul className="erros-campo">
          {geral.map((a, i) => (
            <li key={i} className="erro-campo" role="alert">
              {texto(a)}
            </li>
          ))}
        </ul>
      )}
      <p className="nota-proposta">
        <IcCadeado width={18} height={18} /> <span>{podeEscrever ? d.socComum.proposta.notaAprovacao : d.socComum.proposta.semRover}</span>
      </p>
      {erro && (
        <p className="erro-campo" role="alert">
          {erro}
        </p>
      )}
      <div className="form-botoes">
        <button type="submit" className="btn btn-prim" disabled={!podeEscrever || pendente || travado || vazioObrigatorio}>
          {pendente ? d.socComum.proposta.enviando : (enviar ?? d.socComum.proposta.enviar)}
        </button>
      </div>
    </form>
  )
}
