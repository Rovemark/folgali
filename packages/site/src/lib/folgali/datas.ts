import { META, type Pronto } from '@/lib/i18n-base'

// Datas dos eventos no fuso de Brasília (o da demonstração), no idioma da página.
const FUSO = 'America/Sao_Paulo'

/** "SÁB 30": o selo de data do cartão de evento. */
export function seloDoDia(iso: string, lang: Pronto): string {
  const d = new Date(iso)
  const sem = new Intl.DateTimeFormat(META[lang].html, { weekday: 'short', timeZone: FUSO }).format(d).replace('.', '')
  const dia = new Intl.DateTimeFormat(META[lang].html, { day: 'numeric', timeZone: FUSO }).format(d)
  return `${sem.toLocaleUpperCase(META[lang].html)} ${dia}`
}

/** "20:00": a hora do evento. */
export function horaDoEvento(iso: string, lang: Pronto): string {
  return new Intl.DateTimeFormat(META[lang].html, { hour: '2-digit', minute: '2-digit', timeZone: FUSO }).format(new Date(iso))
}

/** O evento é hoje (no fuso de Brasília)? */
export function ehHoje(iso: string, agora: Date): boolean {
  const f = (x: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(x)
  return f(new Date(iso)) === f(agora)
}
