import { serializar, type JsonLd as Dados } from '@/lib/seo/jsonld'

/** Um bloco de dados estruturados. `serializar` escapa `<`, `>` e `&`, então um título com `</script>` não abre a tag. */
export function JsonLd({ dados }: { dados: Dados }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializar(dados) }} />
}
