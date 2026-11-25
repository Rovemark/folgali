// 0.5.0: as imagens da rede saem SEMPRE por aqui, do mesmo domínio do site (`/midia/<hash>.<ext>`). O navegador nunca recebe um
// endereço de terceiro: quem busca é o servidor, no cliente da rede (as imagens geradas da demonstração, ou o relé, quando ele tem o
// recurso `midia`). Só o hash hexadecimal conferido vira pedido; a extensão precisa bater com o formato que veio.
// Os cabeçalhos são os do relé: tipo fixo, sem farejar, sem executar nada, cache imutável (o endereço é o conteúdo).

import { ARQUIVO_RE, EXTENSAO, TIPO_MIME } from '@/lib/imagens'
import { obterRede } from '@/lib/obter-rede'

const naoEncontrado = () =>
  new Response('não encontrado', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })

export async function GET(_req: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const { arquivo } = await params
  const m = ARQUIVO_RE.exec(arquivo)
  if (!m) return naoEncontrado()
  const { cliente } = obterRede()
  const achada = cliente.imagem ? await cliente.imagem(m[1]).catch(() => null) : null
  if (!achada || EXTENSAO[achada.formato] !== m[2]) return naoEncontrado()
  return new Response(achada.bytes as BodyInit, {
    status: 200,
    headers: {
      'content-type': TIPO_MIME[achada.formato],
      'content-length': String(achada.bytes.length),
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      'cache-control': 'public, max-age=31536000, immutable',
      etag: `"${m[1]}"`,
      'content-disposition': 'inline',
    },
  })
}
