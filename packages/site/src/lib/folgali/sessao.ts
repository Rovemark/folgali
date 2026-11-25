import 'server-only'
// O ÚNICO lugar do site que lê ou grava cookie (test/privacidade-do-site.test.ts cobra). Um cookie só, `folgali_sessao`:
// essencial, httpOnly, Secure, SameSite=Lax, lacrado com AES-256-GCM. Leva o pedido de login em andamento (verificador PKCE,
// estado, destino) e/ou o id da sessão; as fichas da Rovemark ficam no servidor (cofre.ts), nunca no navegador.
// Nada de rastreio, anúncio ou métrica.
import { cookies } from 'next/headers'
import type { NextRequest, NextResponse } from 'next/server'
import { apagarSessao, fichasDa, lerSessao, salvarSessao } from './cofre'
import { COOKIE_SESSAO, ErroDeAcesso, VIDA_DO_COOKIE_S, abrir, configLogin, renovar, selar, type ConfigLogin, type ConteudoDoCookie } from './login'

export const OPCOES_DO_COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } as const

export function lerDoPedido(req: NextRequest, c: ConfigLogin): ConteudoDoCookie {
  return abrir<ConteudoDoCookie>(req.cookies.get(COOKIE_SESSAO)?.value, c.segredo) ?? {}
}

export function gravarNaResposta(res: NextResponse, conteudo: ConteudoDoCookie, c: ConfigLogin) {
  res.cookies.set(COOKIE_SESSAO, selar(conteudo, c.segredo), { ...OPCOES_DO_COOKIE, maxAge: VIDA_DO_COOKIE_S })
}

export function apagarNaResposta(res: NextResponse) {
  res.cookies.set(COOKIE_SESSAO, '', { ...OPCOES_DO_COOKIE, maxAge: 0 })
}

// Renovação serializada por sessão: duas renovações em paralelo com a mesma ficha derrubariam a família inteira.
const renovando = new Map<string, Promise<boolean>>()

/** Garante uma ficha de acesso válida para a sessão, renovando se faltar menos de um minuto. false = a sessão acabou. */
export async function manterViva(sid: string, c: ConfigLogin, busca: typeof fetch = fetch): Promise<boolean> {
  const s = lerSessao(sid)
  if (!s) return false
  if (s.venceEm - Date.now() > 60_000) return true
  const emCurso = renovando.get(sid)
  if (emCurso) return emCurso
  const p = (async () => {
    const f = fichasDa(s, c.segredo)
    if (!f) {
      apagarSessao(sid)
      return false
    }
    try {
      const novas = await renovar(c, f.rt, busca)
      salvarSessao(sid, { pessoa: novas.pessoa.id, nome: novas.pessoa.nome, fichas: { at: novas.access_token, rt: novas.refresh_token }, venceEm: Date.now() + novas.expires_in * 1000 }, c.segredo)
      return true
    } catch (e) {
      // 401: a pessoa tirou a folgali na Central, saiu, trocou a senha ou houve reuso. Rede fora: a sessão continua até a próxima tentativa.
      if (e instanceof ErroDeAcesso && (e.status === 401 || e.status === 403)) {
        apagarSessao(sid)
        return false
      }
      return true
    }
  })().finally(() => renovando.delete(sid))
  renovando.set(sid, p)
  return p
}

export interface PessoaLogada {
  id: string
  nome: string
}

/** Quem entrou, para as páginas (Server Components). Sem configuração, sem cookie ou com sessão encerrada: null. */
export async function pessoaAtual(): Promise<PessoaLogada | null> {
  const c = configLogin()
  if (!c) return null
  const conteudo = abrir<ConteudoDoCookie>((await cookies()).get(COOKIE_SESSAO)?.value, c.segredo)
  if (!conteudo?.sid) return null
  if (!(await manterViva(conteudo.sid, c))) return null
  const s = lerSessao(conteudo.sid)
  return s ? { id: s.pessoa, nome: s.nome } : null
}
