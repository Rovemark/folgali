// TDMRep (W3C Community Group): the machine-readable text and data mining reservation for the whole site. Third parties may not mine
// or train on folgali content without an agreement (Terms 8.3-A, Developer terms, prohibition 4). The header `tdm-reservation: 1`
// goes on every response too (next.config.ts).
export const dynamic = 'force-dynamic'

export function GET() {
  // no `tdm-policy`: the ODRL policy does not exist yet; the human-readable terms are at /desenvolvedores/termos
  return Response.json([{ location: '/', 'tdm-reservation': 1 }], {
    headers: { 'cache-control': 'public, max-age=3600' },
  })
}
