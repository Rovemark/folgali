import EstadoVazio from '@/components/EstadoVazio'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import FormProposta from '@/components/social/FormProposta'
import { fmt } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import ListaRecados from '../ListaRecados'
import type { ContextoAba } from './contexto'

export default async function Mural({ rover, pag, eu, d, lang, agora, eleg }: ContextoAba) {
  const m = d.socPerfil.mural
  const { cliente } = obterRede()
  const proprio = pag.voce?.papel === 'proprio'
  const lista = await carregar(() => cliente.recados(rover.uid))
  if (!lista.ok) return <EstadoDeErro codigo={lista.codigo} d={d} lang={lang} />
  const recusa = !eleg.recado.ok && !proprio
  const motivoRecusa = pag.rover.recados === 'ninguem' ? m.ninguem : pag.rover.recados === 'amigos' && !pag.voce?.amigo ? m.amigos : m.naoPode
  return (
    <section className="pf-aba" aria-labelledby="pf-mural-t">
      <div className="cabeca-secao">
        <h2 id="pf-mural-t">{m.titulo}</h2>
      </div>
      <p className="suave">{m.sub}</p>
      {proprio ? (
        <p className="pf-nota">{m.propriaPagina}</p>
      ) : pag.voce?.euBloqueei ? null : recusa || !eu ? (
        <p className="pf-nota" role="note">
          {eu ? motivoRecusa : d.socPerfil.relacao.semApp}
        </p>
      ) : (
        <div className="pf-escrever">
          <h3>{fmt(m.escreverPara, { nome: rover.nome })}</h3>
          <FormProposta
            tipo="recado"
            d={d}
            lang={lang}
            campos={{ alvo: rover.uid, texto: '' }}
            destino={{ rotulo: fmt(m.destino, { handle: rover.handle }), href: `/${lang}/r/${rover.handle}` }}
            podeEscrever={eu !== null}
            nomeDoRover={eu.nome}
            placeholder={m.placeholder}
            compacto
            ocultar={['alvo']}
          />
        </div>
      )}
      {lista.valor.itens.length > 0 ? (
        <ListaRecados inicial={lista.valor} donoUid={rover.uid} donoHandle={rover.handle} meuUid={eu?.uid ?? null} d={d} lang={lang} agora={agora} />
      ) : (
        <EstadoVazio titulo={m.vazioTitulo} texto={proprio ? m.vazioProprio : fmt(m.vazioTexto, { nome: rover.nome })} ficha={rover.rosto} estado="dormir" altura={130} />
      )}
    </section>
  )
}
