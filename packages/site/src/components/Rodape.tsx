import Link from 'next/link'
import BotaoTema from '@/components/BotaoTema'
import IdiomasDoRodape from '@/components/IdiomasDoRodape'
import Marca from '@/components/Marca'
import { IcGitHub } from '@/components/LinkDoCodigo'
import { dict, fmt, type Pronto } from '@/lib/i18n'
import { rodapeDict } from '@/lib/i18n-extra'
import { ROTAS, SECOES_DO_RODAPE, rotasDaSecao, type Rota } from '@/lib/seo/rotas'

// O rodapé do site: um mapa de verdade, com as seis colunas do registro de rotas (`src/lib/seo/rotas.ts`). Cada link existe: o teste
// `rodape` confere cada rota contra um page.tsx e o script `varrer-rodape` confere que cada uma responde 200 no preview.
// Sem cookie, sem rastreio, sem script e sem fonte de terceiros.

function ItemDeLink({ rota, lang, rotulo, fora }: { rota: Rota; lang: Pronto; rotulo: string; fora: string }) {
  if (rota.externo !== undefined) {
    return (
      <a href={rota.externo} target="_blank" rel="noopener" className={rota.id === 'codigo' ? 'rodape-codigo' : undefined}>
        {rota.id === 'codigo' && <IcGitHub tamanho={16} />}
        {rotulo}
        <span className="so-leitor"> ({fora})</span>
      </a>
    )
  }
  return <Link href={`/${lang}${rota.caminho}`}>{rotulo}</Link>
}

export default function Rodape({ lang, demonstracao }: { lang: Pronto; demonstracao: boolean }) {
  const r = rodapeDict(lang)
  const d = dict(lang)
  const rotulos = r.rotulos as Record<string, string>
  return (
    <footer className="rodape" aria-label={r.navegacao}>
      <div className="rodape-miolo">
        <div className="rodape-marca">
          <Marca lang={lang} />
          <p className="rodape-descricao">{r.marca.descricao}</p>
          <p className="rodape-nota">{r.marca.nota}</p>
          <div className="rodape-preferencias">
            <IdiomasDoRodape lang={lang} rotulo={r.idioma} />
            <BotaoTema rotuloEscuro={d.comum.temaEscuro} rotuloClaro={d.comum.temaClaro} />
          </div>
        </div>
        <nav className="rodape-nav" aria-label={r.navegacao}>
          {SECOES_DO_RODAPE.map((s) => (
            <section key={s} aria-labelledby={`rodape-${s}`}>
              <h2 id={`rodape-${s}`}>{r.secoes[s]}</h2>
              <ul>
                {rotasDaSecao(s).map((rota) => (
                  <li key={rota.id}>
                    <ItemDeLink rota={rota} lang={lang} rotulo={rotulos[rota.id]} fora={r.abreEmNovaAba} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </div>
      <div className="rodape-base">
        <p>{fmt(r.ano, { ano: new Date().getFullYear() })}</p>
        <p>{d.rodape.linha2}</p>
        <p>{r.rascunho}</p>
        {demonstracao && <p>{r.demo}</p>}
        {lang !== 'pt' && <p>{r.traducao}</p>}
      </div>
    </footer>
  )
}

/** Quantas rotas internas o rodapé liga (usado pelos testes). */
export const ROTAS_DO_RODAPE = ROTAS.filter((x) => x.secao !== null)
