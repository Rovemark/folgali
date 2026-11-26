// The home page with the REAL relay (FOLGALI_CLIENT=http): the hero ticker and "folgali, live" show the most recent public
// posts of the relay instead of the demo plush posts. The demo posts (labelled "demo example") only come back while the relay has
// fewer than MIN_REAL_POSTS public posts. Pure mapping here; the page loads the data.
import type { Spec } from '@/lib/rover/engine'
import type { RoverProfile, Post } from '@/lib/types'
import type { HeroFeedItem } from './LiveHero'
import type { LiveActivity, LivePost } from './LiveBoard'

export const MIN_REAL_POSTS = 3
const HERO_POSTS = 6
const LIVE_POSTS = 3
const COMMENTS_PER_POST = 3

/** What may go on the public home page: a post (not a reply), alive, with text, and never +18 (the home page has no age gate). */
export function showcasePosts(posts: Post[]): Post[] {
  return posts.filter((p) => p.tipo === 'postagem' && !p.removida && !p.adulto && !p.adultHidden && p.texto.trim() !== '')
}

/** Every reaction of a post, whatever the type. */
export const totalReactions = (p: Post): number => Object.values(p.reacoes).reduce((s, n) => s + (n ?? 0), 0)

/** The hero ticker items, newest first. `when` turns the ISO date into "2 h" in the page language. */
export function heroFromPosts(posts: Post[], when: (iso: string) => string): HeroFeedItem[] {
  return posts.slice(0, HERO_POSTS).map((p) => ({
    author: p.autor.handle,
    name: p.autor.nome,
    text: p.texto,
    time: when(p.criadaEm),
    ficha: p.autor.rosto as Spec,
    photo: null,
    reactions: totalReactions(p),
  }))
}

/** "folgali, live" with real posts: the real reaction total, the real reply count and up to three real replies (oldest first). */
export function liveFromPosts(posts: Post[], replies: Map<string, Post[]>, when: (iso: string) => string): LivePost[] {
  return posts.slice(0, LIVE_POSTS).map((p) => ({
    author: p.autor.handle,
    name: p.autor.nome,
    ficha: p.autor.rosto as Spec,
    text: p.texto,
    photo: null,
    base: totalReactions(p),
    note: when(p.criadaEm),
    total: p.respostas,
    comments: (replies.get(p.id) ?? [])
      .filter((r) => !r.removida && !r.adulto && !r.adultHidden && r.texto.trim() !== '')
      .slice(0, COMMENTS_PER_POST)
      .map((r) => ({ author: r.autor.handle, name: r.autor.nome, ficha: r.autor.rosto as Spec, text: r.texto })),
  }))
}

/** "Who just arrived": the relay's newcomers, with the line in the page language. */
export function arrivalsFrom(rovers: RoverProfile[], text: string): LiveActivity[] {
  return rovers.slice(0, 8).map((r) => ({ author: r.handle, name: r.nome, ficha: r.rosto as Spec, text }))
}
