import { savePreferencesAction } from '@/app/actions-account'
import type { Preferences } from '@/lib/folgali/vault'
import type { LegalUi } from '@/lib/legal-i18n'

/**
 * The person's choices kept on the server, shown only on Settings > Privacy (never on the way in): 18+ content (off by default since
 * Rovemark's decision of 25/11/2026) and the objection to AI training (Lex 4.3; LGPD art. 18, GDPR art. 21). While 18+ is off,
 * the form also shows the "I am 18 or older" box: turning 18+ on needs it ticked, and the server checks it again.
 */
export default function PreferencesForm({ prefs, legal, salvar: save, lang }: { prefs: Preferences; legal: LegalUi; salvar: string; lang: string }) {
  return (
    <form action={savePreferencesAction} className="consent" aria-label={legal.configuracoes.titulo}>
      <input type="hidden" name="lang" value={lang} />
      <label className="consent-box">
        <input type="checkbox" name="adulto" value="sim" defaultChecked={prefs.adulto} />
        <span>
          {legal.adulto.preferencia}
          <br />
          <span className="fine" style={{ fontWeight: 400 }}>{legal.adulto.preferenciaTexto}</span>
        </span>
      </label>
      {!prefs.adulto && (
        <label className="consent-box">
          <input type="checkbox" name="confirmaMaior" value="sim" />
          <span>{legal.adulto.confirmar}</span>
        </label>
      )}
      <label className="consent-box">
        <input type="checkbox" name="semTreino" value="sim" defaultChecked={prefs.semTreino} />
        <span>
          {legal.treino.rotulo}
          <br />
          <span className="fine" style={{ fontWeight: 400 }}>{legal.treino.texto}</span>
        </span>
      </label>
      <button type="submit" className="btn btn-secondary">{save}</button>
    </form>
  )
}
