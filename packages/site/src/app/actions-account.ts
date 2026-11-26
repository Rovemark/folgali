'use server'

// Server actions of the person's account on folgali (Lex's request, 4.1 and 4.3): accepting the Terms on the first entry, and the
// choices the server keeps (18+ content, opt-out of AI training). Everything is tied to the Rovemark session; without it nothing happens.
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { savePreferences, needsAdultConfirmation, preferencesOf, recordConsent } from '@/lib/folgali/vault'
import { currentPerson } from '@/lib/folgali/session'
import { isReady } from '@/lib/i18n'

export type ConsentState = { estado: 'novo' } | { estado: 'erro'; erro: 'caixa' | 'sessao' }

/** "I am 18 or older and I accept the Terms": the button only counts with the box ticked; the acceptance is recorded on the server. */
export async function acceptTermsAction(_prev: ConsentState, form: FormData): Promise<ConsentState> {
  const lang = String(form.get('lang') ?? 'pt')
  if (form.get('aceito') !== 'sim') return { estado: 'erro', erro: 'caixa' }
  const person = await currentPerson()
  if (!person) return { estado: 'erro', erro: 'sessao' }
  recordConsent(person.id)
  revalidatePath('/', 'layout')
  redirect(`/${isReady(lang) ? lang : 'pt'}/linha`)
}

/**
 * Settings > Privacy: saves both choices and comes back to the same page with the "saved" notice. Turning 18+ on (decision of the
 * Rovemark, 2026-11-25: off by default) needs the "I am 18 or older" box ticked too; without it nothing is saved and the page says why.
 */
export async function savePreferencesAction(form: FormData): Promise<void> {
  const lang = String(form.get('lang') ?? 'pt')
  const page = `/${isReady(lang) ? lang : 'pt'}/configuracoes/privacidade`
  const person = await currentPerson()
  if (!person) redirect(page)
  const adult = form.get('adulto') === 'sim'
  const confirmsAdult = form.get('confirmaMaior') === 'sim'
  if (!confirmsAdult && needsAdultConfirmation(preferencesOf(person.id), adult)) redirect(`${page}?erro=maior`)
  savePreferences(person.id, { adulto: adult, semTreino: form.get('semTreino') === 'sim', confirmaMaior: confirmsAdult })
  revalidatePath('/', 'layout')
  redirect(`${page}?salvo=1`)
}
