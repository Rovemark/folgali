import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import EstadoVazio from '@/components/EstadoVazio'
import CabecalhoComunidade from '@/components/comunidades/CabecalhoComunidade'
import PosseForm from '@/components/comunidades/PosseForm'
import { IcAlerta } from '@/components/Icones'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import FormProposta from '@/components/social/FormProposta'
import { ehCompleta, ID_OK, lerComunidade, quemDe, quemSou } from '@/lib/comunidades/dados'
import { rostoPorUid } from '@/lib/dominio/expressao'
import { podeNaComunidade } from '@/lib/dominio/permissoes'
import { dict, ehPronto } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { metaTela } from '@/lib/seo/meta-telas'

type P = { params: Promise<{ lang: string; id: string }> }

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, id } = await params
  return metaTela(lang, `/comunidades/${id}/gerir`, dict(ehPronto(lang) ? lang : 'pt').socComunidades.gerir.titulo)
}

export default async function Gerir({ params }: P) {
  const { lang, id } = await params
  if (!ehPronto(lang)) notFound()
  const d = dict(lang)
  const t = d.socComunidades.gerir
  const c = ID_OK.test(id) ? await lerComunidade(id) : ({ ok: false, codigo: 'nao-encontrado' } as const)
  if (!c.ok) return <EstadoDeErro codigo={c.codigo} d={d} lang={lang} />
  const com = c.valor
  if (!ehCompleta(com)) return <CabecalhoComunidade c={com} d={d} lang={lang} />
  const quem = quemDe(com.voce)
  if (!podeNaComunidade('editar-dados', quem, com.acesso).ok) {
    return (
      <>
        <CabecalhoComunidade c={com} d={d} lang={lang} aba="gerir" />
        <EstadoVazio titulo={d.socModeracao.soEquipe.titulo} texto={t.soEquipe} ficha={rostoPorUid('rvr_gerir_so_equipe_0000')} estado="parado" erro />
      </>
    )
  }
  const eu = await quemSou()
  const dono = podeNaComunidade('transferir', quem, com.acesso).ok
  const membros = dono ? await carregar(() => obterRede().cliente.membros(id)) : null
  const candidatos = membros?.ok ? membros.valor.itens.filter((m) => m.papel !== 'dono' && m.rover.uid !== eu?.uid).map((m) => m.rover) : []
  return (
    <>
      <CabecalhoComunidade c={com} d={d} lang={lang} aba="gerir" />
      <div className="pilha-g">
        <div>
          <h2>{t.titulo}</h2>
          <p className="suave">{t.sub}</p>
        </div>
        <section className="cartao" aria-labelledby="ed-t">
          <h3 id="ed-t">{t.editar}</h3>
          <p className="suave">{t.editarTexto}</p>
          {com.acesso === 'fechada' && (
            <p className="aviso-comunidade" role="note">
              <IcAlerta />
              <span>{t.fechadaAbre}</span>
            </p>
          )}
          {!dono && <p className="miudo">{t.acessoSoDono}</p>}
          <FormProposta
            tipo="comunidade-atualizar"
            d={d}
            lang={lang}
            podeEscrever={eu !== null}
            nomeDoRover={eu?.nome}
            destino={{ rotulo: com.nome, href: `/${lang}/comunidades/${id}` }}
            ocultar={dono ? ['comunidade'] : ['comunidade', 'acesso']}
            campos={{ comunidade: id, nome: com.nome, descricao: com.descricao, regras: com.regras, tema: com.tema, acesso: com.acesso, categorias: com.categorias }}
          />
        </section>
        {dono && eu && (
          <section aria-labelledby="posse-t" className="pilha">
            <div>
              <h3 id="posse-t">{t.posse}</h3>
              <p className="suave">{t.posseTexto}</p>
            </div>
            <PosseForm comunidade={id} nomeDaComunidade={com.nome} membros={candidatos} d={d} lang={lang} nomeDoRover={eu.nome} />
          </section>
        )}
      </div>
    </>
  )
}
