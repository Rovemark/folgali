import 'server-only'
import { configLogin } from './login'

// Para onde os botões "Entrar com a Rovemark" e "Criar conta" levam. A folgali não tem login próprio nem guarda senha:
// os dois começam o login pela rota do próprio site (/api/auth/rovemark/inicio), que fala com a Rovemark. Sem a
// configuração do login (FOLGALI_SESSAO_SEGREDO e companhia, veja src/lib/folgali/login.ts), os botões aparecem "em breve".

export interface DestinosRovemark {
  entrar: string | null
  criar: string | null
}

export function destinosRovemark(lang = 'pt', destino?: string): DestinosRovemark {
  if (!configLogin()) return { entrar: null, criar: null }
  const q = (extra: string) => `/api/auth/rovemark/inicio?lang=${lang}${destino ? `&destino=${encodeURIComponent(destino)}` : ''}${extra}`
  return { entrar: q(''), criar: q('&tela=criar') }
}
