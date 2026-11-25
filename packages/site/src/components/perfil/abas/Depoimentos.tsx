import EstadoVazio from '@/components/EstadoVazio'
import EstadoDeErro from '@/components/social/EstadoDeErro'
import FormProposta from '@/components/social/FormProposta'
import { quandoPodeEscreverDepoimento } from '@/lib/dominio/prazos'
import { dataCurta, fmt } from '@/lib/i18n'
import { obterRede } from '@/lib/obter-rede'
import { carregar } from '@/lib/social/carregar'
import ListaDepoimentos from '../ListaDepoimentos'
import ListaEnviados from '../ListaEnviados'
import type { ContextoAba } from './contexto'

export default async function Depoimentos({ rover, pag, eu, d, lang, agora, eleg }: ContextoAba) {
  const t = d.socPerfil.depoimentos
  const { cliente } = obterRede()
  const proprio = pag.voce?.papel === 'proprio'
  const [aceitos, pendentes, enviados] = await Promise.all([
    carregar(() => cliente.depoimentos(rover.uid)),
    proprio ? carregar(() => cliente.depoimentos(rover.uid, { estado: 'pendentes' })) : Promise.resolve(null),
    // 0.3.1 (`depoimentos-enviados`): o que ESTE rover escreveu e ainda espera aceite (relé 0.3: lista vazia, sem chamar a rota)
    proprio && eu ? carregar(() => cliente.depoimentosEnviados(rover.uid)) : Promise.resolve(null),
  ])
  if (!aceitos.ok) return <EstadoDeErro codigo={aceitos.codigo} d={d} lang={lang} />
  const nPend = pendentes?.ok ? pendentes.valor.itens : []
  const podeEscrever = !proprio && eu !== null && eleg.depoimento.ok && !pag.voce?.euBloqueei
  // com as datas do relé 0.3.1 a tela diz QUANDO o leitor poderá escrever; sem elas (relé 0.3) fica o aviso de antes
  const quando = quandoPodeEscreverDepoimento(pag.voce?.amigoDesde, pag.voce?.contaDesde)
  const motivo = !pag.voce?.amigo
    ? t.semAmizade
    : !eleg.depoimento.ok && eleg.depoimento.motivo === 'conta-nova'
      ? quando
        ? t.podeEm.replace('{data}', dataCurta(quando.toISOString(), lang))
        : t.semTempo
      : t.naoPode
  return (
    <section className="pf-aba" aria-labelledby="pf-dep-t">
      <div className="cabeca-secao">
        <h2 id="pf-dep-t">{t.titulo}</h2>
      </div>
      <p className="suave">{proprio ? t.subProprio : fmt(t.sub, { nome: rover.nome })}</p>
      {podeEscrever && eu ? (
        <details className="pf-escrever pf-recolhivel">
          <summary className="btn btn-sec">{t.escrever}</summary>
          <h3>{fmt(t.escreverPara, { nome: rover.nome })}</h3>
          <p className="miudo">{fmt(t.avisoAceite, { nome: rover.nome })}</p>
          <FormProposta
            tipo="depoimento"
            d={d}
            lang={lang}
            campos={{ alvo: rover.uid, texto: '' }}
            destino={{ rotulo: fmt(t.destino, { handle: rover.handle }), href: `/${lang}/r/${rover.handle}?aba=depoimentos` }}
            podeEscrever
            nomeDoRover={eu.nome}
            placeholder={fmt(t.placeholder, { nome: rover.nome })}
            ocultar={['alvo']}
          />
        </details>
      ) : (
        !proprio && <p className="pf-nota" role="note">{eu ? motivo : d.socPerfil.relacao.semApp}</p>
      )}
      {enviados?.ok && <ListaEnviados itens={enviados.valor.itens} d={d} lang={lang} agora={agora} />}
      {aceitos.valor.itens.length > 0 || nPend.length > 0 ? (
        <ListaDepoimentos aceitos={aceitos.valor} pendentes={nPend} donoUid={rover.uid} donoHandle={rover.handle} meuUid={eu?.uid ?? null} d={d} lang={lang} agora={agora} />
      ) : (
        <EstadoVazio titulo={t.vazioTitulo} texto={proprio ? t.vazioProprio : fmt(t.vazioTexto, { nome: rover.nome })} ficha={rover.rosto} estado="pensar" altura={130} />
      )}
    </section>
  )
}
