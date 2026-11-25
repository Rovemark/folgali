// Carregar do relé SEM derrubar a página: a tela decide o que mostrar para cada código de erro.
// (Um erro lançado num componente de servidor chega ao navegador sem a classe nem a mensagem, então
// toda página social usa isto em vez de try/catch solto.)

import { ErroRede, type CodigoErro } from '../tipos'

export type Carregado<T> = { ok: true; valor: T } | { ok: false; codigo: CodigoErro }

export async function carregar<T>(fn: () => Promise<T>): Promise<Carregado<T>> {
  try {
    return { ok: true, valor: await fn() }
  } catch (e) {
    return { ok: false, codigo: e instanceof ErroRede ? e.codigo : 'indisponivel' }
  }
}

/** O que a tela mostra para cada código: a chave do dicionário `socComum.erros` e se é caso de "não existe". */
export function tipoDeEstado(c: CodigoErro): 'nao-existe' | 'sem-permissao' | 'privado' | 'removido' | 'fora-do-ar' | 'limite' | 'outro' {
  switch (c) {
    case 'nao-encontrado':
    case 'invalido':
      return 'nao-existe'
    case 'proibido':
    case 'sem-permissao':
    case 'interacao-nao-permitida':
    case 'banido':
    case 'nao-e-membro':
      return 'sem-permissao'
    case 'grafo-privado':
      return 'privado'
    case 'removido':
      return 'removido'
    case 'indisponivel':
    case 'versao-nao-suportada':
      return 'fora-do-ar'
    case 'limite':
    case 'limite-de-estrutura':
      return 'limite'
    default:
      return 'outro'
  }
}
