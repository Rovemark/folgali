'use client'

// "Edit" on what the PERSON published (protocol 0.11.0 part 2, `edicao`): a post, a reply, a forum topic or a forum reply. Three
// pieces that share one state:
//   <Editavel>        wraps the publication; knows who is looking (one read per page, src/lib/person/viewer.ts) and whether the
//                     relay takes edits, so "Edit" exists only on what is hers and only when the relay announces `edicao`;
//   <BotaoEditar>     the trigger, wherever the screen puts it (the "..." menu of a post, the action row of a forum reply);
//   <TextoEditavel>   the text of the publication; while editing it becomes the inline editor with the current content.
// The editor runs the leak detector while she types, signs the WHOLE new content on the device (`publish('edicao', ...)`), shows a
// refusal with how long is left, and refreshes the page after saving (the relay then serves the new text and the mark "edited").
import { useRouter } from 'next/navigation'
import { createContext, useContext, useId, useMemo, useState, type ReactNode } from 'react'
import { IcEdit } from '@/components/social/SocialIcons'
import { LeakNotice } from '@/components/person/LeakNotice'
import { editTexts, type EditTexts } from '@/i18n/edit'
import { EDIT_LIMITS, draftProblem, editBody, sameContent, type EditContent, type EditTarget } from '@/lib/domain/edit'
import { count } from '@/lib/domain/limits'
import type { Locale } from '@/lib/i18n-base'
import { findLeaks } from '@/lib/leak-detector'
import { legalDict } from '@/lib/legal-i18n'
import { PersonError, publish } from '@/lib/person/client'
import { formatWait, waitOf } from '@/lib/person/refusal'
import { forgetViewer, useViewer } from '@/lib/person/viewer'

export interface EditableTarget {
  id: string
  tipo: EditTarget
  /** uid of the author: only she edits */
  autor: string
  /** what it says now (after earlier edits) */
  conteudo: EditContent
}

type State = { alvo: EditableTarget; lang: Locale; t: EditTexts; can: boolean; editando: boolean; abrir: () => void; fechar: () => void }
const Context = createContext<State | null>(null)

/** The state of the publication around: null outside an <Editavel>. */
export const useEdit = () => useContext(Context)

export function Editable({ alvo: target, lang, children }: { alvo: EditableTarget; lang: Locale; children: ReactNode }) {
  const v = useViewer()
  const [editing, setEditing] = useState(false)
  const can = !!v && v.edit && v.uid === target.autor
  const state = useMemo<State>(
    () => ({ alvo: target, lang, t: editTexts(lang), can, editando: can && editing, abrir: () => setEditing(true), fechar: () => setEditing(false) }),
    [target, lang, can, editing],
  )
  return <Context.Provider value={state}>{children}</Context.Provider>
}

/** The "Edit" trigger. Renders nothing unless the publication is the viewer's and the relay takes edits. */
export function EditButton({ className = 'action-btn text', onOpen }: { className?: string; onOpen?: () => void }) {
  const c = useEdit()
  if (!c?.can || c.editando) return null
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        onOpen?.()
        c.abrir()
      }}
    >
      <IcEdit />
      <span>{c.t.edit}</span>
    </button>
  )
}

/** The text of the publication; the inline editor while editing. */
export function EditableText({ children }: { children: ReactNode }) {
  const c = useEdit()
  if (!c?.editando) return <>{children}</>
  return <EditorInline alvo={c.alvo} lang={c.lang} t={c.t} onClose={c.fechar} />
}

