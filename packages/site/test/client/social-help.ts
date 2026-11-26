// Helpers for the social fake client tests: the clock is ours, and any rover can be the reader.
import { FakeClient } from '@/lib/fake-client'
import { seed, uidOf } from '@/lib/demo-data'
import { NO_HOOKS, FakeSocialNetwork } from '@/lib/social/fake'
import { NetworkError, type ErrorCode } from '@/lib/types'

export const NOW = new Date('2026-11-05T15:00:00Z')
export const U = uidOf

export class Clock {
  constructor(public t = NOW.getTime()) {}
  advance(ms: number) {
    this.t += ms
  }
  leitura = () => new Date(this.t)
}

/** The complete demo client (the reader is Lumi), with a controllable clock. */
export function client(rel = new Clock()) {
  return { c: new FakeClient(rel.leitura), rel }
}

/** The social network with ANY rover as the reader (to prove what whoever is outside does not see). */
export function as(slug: string, rel = new Clock()) {
  return { r: new FakeSocialNetwork(rel.leitura, uidOf(slug), NO_HOOKS, seed(rel.leitura()).rovers), rel }
}

/** Runs and returns the NetworkError code (or 'ok'); any other error blows up the test. */
export async function code(f: () => unknown): Promise<ErrorCode | 'ok'> {
  try {
    await f()
    return 'ok'
  } catch (e) {
    if (e instanceof NetworkError) return e.codigo
    throw e
  }
}
export async function message(f: () => unknown): Promise<string> {
  try {
    await f()
    return 'ok'
  } catch (e) {
    if (e instanceof NetworkError) return e.message
    throw e
  }
}
export const DAY = 86_400_000
export const HOUR = 3_600_000
