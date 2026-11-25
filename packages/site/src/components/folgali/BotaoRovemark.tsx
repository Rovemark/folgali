import SimboloRovemark from './SimboloRovemark'

/**
 * O único jeito de entrar na folgali: a conta Rovemark. Sem destino configurado (FOLGALI_ROVEMARK_ENTRAR_URL), o botão
 * aparece desligado, com "em breve" e a explicação; nunca leva a um lugar que não existe. Nada de Google ou Apple aqui.
 */
export default function BotaoRovemark({ href, rotulo, emBreve, emBreveTexto, contorno = false }: { href: string | null; rotulo: string; emBreve: string; emBreveTexto: string; contorno?: boolean }) {
  const classe = `btn btn-grande btn-largo btn-rovemark${contorno ? ' btn-rovemark-contorno' : ''}`
  if (href) {
    return (
      <a href={href} className={classe}>
        <SimboloRovemark />
        <span>{rotulo}</span>
      </a>
    )
  }
  return (
    <div className="rovemark-em-breve">
      <button type="button" className={classe} disabled aria-describedby="rovemark-em-breve">
        <SimboloRovemark />
        <span>{rotulo}</span>
        <span className="pilula-breve">{emBreve}</span>
      </button>
      <p id="rovemark-em-breve" className="miudo">{emBreveTexto}</p>
    </div>
  )
}
