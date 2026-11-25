// A volta da Rovemark: confere o estado contra o cookie ANTES de tudo, troca o código pelas fichas (servidor a servidor),
// guarda as fichas no cofre do servidor e deixa no cookie só o id da sessão.
import { NextResponse, type NextRequest } from 'next/server'
import { novoSid, salvarSessao } from '@/lib/folgali/cofre'
import { CODIGO_RE, ESTADO_RE, VIDA_DO_PEDIDO_MS, configLogin, iguais, trocarCodigo } from '@/lib/folgali/login'
import { gravarNaResposta, lerDoPedido } from '@/lib/folgali/sessao'

export const dynamic = 'force-dynamic'

const para = (req: NextRequest, caminho: string) => NextResponse.redirect(new URL(caminho, req.url), 303)

export async function GET(req: NextRequest) {
  const c = configLogin()
  if (!c) return para(req, '/pt/entrar')
  const q = req.nextUrl.searchParams
  const conteudo = lerDoPedido(req, c)
  const pedido = conteudo.login
  const lang = pedido?.destino.slice(1, 3) ?? 'pt'
  const estado = q.get('estado') ?? ''
  const valido = !!pedido && ESTADO_RE.test(estado) && iguais(estado, pedido.estado) && Date.now() - pedido.em < VIDA_DO_PEDIDO_MS
  const sem = { sid: conteudo.sid }
  if (!valido) {
    const res = para(req, `/${lang}/entrar?erro=pedido`)
    gravarNaResposta(res, sem, c)
    return res
  }
  if (q.get('erro')) {
    const res = para(req, `/${lang}/entrar?erro=cancelado`)
    gravarNaResposta(res, sem, c)
    return res
  }
  const codigo = q.get('codigo') ?? ''
  try {
    if (!CODIGO_RE.test(codigo)) throw new Error('codigo')
    const f = await trocarCodigo(c, codigo, pedido.verificador)
    const sid = novoSid()
    salvarSessao(sid, { pessoa: f.pessoa.id, nome: f.pessoa.nome, fichas: { at: f.access_token, rt: f.refresh_token }, venceEm: Date.now() + f.expires_in * 1000 }, c.segredo)
    const res = para(req, pedido.destino)
    gravarNaResposta(res, { sid }, c)
    return res
  } catch {
    const res = para(req, `/${lang}/entrar?erro=troca`)
    gravarNaResposta(res, sem, c)
    return res
  }
}
