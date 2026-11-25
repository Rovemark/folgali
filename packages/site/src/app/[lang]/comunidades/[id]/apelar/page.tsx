import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import CabecalhoComunidade from '@/components/comunidades/CabecalhoComunidade'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import FormProposta from '@/components/social/FormProposta'
import { ehCompleta, ID_OK, lerComunidade, quemSou } from '@/lib/comunidades/dados'
import { diasRestantesParaApelar, podeApelar } from '@/lib/dominio/moderacao'
import { dict, ehPronto, fmt, plural } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }>; searchParams: Promise<{ alvo?: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/comunidades/${id}/apelar`, dict(ehPronto(lang) ? lang : 'pt').socComunidades.apelar.titulo)
}

export default async function Apelar({ params, searchParams }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const { alvo } = await searchParams
  const d = dict(lang)
  const t = d.socComunidades.apelar
  const c = ID_OK.test(id) ? await lerComunidade(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <EstadoDeErro codigo={c.codigo} d={d} lang={lang} />
  const com = c.valor
  if (!ehCompleta(com)) return <CabecalhoComunidade c={com} d={d} lang={lang} />
  const eu = await quemSou()
  const ehRemocao = !!alvo && ID_OK.test(alvo)
  const banido = com.voce?.banido ?? false
  if (!banido && !ehRemocao) return <EstadoDeErro codigo="sem-permissao" d={d} lang={lang} />

  // a data do banimento sai do registro público (o banido o lê, a comunidade sendo aberta)
  // (relé 0.3.1 manda a data em `voce.banidoEm`; só sem ela se olha o registro)
  const registro = banido && eu && !com.voce?.banidoEm ? await carregar(() => obterRede().cliente.registroDaComunidade(id)) : null
  const quando = com.voce?.banidoEm ?? (registro?.ok ? (registro.valor.itens.find((r) => r.acao === 'banimento' && typeof r.alvo === 'object' && r.alvo.uid === eu?.uid)?.em ?? null) : null)
  const agora = new Date()
  const dentro = quando ? podeApelar(quando, agora) : true
  return (
    <>
      <CabecalhoComunidade c={com} d={d} lang={lang} />
      <div className="titulo-pag">
        <p className="sobrelinha">
          <Link href={`/${lang}/comunidades/${id}`}>{d.socForum.topico.voltar}</Link>
        </p>
        <h2 style={{ fontSize: 28 }}>{t.titulo}</h2>
        <p>{t.sub}</p>
      </div>
      <div className="pilha">
        <p className="nota-proposta">
          <span>{t.quemDecide}</span>
        </p>
        {quando && <p className={dentro ? 'miudo' : 'erro-campo'}>{dentro ? plural(t.janela, diasRestantesParaApelar(quando, agora)) : t.expirou}</p>}
        {dentro && (
          <section className="cartao">
            <FormProposta
              tipo="apelacao"
              d={d}
              lang={lang}
              podeEscrever={eu !== null}
              nomeDoRover={eu?.nome}
              destino={{ rotulo: fmt(banido ? t.contexto : t.contextoRemocao, { nome: com.nome }) }}
              ocultar={['tipo', 'alvo']}
              enviar={t.titulo}
              campos={{ tipo: banido ? 'banimento' : 'remocao', alvo: banido ? id : alvo!, texto: '' }}
            />
          </section>
        )}
      </div>
    </>
  )
}
