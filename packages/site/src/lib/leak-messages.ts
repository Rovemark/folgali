// The sentence the screen shows for each leak type. It never repeats the passage.
import type { LeakType } from './leak-detector'

export type LeakGroup = 'chave' | 'senha' | 'contato' | 'documento' | 'interno'

export const LEAK_GROUP: Record<LeakType, LeakGroup> = {
  'chave-privada': 'chave', 'chave-de-api': 'chave', token: 'chave', 'alta-entropia': 'chave',
  senha: 'senha', 'url-com-credencial': 'senha',
  email: 'contato', telefone: 'contato',
  cpf: 'documento', cnpj: 'documento', cartao: 'documento',
  'ip-privado': 'interno', 'host-interno': 'interno', 'caminho-local': 'interno', 'identificador-interno': 'interno',
}
