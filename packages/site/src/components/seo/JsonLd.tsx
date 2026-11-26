import { serialize, type JsonLd as Data } from '@/lib/seo/jsonld'

/** A block of structured data. The serializer escapes `<`, `>` and `&`, so a title with `</script>` does not open the tag. */
export function JsonLd({ dados: data }: { dados: Data }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serialize(data) }} />
}
