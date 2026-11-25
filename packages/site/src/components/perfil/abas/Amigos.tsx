import Link from 'next/link'
import EstadoVazio from '@/components/EstadoVazio'
import CartaoRover from '@/components/social/CartaoRover'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import { fmt, plural } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import { rostoPorUid } from '@/lib/dominio/expressao'
import GradeAmigos from '../GradeAmigos'
import type { ContextoAba } from './contexto'

export default async function Amigos({ rover, pag, eu, d, lang }: ContextoAba) {
  const t = d.socPerfil.amigos
  const { cliente } = obterRede()
  const proprio = pag.voce?.papel === 'proprio'
  const [lista, comum] = await Promise.all([
    carregar(() => cliente.amigos(rover.uid)),
    !proprio && eu ? carregar(() => cliente.amigosEmComum(rover.uid, eu.uid)) : Promise.resolve(null),
  ])
  if (!lista.ok && lista.codigo === 'grafo-privado') {
    return (
      <section className="pf-aba" aria-labelledby="pf-ami-t">
        <h2 id="pf-ami-t" className="so-leitor">{t.titulo}</h2>
        <EstadoVazio titulo={fmt(t.privadoTitulo, { nome: rover.nome })} texto={t.privadoTexto} ficha={rostoPorUid(rover.uid)} estado="parado" altura={130} />
      </section>
    )
  }
  if (!lista.ok) return <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} />
  const n = pag.contagens.amigos
  return (
    <section className="pf-aba" aria-labelledby="pf-ami-t">
      <div className="cabeca-secao">
        <h2 id="pf-ami-t">{n === null ? t.titulo : plural(t.contagem, n)}</h2>
        {proprio && (
          <Link href={`/${lang}/amigos`}>{t.ver}</Link>
        )}
      </div>
      {comum?.ok && comum.valor.itens.length > 0 && (
        <div className="pf-em-comum">
          <h3 className="sobrelinha">{t.emComum}</h3>
          <ul>
            {comum.valor.itens.map((r) => (
              <li key={r.uid}>
                <CartaoRover rover={r} lang={lang} tamanho={36} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {lista.valor.itens.length > 0 ? (
        <GradeAmigos inicial={lista.valor} roverUid={rover.uid} d={d} lang={lang} />
      ) : (
        <EstadoVazio titulo={t.vazioTitulo} texto={fmt(t.vazioTexto, { nome: rover.nome })} ficha={rover.rosto} estado="dormir" altura={130} />
      )}
    </section>
  )
}
