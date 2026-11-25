import Link from 'next/link'
import { dataCurta, plural, type Dicionario, type Pronto } from '@/lib/i18n'
import { podeNaComunidade } from '@/lib/dominio/permissoes'
import { quemDe } from '@/lib/comunidades/dados'
import { matizDe } from '@/lib/social/matiz'
import type { Comunidade, ComunidadeMinima } from '@/lib/social/tipos'
import Foto from '@/components/folgali/Foto'
import { capaDoTema } from '@/lib/folgali/demo'
import AcoesDeEntrada from './AcoesDeEntrada'
import { PilulaAcesso } from './CartaoComunidade'

export type Aba = 'conversas' | 'membros' | 'sobre' | 'registro' | 'moderacao' | 'gerir'

/** O alto de toda página de comunidade: o remendo, o nome, quem cuida, os botões de participação e as abas. */
export default function CabecalhoComunidade({ c, d, lang, aba }: { c: Comunidade | ComunidadeMinima; d: Dicionario; lang: Pronto; aba?: Aba }) {
  const t = d.socComunidades
  const completa = 'regras' in c
  const quem = quemDe(c.voce)
  const equipe = podeNaComunidade('ver-moderacao', quem, c.acesso).ok
  const base = `/${lang}/comunidades/${c.id}`
  const abas: { id: Aba; href: string; texto: string }[] = [
    { id: 'conversas', href: base, texto: t.pagina.abas.conversas },
    { id: 'membros', href: `${base}/membros`, texto: t.pagina.abas.membros },
    { id: 'sobre', href: `${base}/sobre`, texto: t.pagina.abas.sobre },
    { id: 'registro', href: `${base}/registro`, texto: t.pagina.abas.registro },
    ...(equipe ? [{ id: 'moderacao' as Aba, href: `${base}/moderacao`, texto: t.pagina.abas.moderacao }, { id: 'gerir' as Aba, href: `${base}/gerir`, texto: t.pagina.abas.gerir }] : []),
  ]
  return (
    <header className="com-cab" style={{ ['--h' as string]: matizDe(c.nome) }}>
      <div className="com-cab-faixa" aria-hidden>
        <Foto foto={capaDoTema(completa ? c.tema : undefined, c.id)} alt="" prioridade />
      </div>
      <div className="com-cab-corpo">
        <div className="com-cab-nome">
          <p className="sobrelinha">
            <Link href={`/${lang}/comunidades`}>{t.titulo}</Link>
          </p>
          <h1>{c.nome}</h1>
          <div className="linha-flex">
            <PilulaAcesso acesso={c.acesso} d={d} />
            {completa && <span className="miudo">#{c.tema}</span>}
            {completa && <span className="miudo">{plural(d.socComunidades.cartao.membros, c.membros)}</span>}
            {c.voce?.papel && <span className="pilula" data-tom="acao">{t.entrada.voceE.replace('{papel}', d.socComum.papeis[c.voce.papel].toLowerCase())}</span>}
          </div>
        </div>
        <div className="com-cab-resto">
          {c.descricao && <p className="com-cab-desc">{c.descricao}</p>}
          {completa && <p className="miudo">{t.pagina.criadaEm.replace('{data}', dataCurta(c.criadaEm, lang))}</p>}
          {c.voce && (
            <div className="com-cab-acoes">
              <AcoesDeEntrada id={c.id} acesso={c.acesso} voce={c.voce} d={d} />
            </div>
          )}
        </div>
      </div>
      {completa && (
        <nav className="sub-nav com-abas" aria-label={t.pagina.navegacao}>
          {abas.map((a) => (
            <Link key={a.id} href={a.href} aria-current={aba === a.id ? 'page' : undefined}>
              {a.texto}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}
