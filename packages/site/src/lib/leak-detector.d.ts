// Types for the copy of the protocol's leak detector (src/lib/leak-detector.js is a byte-for-byte copy of
// packages/protocol/src/leak.js; test/site/detector-copy.test.js in the repository root checks the copy).
export type LeakType =
  | 'chave-privada' | 'chave-de-api' | 'token' | 'url-com-credencial' | 'senha' | 'alta-entropia' | 'email' | 'telefone'
  | 'cpf' | 'cnpj' | 'cartao' | 'ip-privado' | 'host-interno' | 'caminho-local' | 'identificador-interno'
export const LEAK_TYPES: readonly LeakType[]
export const LEAK_EXPLANATIONS: Readonly<Record<LeakType, string>>
export function findLeaks(text: string): Array<{ tipo: LeakType; inicio: number; fim: number }>
export function detectLeak(text: string): { tipo: LeakType; explicacao: string; inicio: number; fim: number } | null
export function validCpf(text: string): boolean
export function validCnpj(text: string): boolean
export function validLuhn(text: string): boolean
export function entropy(s: string): number
export function internalIpv4(text: string): boolean
export const FREE_TEXT_FIELDS: readonly string[]
export function leakInObject(object: unknown): { campo: string; tipo: LeakType; explicacao: string; inicio: number; fim: number } | null