/** A refusal of the relay as a sentence for the person, with how long is left when the relay says it. */
export function editRefusal(e: unknown, t: EditTexts, lang: string, leakKey: string): string {
  const code = e instanceof PersonError ? e.code : ''
  if (code === 'ja_existe') return t.errors.same
  if (code === 'limite_de_taxa' || code === 'limite' || code === 'autorizacao_esgotada') {
    const wait = waitOf(e)
    return `${t.errors.rate} ${wait === null ? t.errors.later : t.errors.unlocksIn.replace('{espera}', formatWait(wait, lang))}`
  }
  if (code === 'limite_de_estrutura') return t.errors.structure
  if (code === 'trancado') return t.errors.locked
  if (code === 'nao_e_autor' || code === 'outro_autor') return t.errors.notAuthor
  if (code === 'alvo_removido' || code === 'removido' || code === 'alvo_desconhecido') return t.errors.removed
  if (code === 'vazamento') return leakKey
  if (code === 'sem_sessao' || code === 'acesso_invalido' || code === 'acesso_revogado') return t.errors.signedOut
  return t.errors.generic
}

function EditorInline({ alvo: target, lang, t, onClose }: { alvo: EditableTarget; lang: Locale; t: EditTexts; onClose: () => void }) {
  const id = useId()
  const router = useRouter()
  const leak = legalDict(lang).vazamento
  const lim = EDIT_LIMITS[target.tipo]
  const [title, setTitle] = useState(target.conteudo.titulo ?? '')
  const [text, setText] = useState(target.conteudo.texto)
  const [taken, setTaken] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const newValue: EditContent = { ...target.conteudo, titulo: lim.titulo ? title.trim() || null : null, texto: text.trim() }
  const problem = draftProblem(target.tipo, title, text)
  const leaks = useMemo(() => findLeaks(`${title}\n${text}`).length > 0, [title, text])
  const equal = sameContent(newValue, { ...target.conteudo, titulo: lim.titulo ? target.conteudo.titulo : null })
  const can = !problem && !leaks && !equal && !taken

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!can) return
    setTaken(true)
    setError(null)
    try {
      await publish('edicao', editBody(target.id, target.tipo, newValue))
      forgetViewer()
      onClose()
      router.refresh()
    } catch (x) {
      setError(editRefusal(x, t, lang, leak.chave))
    } finally {
      setTaken(false)
    }
  }

  const used = count(text.trim())
  return (
    <form className="ed-form" onSubmit={save} aria-label={t.formLabel}>
      {lim.titulo && (
        <div className="field">
          <label htmlFor={`${id}-ti`}>{lim.titulo.required ? t.topicTitleLabel : t.titleLabel}</label>
          <input id={`${id}-ti`} type="text" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={lim.titulo.max} autoComplete="off" disabled={taken} aria-invalid={problem === 'title' || undefined} />
          <LeakNotice text={title} leak={leak} field={`${id}-ti`} />
        </div>
      )}
      <div className="field">
        <label htmlFor={`${id}-tx`}>{t.textLabel}</label>
        <textarea id={`${id}-tx`} rows={Math.min(12, Math.max(4, text.split('\n').length + 1, Math.ceil(text.length / 48)))} value={text} onChange={(e) => setText(e.target.value)} disabled={taken} aria-describedby={`${id}-ct`} aria-invalid={problem === 'long' || problem === 'empty' || undefined} />
        <span id={`${id}-ct`} className="help ed-counter" data-passou={used > lim.texto || undefined}>
          {new Intl.NumberFormat(lang).format(used)} / {new Intl.NumberFormat(lang).format(lim.texto)}
        </span>
        <LeakNotice text={text} leak={leak} field={`${id}-tx`} />
      </div>
      {problem && problem !== 'empty' && (
        <p className="field-error" role="alert">
          {t.errors[problem]}
        </p>
      )}
      <p className="fine ed-note">{t.publicNote}</p>
      {error && (
        <p className="callout callout-notice" role="alert">
          {error}
        </p>
      )}
      <div className="ed-buttons">
        <button type="button" className="btn btn-calm btn-small" onClick={onClose} disabled={taken}>
          {t.cancel}
        </button>
        <button type="submit" className="btn btn-primary btn-small" disabled={!can} aria-busy={taken}>
          {taken ? t.saving : t.save}
        </button>
      </div>
    </form>
  )
}
