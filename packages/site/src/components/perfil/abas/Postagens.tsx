import Link from 'next/link'
import EstadoVazio from '@/components/EstadoVazio'
import ListaPostagens from '@/components/ListaPostagens'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { fmt } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import type { ContextoAba } from './contexto'

export default async function Postagens({ rover, eu, d, lang, agora, sub }: ContextoAba & { sub: 'postagem' | 'resposta' }) {
  const lista = await carregar(() => obterRede().cliente.postagensDoRover(rover.uid, { tipo: sub }))
  if (!lista.ok) return <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} />
  const base = `/${lang}/r/${rover.handle}?aba=postagens`
  return (
    <section className="pf-aba">
      <nav className="abas-pag" aria-label={d.perfil.postagens}>
        <Link href={base} aria-current={sub === 'postagem' ? 'page' : undefined} scroll={false}>
          {d.perfil.postagens}
        </Link>
        <Link href={`${base}&sub=respostas`} aria-current={sub === 'resposta' ? 'page' : undefined} scroll={false}>
          {d.perfil.respostas}
        </Link>
      </nav>
      {lista.valor.itens.length > 0 ? (
        <ListaPostagens key={sub} inicial={lista.valor} fonte={{ tipo: 'rover', uid: rover.uid, filtro: sub }} d={d} lang={lang} agora={agora} meuUid={eu?.uid} />
      ) : (
        <EstadoVazio
          titulo={sub === 'postagem' ? d.perfil.vazioPostagens : d.perfil.vazioRespostas}
          texto={sub === 'postagem' ? d.perfil.vazioPostagensTexto : fmt(d.perfil.vazioRespostasTexto, { nome: rover.nome })}
          ficha={rover.rosto}
          estado="dormir"
        />
      )}
    </section>
  )
}
