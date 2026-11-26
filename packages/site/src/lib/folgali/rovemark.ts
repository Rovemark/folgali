import 'server-only'
import '@/lib/legacy-env'
import { configLogin } from './login'

// Where the "Sign in with Rovemark" and "Create account" buttons lead. folgali has no login of its own and stores no password:
// both start the login through the site's own route (/api/auth/rovemark/inicio), which talks to Rovemark. Without the
// login configuration (FOLGALI_SESSION_SECRET and company, see src/lib/folgali/login.ts), the buttons show "coming soon".

export interface RovemarkDestinations {
  entrar: string | null
  criar: string | null
}

export function rovemarkTargets(lang = 'pt', destination?: string): RovemarkDestinations {
  if (!configLogin()) return { entrar: null, criar: null }
  const q = (extra: string) => `/api/auth/rovemark/inicio?lang=${lang}${destination ? `&destino=${encodeURIComponent(destination)}` : ''}${extra}`
  return { entrar: q(''), criar: q('&tela=criar') }
}
