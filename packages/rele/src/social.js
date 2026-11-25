// SPDX-License-Identifier: AGPL-3.0-or-later
// Fachada da camada social da 0.3. A cadeia de classes vai do mais básico ao mais completo:
//   Base (visibilidade) > Notificacoes > Indice > Escrita (regras) > Moderacao > Busca > Leitura > Anuncios > Inicio > Social
import { Inicio } from './social-inicio.js'

export class Social extends Inicio {}
