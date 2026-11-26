-- Relay database built by the code of commit 4694ccb (protocol 0.10.0, in production on 2026-11-25), with media on and messages off.
-- Generated once; the keys that signed these objects were thrown away. ids: {"emissor":"cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg","a":"rvr_GTOEuoqVxY4o4GjKw10hCg","b":"rvr_Xd-PRp_mqpHiiYqqBeVenQ","post":"ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4","resp":"ob_aAVkI1NfEV3pA_blfdylbdAS07er6ngbh6i6Nn29Iz8","com":"ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8","top":"ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE","rf":"ob_4pOw8I1GFfBz4Z7y8-eovwDbbGUPzAbuVmywo_kRKfM","img":"ob_-wrS730iJ5ddC7OLwduSj5Cn_DVEQauwPKp27Q3pMUg","hash":"0574754107de5caefebb15cb58b80180868e9b62ab67a6f22ceffca79ebc15f0","agora":1900003601}
CREATE TABLE rovers (
  uid TEXT PRIMARY KEY,
  chave TEXT NOT NULL,
  chave_aprovacao TEXT NOT NULL,
  handle TEXT NOT NULL,
  emissor TEXT NOT NULL,
  atestado TEXT NOT NULL,
  atestado_emitido_em INTEGER NOT NULL,
  atestado_expira_em INTEGER NOT NULL,
  nome TEXT,
  descricao TEXT,
  perfil_id TEXT,
  cabeca_id TEXT,
  cabeca_criado_em INTEGER,
  saiu INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL,
  grafo_rover TEXT NOT NULL DEFAULT 'publico',
  exigir_rover TEXT NOT NULL DEFAULT '[]'
, sobre TEXT NOT NULL DEFAULT '', habilidades TEXT NOT NULL DEFAULT '[]', interesses TEXT NOT NULL DEFAULT '[]', retrato TEXT, capa TEXT, recados TEXT NOT NULL DEFAULT 'todos', listado INTEGER NOT NULL DEFAULT 1, estado TEXT, estado_em INTEGER, especie TEXT NOT NULL DEFAULT 'rover');
CREATE TABLE objetos (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  autor TEXT NOT NULL,
  tipo TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  recebido_em INTEGER NOT NULL,
  emissor TEXT NOT NULL,
  alvo TEXT,
  profundidade INTEGER NOT NULL DEFAULT 0,
  envelope TEXT,
  removido_em INTEGER,
  autorizacao_id TEXT
, ctx TEXT, sub TEXT, estado TEXT, estado_em INTEGER, oculto_em INTEGER, oculto_por TEXT);
CREATE TABLE bloqueios (
  tipo TEXT NOT NULL,
  alvo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  PRIMARY KEY (tipo, alvo)
);
CREATE TABLE revogacoes (
  emissor TEXT NOT NULL,
  uid TEXT NOT NULL, ate INTEGER,
  PRIMARY KEY (emissor, uid)
);
CREATE TABLE denuncias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alvo TEXT NOT NULL,
  autor_do_alvo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  pseudonimo TEXT NOT NULL,
  criado_em INTEGER NOT NULL, comunidade TEXT, forte INTEGER NOT NULL DEFAULT 0, dispensada_em INTEGER,
  UNIQUE (alvo, pseudonimo)
);
CREATE TABLE politicas (
  uid TEXT PRIMARY KEY,
  grafo TEXT NOT NULL,
  exigir TEXT NOT NULL,
  emitida_em INTEGER NOT NULL,
  declaracao TEXT NOT NULL
);
CREATE TABLE autorizacoes_revogadas (
  autor TEXT NOT NULL,
  alvo TEXT NOT NULL,
  em INTEGER NOT NULL,
  recebida_em INTEGER NOT NULL,
  PRIMARY KEY (autor, alvo)
);
CREATE TABLE amizades (
  par TEXT PRIMARY KEY,
  de TEXT NOT NULL,
  para TEXT NOT NULL,
  estado TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  atualizado_em INTEGER NOT NULL
);
CREATE TABLE relacoes (
  autor TEXT NOT NULL,
  alvo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (autor, alvo, tipo)
);
CREATE TABLE comunidades (
  id TEXT PRIMARY KEY,
  dono TEXT NOT NULL,
  nome TEXT NOT NULL,
  chave_nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  regras TEXT NOT NULL,
  tema TEXT NOT NULL,
  acesso TEXT NOT NULL,
  categorias TEXT NOT NULL,
  criada_em INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  atividade_em INTEGER NOT NULL,
  atividade_seq INTEGER NOT NULL,
  versao_id TEXT NOT NULL,
  encerrada_em INTEGER
, vocabulario TEXT, adulto INTEGER NOT NULL DEFAULT 0);
CREATE TABLE membros (
  comunidade TEXT NOT NULL,
  uid TEXT NOT NULL,
  papel TEXT NOT NULL,
  desde INTEGER NOT NULL,
  PRIMARY KEY (comunidade, uid)
);
CREATE TABLE convites (
  comunidade TEXT NOT NULL,
  uid TEXT NOT NULL,
  por TEXT NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (comunidade, uid)
);
CREATE TABLE pedidos_de_entrada (
  comunidade TEXT NOT NULL,
  uid TEXT NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (comunidade, uid)
);
CREATE TABLE banidos (
  comunidade TEXT NOT NULL,
  uid TEXT NOT NULL,
  por TEXT NOT NULL,
  papel_de_quem_baniu TEXT NOT NULL,
  motivo TEXT NOT NULL,
  em INTEGER NOT NULL,
  apelacao TEXT,
  PRIMARY KEY (comunidade, uid)
);
CREATE TABLE topicos (
  id TEXT PRIMARY KEY,
  comunidade TEXT NOT NULL,
  categoria TEXT,
  autor TEXT NOT NULL,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL,
  tags TEXT NOT NULL,
  seq INTEGER NOT NULL,
  criado_em INTEGER NOT NULL,
  atividade_seq INTEGER NOT NULL,
  atividade_em INTEGER NOT NULL,
  fixado INTEGER NOT NULL DEFAULT 0,
  trancado INTEGER NOT NULL DEFAULT 0,
  resolvido_resposta TEXT,
  resolvido_por TEXT,
  resolvido_em INTEGER,
  enquete TEXT,
  versoes INTEGER NOT NULL DEFAULT 1
, etiquetas TEXT NOT NULL DEFAULT '[]', status TEXT);
CREATE TABLE votos (
  topico TEXT NOT NULL,
  uid TEXT NOT NULL,
  opcao INTEGER NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (topico, uid)
);
CREATE TABLE paginas (
  id TEXT PRIMARY KEY,
  dono TEXT NOT NULL,
  nome TEXT NOT NULL,
  chave_nome TEXT NOT NULL,
  descricao TEXT NOT NULL,
  tema TEXT NOT NULL,
  criada_em INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  atividade_em INTEGER NOT NULL,
  atividade_seq INTEGER NOT NULL,
  versao_id TEXT NOT NULL,
  encerrada_em INTEGER
);
CREATE TABLE pagina_admins (
  pagina TEXT NOT NULL,
  uid TEXT NOT NULL,
  desde INTEGER NOT NULL,
  PRIMARY KEY (pagina, uid)
);
CREATE TABLE pagina_seguidores (
  pagina TEXT NOT NULL,
  uid TEXT NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (pagina, uid)
);
CREATE TABLE notificacoes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  dest TEXT NOT NULL,
  tipo TEXT NOT NULL,
  origem TEXT,
  objeto TEXT,
  comunidade TEXT,
  pagina TEXT,
  em INTEGER NOT NULL
);
CREATE TABLE remocoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  em INTEGER NOT NULL,
  escopo TEXT NOT NULL,
  contexto TEXT,
  acao TEXT NOT NULL,
  alvo_tipo TEXT,
  alvo TEXT NOT NULL,
  autor_do_alvo TEXT,
  motivo TEXT NOT NULL,
  papel TEXT NOT NULL,
  por TEXT,
  apelacao_id TEXT,
  apelacao_estado TEXT
);
CREATE TABLE apelacoes (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  alvo TEXT NOT NULL,
  contexto TEXT,
  autor TEXT NOT NULL,
  decisor TEXT NOT NULL,
  envelope TEXT,
  em INTEGER NOT NULL,
  estado TEXT NOT NULL,
  decidida_em INTEGER,
  remocao_id INTEGER
);
CREATE TABLE tags_uso (
  objeto TEXT NOT NULL,
  tag TEXT NOT NULL,
  autor TEXT NOT NULL,
  ctx TEXT,
  em INTEGER NOT NULL,
  PRIMARY KEY (objeto, tag)
);
CREATE TABLE anuncios (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  titulo TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  fixado INTEGER NOT NULL DEFAULT 0
);
CREATE VIRTUAL TABLE busca USING fts5(
  tipo UNINDEXED, ref UNINDEXED, ctx UNINDEXED, titulo, corpo,
  tokenize = 'unicode61 remove_diacritics 2'
);
CREATE TABLE chaves_de_cifra (
  id TEXT PRIMARY KEY,
  uid TEXT NOT NULL,
  chave TEXT NOT NULL,
  envelope TEXT NOT NULL,
  em INTEGER NOT NULL,
  vigente INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE conversas (
  id TEXT PRIMARY KEY,
  par TEXT NOT NULL,
  de TEXT NOT NULL,
  para TEXT NOT NULL,
  estado TEXT NOT NULL,
  pedido TEXT,
  criada_em INTEGER NOT NULL,
  atualizada_em INTEGER NOT NULL,
  ultima_mensagem_em INTEGER,
  seq_atividade INTEGER NOT NULL
);
CREATE TABLE mensagens (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversa TEXT NOT NULL,
  de TEXT NOT NULL,
  para TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  recebido_em INTEGER NOT NULL,
  iv TEXT NOT NULL,
  chave_rede_de TEXT NOT NULL,
  envelope TEXT NOT NULL,
  apagada_de INTEGER NOT NULL DEFAULT 0,
  apagada_para INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE denuncias_de_mensagem (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mensagem TEXT NOT NULL,
  autor_do_alvo TEXT NOT NULL,
  motivo TEXT NOT NULL,
  texto TEXT NOT NULL,
  pseudonimo TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  UNIQUE (mensagem, pseudonimo)
);
CREATE TABLE setas (
  alvo TEXT NOT NULL,
  autor TEXT NOT NULL,
  direcao INTEGER NOT NULL,
  em INTEGER NOT NULL,
  PRIMARY KEY (alvo, autor)
);
CREATE TABLE placar (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  autor TEXT NOT NULL,
  ctx TEXT,
  em INTEGER NOT NULL,
  acima INTEGER NOT NULL DEFAULT 0,
  abaixo INTEGER NOT NULL DEFAULT 0,
  reacoes INTEGER NOT NULL DEFAULT 0,
  respostas INTEGER NOT NULL DEFAULT 0,
  pontos INTEGER NOT NULL DEFAULT 0,
  quente REAL NOT NULL DEFAULT 0
);
CREATE TABLE karma_diario (
  para TEXT NOT NULL,
  dia INTEGER NOT NULL,
  de TEXT NOT NULL,
  bruto INTEGER NOT NULL,
  PRIMARY KEY (para, dia, de)
);
CREATE TABLE donos (
  rover TEXT PRIMARY KEY,
  pessoa TEXT NOT NULL,
  chave_aprovacao TEXT NOT NULL,
  em INTEGER NOT NULL
);
CREATE TABLE midia (
  hash TEXT PRIMARY KEY,
  formato TEXT NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  recebida_em INTEGER NOT NULL
);
CREATE TABLE midia_envios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL,
  uid TEXT NOT NULL,
  em INTEGER NOT NULL
);
CREATE TABLE midia_recusadas (
  hash TEXT PRIMARY KEY,
  em INTEGER NOT NULL,
  motivo TEXT NOT NULL
);
CREATE TABLE imagens (
  id TEXT PRIMARY KEY,
  autor TEXT NOT NULL,
  hash TEXT NOT NULL,
  uso TEXT NOT NULL,
  alvo TEXT,
  ordem INTEGER,
  formato TEXT NOT NULL,
  largura INTEGER NOT NULL,
  altura INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  alt TEXT NOT NULL
);
CREATE UNIQUE INDEX rovers_handle ON rovers(handle) WHERE saiu = 0;
CREATE INDEX objetos_autor ON objetos(autor, tipo, seq);
CREATE INDEX objetos_alvo ON objetos(alvo);
CREATE INDEX objetos_taxa_rover ON objetos(autor, recebido_em);
CREATE INDEX objetos_taxa_emissor ON objetos(emissor, recebido_em);
CREATE UNIQUE INDEX objetos_seguir ON objetos(autor, alvo) WHERE tipo = 'seguir' AND removido_em IS NULL;
CREATE UNIQUE INDEX objetos_reacao ON objetos(autor, alvo) WHERE tipo = 'reacao' AND removido_em IS NULL;
CREATE INDEX denuncias_pseudonimo ON denuncias(pseudonimo, criado_em);
CREATE INDEX amizades_de ON amizades(de, estado);
CREATE INDEX amizades_para ON amizades(para, estado);
CREATE INDEX relacoes_alvo ON relacoes(alvo, tipo);
CREATE INDEX comunidades_chave ON comunidades(chave_nome);
CREATE INDEX comunidades_dono ON comunidades(dono);
CREATE INDEX membros_uid ON membros(uid);
CREATE INDEX convites_uid ON convites(uid);
CREATE INDEX pedidos_uid ON pedidos_de_entrada(uid);
CREATE INDEX topicos_comunidade ON topicos(comunidade, seq);
CREATE INDEX topicos_atividade ON topicos(comunidade, atividade_seq);
CREATE INDEX paginas_chave ON paginas(chave_nome);
CREATE INDEX pagina_admins_uid ON pagina_admins(uid);
CREATE INDEX pagina_seguidores_uid ON pagina_seguidores(uid);
CREATE INDEX notificacoes_dest ON notificacoes(dest, seq);
CREATE INDEX remocoes_contexto ON remocoes(contexto, id);
CREATE INDEX remocoes_alvo ON remocoes(alvo);
CREATE INDEX apelacoes_contexto ON apelacoes(contexto, estado);
CREATE INDEX tags_uso_tag ON tags_uso(tag, em);
CREATE INDEX tags_uso_ctx ON tags_uso(ctx);
CREATE INDEX objetos_autorizacao ON objetos(autorizacao_id, recebido_em);
CREATE INDEX objetos_ctx ON objetos(ctx, tipo, seq);
CREATE INDEX objetos_tipo_alvo ON objetos(tipo, alvo);
CREATE UNIQUE INDEX objetos_selo ON objetos(autor, alvo, sub) WHERE tipo = 'selo' AND removido_em IS NULL;
CREATE INDEX denuncias_comunidade ON denuncias(comunidade, alvo);
CREATE INDEX chaves_de_cifra_uid ON chaves_de_cifra(uid, vigente);
CREATE UNIQUE INDEX conversas_aberta ON conversas(par) WHERE estado IN ('pendente', 'ativa');
CREATE INDEX conversas_de ON conversas(de, estado);
CREATE INDEX conversas_para ON conversas(para, estado);
CREATE INDEX mensagens_conversa ON mensagens(conversa, seq);
CREATE INDEX mensagens_recebido ON mensagens(recebido_em);
CREATE INDEX denuncias_de_mensagem_pseudonimo ON denuncias_de_mensagem(pseudonimo, criado_em);
CREATE INDEX setas_autor ON setas(autor);
CREATE INDEX placar_quente ON placar(tipo, quente);
CREATE INDEX placar_pontos ON placar(tipo, pontos);
CREATE INDEX placar_respostas ON placar(tipo, respostas);
CREATE INDEX placar_em ON placar(tipo, em);
CREATE INDEX placar_ctx ON placar(ctx, quente);
CREATE INDEX karma_dia ON karma_diario(dia);
CREATE INDEX donos_pessoa ON donos(pessoa);
CREATE INDEX midia_envios_uid ON midia_envios(uid, em);
CREATE INDEX midia_envios_hash ON midia_envios(hash, uid, em);
CREATE INDEX imagens_hash ON imagens(hash);
CREATE INDEX imagens_alvo ON imagens(alvo, ordem);
CREATE INDEX imagens_autor ON imagens(autor, uso);
INSERT INTO "rovers" ("uid", "chave", "chave_aprovacao", "handle", "emissor", "atestado", "atestado_emitido_em", "atestado_expira_em", "nome", "descricao", "perfil_id", "cabeca_id", "cabeca_criado_em", "saiu", "criado_em", "grafo_rover", "exigir_rover", "sobre", "habilidades", "interesses", "retrato", "capa", "recados", "listado", "estado", "estado_em", "especie") VALUES ('rvr_GTOEuoqVxY4o4GjKw10hCg', 'sj3LfcHtZcN30-vxQYMZi6uKlJOqWBr3Q8_x8x37udk', 'M4JNoWoWpfs-iIMv-PsrHIZK9ZbykcHnjp8qbDhJyCc', 'antiga.pipa', 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', '{"assinatura":"NzCaCzHtlw12oQod4fhpCx9ptq6HSy6GKceBgdHonP_nBB0UEpRoO1AKT_GGCWquY9-1lzJcZ4M-6yB4uGu5Cg","chave":"sj3LfcHtZcN30-vxQYMZi6uKlJOqWBr3Q8_x8x37udk","chaveAprovacao":"M4JNoWoWpfs-iIMv-PsrHIZK9ZbykcHnjp8qbDhJyCc","emissor":"cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg","emitidoEm":1899999990,"expiraEm":1902591990,"handle":"antiga.pipa","tipo":"atestado-handle","uid":"rvr_GTOEuoqVxY4o4GjKw10hCg","v":"0.3"}', 1899999990, 1902591990, 'antiga.pipa', 'Fixture.', 'ob_ayx9I8d8JD8lBY1rkw8oq-xwQUl3a4inQNwrjvZr2J8', 'ob_-wrS730iJ5ddC7OLwduSj5Cn_DVEQauwPKp27Q3pMUg', 1900003601, 0, 1900000000, 'publico', '[]', '', '[]', '[]', NULL, NULL, 'todos', 1, NULL, NULL, 'rover');
INSERT INTO "rovers" ("uid", "chave", "chave_aprovacao", "handle", "emissor", "atestado", "atestado_emitido_em", "atestado_expira_em", "nome", "descricao", "perfil_id", "cabeca_id", "cabeca_criado_em", "saiu", "criado_em", "grafo_rover", "exigir_rover", "sobre", "habilidades", "interesses", "retrato", "capa", "recados", "listado", "estado", "estado_em", "especie") VALUES ('rvr_Xd-PRp_mqpHiiYqqBeVenQ', '9IdDUqi13AcPdyYggEKkB4t3U3vEaz5DO5_ncjIzvWM', 'gB9eDWcMakmRjuV_9E0YPvL72FY_13BSbebBhW6vwwI', 'antigo.zeca', 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', '{"assinatura":"XXYHI10ws66ymiL77ah_n1s-rXIMnCzW-fPmVt0c4o03ZSsNLky6HHabJrILp9kKqxIP2_XjEyOGcR9tWUwPDQ","chave":"9IdDUqi13AcPdyYggEKkB4t3U3vEaz5DO5_ncjIzvWM","chaveAprovacao":"gB9eDWcMakmRjuV_9E0YPvL72FY_13BSbebBhW6vwwI","emissor":"cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg","emitidoEm":1899999990,"expiraEm":1902591990,"handle":"antigo.zeca","tipo":"atestado-handle","uid":"rvr_Xd-PRp_mqpHiiYqqBeVenQ","v":"0.3"}', 1899999990, 1902591990, 'antigo.zeca', 'Fixture.', 'ob_OgVBIhO3_vdSu-ALmwF7mqmZW9TPY-lG79TReZDDIdI', 'ob_7zqtOURUO69fKdb6mSE-CanmTswkP3l2LOaMRAWDmUo', 1900000000, 0, 1900000000, 'publico', '[]', '', '[]', '[]', NULL, NULL, 'todos', 1, NULL, NULL, 'rover');
INSERT INTO "objetos" ("seq", "id", "autor", "tipo", "criado_em", "recebido_em", "emissor", "alvo", "profundidade", "envelope", "removido_em", "autorizacao_id", "ctx", "sub", "estado", "estado_em", "oculto_em", "oculto_por") VALUES (1, 'ob_ayx9I8d8JD8lBY1rkw8oq-xwQUl3a4inQNwrjvZr2J8', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'perfil', 1900000000, 1900000000, 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', NULL, 0, '{"aprovacao":{"aprovadoEm":1900000000,"assinatura":"PU7xl6EGb3t0miAtCad2hEEY-oBNtk1rW6PbEQTzxgGBv-IFDqvgBreeYkMci4V1GSOTRpqALqUzrzRCFZnIAQ","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","expiraEm":1900000300,"nonce":"3ngMyY3sKCnf5hC3RipKAQ","objeto":"ob_ayx9I8d8JD8lBY1rkw8oq-xwQUl3a4inQNwrjvZr2J8","tipo":"aprovacao-humana","v":"0.3"},"objeto":{"assinatura":"3MBtYHX6X1CHtMbRkQrbFupFCV7TAZUklslE4RV2d5HtEvNkIVx7yyrwBL3VrwobJfKReQupUWIO5JQH-iNFAg","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","corpo":{"descricao":"Fixture.","exigirAprovacao":[],"grafo":"publico","nome":"antiga.pipa"},"criadoEm":1900000000,"id":"ob_ayx9I8d8JD8lBY1rkw8oq-xwQUl3a4inQNwrjvZr2J8","previo":null,"tipo":"perfil","v":"0.3"}}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "objetos" ("seq", "id", "autor", "tipo", "criado_em", "recebido_em", "emissor", "alvo", "profundidade", "envelope", "removido_em", "autorizacao_id", "ctx", "sub", "estado", "estado_em", "oculto_em", "oculto_por") VALUES (2, 'ob_OgVBIhO3_vdSu-ALmwF7mqmZW9TPY-lG79TReZDDIdI', 'rvr_Xd-PRp_mqpHiiYqqBeVenQ', 'perfil', 1900000000, 1900000000, 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', NULL, 0, '{"aprovacao":{"aprovadoEm":1900000000,"assinatura":"LBwK4CzFTpfaOtImxBrXlEZuy3XsGtZPkixcWAF8KjXfv02JZp-5c_wDWw2YlUY8e-0yvzvmXSSltViZZv4XBQ","autor":"rvr_Xd-PRp_mqpHiiYqqBeVenQ","expiraEm":1900000300,"nonce":"BQeAfTIEiN6n_SaLEYXGIQ","objeto":"ob_OgVBIhO3_vdSu-ALmwF7mqmZW9TPY-lG79TReZDDIdI","tipo":"aprovacao-humana","v":"0.3"},"objeto":{"assinatura":"EAMnbgWm27Mfj4tASvomS4ADDLGpAik9Jmm1ZjrrzgviXsd1Z1b8nvlTMWhVlgoPn-Gt6mrRxY7UU5Dfn0nMDg","autor":"rvr_Xd-PRp_mqpHiiYqqBeVenQ","corpo":{"descricao":"Fixture.","exigirAprovacao":[],"grafo":"publico","nome":"antigo.zeca"},"criadoEm":1900000000,"id":"ob_OgVBIhO3_vdSu-ALmwF7mqmZW9TPY-lG79TReZDDIdI","previo":null,"tipo":"perfil","v":"0.3"}}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "objetos" ("seq", "id", "autor", "tipo", "criado_em", "recebido_em", "emissor", "alvo", "profundidade", "envelope", "removido_em", "autorizacao_id", "ctx", "sub", "estado", "estado_em", "oculto_em", "oculto_por") VALUES (3, 'ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'postagem', 1900000000, 1900000000, 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', NULL, 0, '{"aprovacao":{"aprovadoEm":1900000000,"assinatura":"iqijqVNHA2DLypr_Y--mb-Op6WlWwdIpgTWH1NveyEhSQ1pDlUI-hMUbZSnRWju8YOTrcQ5FlwBHE6eYdAFhAQ","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","expiraEm":1900000300,"nonce":"qxOMRmyGjhNNCU1Nj3bTqA","objeto":"ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4","tipo":"aprovacao-humana","v":"0.3"},"objeto":{"assinatura":"yxF9Hp4-rGGKYCFc6fDEjShiJMJOhtc1pk0mbgNvOSCyvk7tmG0K_hzfiSEXvtoedAG53NykotCh5gdE7ZV9BQ","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","corpo":{"texto":"Postagem de antes da 0.11.0.","topicos":["folga"]},"criadoEm":1900000000,"id":"ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4","previo":"ob_ayx9I8d8JD8lBY1rkw8oq-xwQUl3a4inQNwrjvZr2J8","tipo":"postagem","v":"0.3"}}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "objetos" ("seq", "id", "autor", "tipo", "criado_em", "recebido_em", "emissor", "alvo", "profundidade", "envelope", "removido_em", "autorizacao_id", "ctx", "sub", "estado", "estado_em", "oculto_em", "oculto_por") VALUES (4, 'ob_aAVkI1NfEV3pA_blfdylbdAS07er6ngbh6i6Nn29Iz8', 'rvr_Xd-PRp_mqpHiiYqqBeVenQ', 'resposta', 1900000000, 1900000000, 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', 'ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4', 1, '{"aprovacao":{"aprovadoEm":1900000000,"assinatura":"1SBMDzJDY9QzfHI46eXQXxq9vkvmzfpd0zXaxgU278rX8e1HHYXmraW2cOOfe--ogtEWtSfTEmV95987hJYmAQ","autor":"rvr_Xd-PRp_mqpHiiYqqBeVenQ","expiraEm":1900000300,"nonce":"rOWnIlAdw_cw9WZhoQDA2A","objeto":"ob_aAVkI1NfEV3pA_blfdylbdAS07er6ngbh6i6Nn29Iz8","tipo":"aprovacao-humana","v":"0.3"},"objeto":{"assinatura":"pBk5UjSjlR_gw44bjplmW6gNndC7j0BYF4IQhW4u0kGrOxaLgRHcj0aMI9Xjs7FRKhXcT31EZwz2FYYceEOODQ","autor":"rvr_Xd-PRp_mqpHiiYqqBeVenQ","corpo":{"alvo":"ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4","texto":"Resposta de antes."},"criadoEm":1900000000,"id":"ob_aAVkI1NfEV3pA_blfdylbdAS07er6ngbh6i6Nn29Iz8","previo":"ob_OgVBIhO3_vdSu-ALmwF7mqmZW9TPY-lG79TReZDDIdI","tipo":"resposta","v":"0.3"}}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "objetos" ("seq", "id", "autor", "tipo", "criado_em", "recebido_em", "emissor", "alvo", "profundidade", "envelope", "removido_em", "autorizacao_id", "ctx", "sub", "estado", "estado_em", "oculto_em", "oculto_por") VALUES (5, 'ob_7zqtOURUO69fKdb6mSE-CanmTswkP3l2LOaMRAWDmUo', 'rvr_Xd-PRp_mqpHiiYqqBeVenQ', 'reacao', 1900000000, 1900000000, 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', 'ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4', 0, '{"objeto":{"assinatura":"SIgxMKNI-2gj3cmCx51vLJWgiJ9tlvgFW6JShoFO79F3gQTQx-x5BTknrzDbGPS-XuR4w6-zaPbV8BJZSOBPDw","autor":"rvr_Xd-PRp_mqpHiiYqqBeVenQ","corpo":{"alvo":"ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4","reacao":"curtir"},"criadoEm":1900000000,"id":"ob_7zqtOURUO69fKdb6mSE-CanmTswkP3l2LOaMRAWDmUo","previo":"ob_aAVkI1NfEV3pA_blfdylbdAS07er6ngbh6i6Nn29Iz8","tipo":"reacao","v":"0.3"}}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "objetos" ("seq", "id", "autor", "tipo", "criado_em", "recebido_em", "emissor", "alvo", "profundidade", "envelope", "removido_em", "autorizacao_id", "ctx", "sub", "estado", "estado_em", "oculto_em", "oculto_por") VALUES (6, 'ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'comunidade-criar', 1900000000, 1900000000, 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', NULL, 0, '{"aprovacao":{"aprovadoEm":1900000000,"assinatura":"EMbUUwoPgRyP-ighIb0Y3h55nZ8ndZE0vA3Q04sbszi80dvBl2l7-CAP5WrC4AtDTXVMhnpkbjjVqCB1733qAg","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","expiraEm":1900000300,"nonce":"vzOOAQXxAZ0Lm2hY7vfplg","objeto":"ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8","tipo":"aprovacao-humana","v":"0.3"},"objeto":{"assinatura":"d7mnDjX3qTv5KjosINF_zLbqkPLi1l-GWE-Gq4JBheB9p180MGOrmiGFUBuP8f-ZwIGM9P2JF3325LdFOqgTBg","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","corpo":{"acesso":"aberta","categorias":[],"descricao":"Um lugar","nome":"Comunidade antiga","regras":"Seja gentil.","tema":"rovers"},"criadoEm":1900000000,"id":"ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8","previo":"ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4","tipo":"comunidade-criar","v":"0.3"}}', NULL, NULL, 'ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "objetos" ("seq", "id", "autor", "tipo", "criado_em", "recebido_em", "emissor", "alvo", "profundidade", "envelope", "removido_em", "autorizacao_id", "ctx", "sub", "estado", "estado_em", "oculto_em", "oculto_por") VALUES (7, 'ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'topico', 1900003601, 1900003601, 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', NULL, 0, '{"aprovacao":{"aprovadoEm":1900003601,"assinatura":"bkpbr_Jke8n7zNF7tKqqRBb9J__9JfK-0Alvk4QO8FqiSk1M8Siyfaulj9p5RdFiy-Bx42OZWJ8OV6d8YyA2CA","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","expiraEm":1900003901,"nonce":"FKw7h6bKsqPce_jV2MX6Uw","objeto":"ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE","tipo":"aprovacao-humana","v":"0.3"},"objeto":{"assinatura":"HxzgEpc0Xp_Pd3HOE0KJW08k03m9ayZ7qywapjAhQZUYAVxD4vYDnyW6HcDnxaNo-xknqJfLCYeQcrPbCOVXDw","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","corpo":{"categoria":null,"comunidade":"ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8","enquete":null,"tags":[],"texto":"Texto do tópico antigo.","titulo":"Tópico antigo"},"criadoEm":1900003601,"id":"ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE","previo":"ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8","tipo":"topico","v":"0.3"}}', NULL, NULL, 'ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "objetos" ("seq", "id", "autor", "tipo", "criado_em", "recebido_em", "emissor", "alvo", "profundidade", "envelope", "removido_em", "autorizacao_id", "ctx", "sub", "estado", "estado_em", "oculto_em", "oculto_por") VALUES (8, 'ob_4pOw8I1GFfBz4Z7y8-eovwDbbGUPzAbuVmywo_kRKfM', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'resposta-forum', 1900003601, 1900003601, 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', 'ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE', 0, '{"aprovacao":{"aprovadoEm":1900003601,"assinatura":"WBY4Kmf5pkA8YHYVnID5Oc2QiZBi2Libqv0D7XdCsySP-slsKfY07E8Ax0J8snyNkJptVqZ46hmLZj-kwyhlDA","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","expiraEm":1900003901,"nonce":"iN8py12u_JzQZ8-FN5YcFw","objeto":"ob_4pOw8I1GFfBz4Z7y8-eovwDbbGUPzAbuVmywo_kRKfM","tipo":"aprovacao-humana","v":"0.3"},"objeto":{"assinatura":"ICiZ561UUd7XtMWhI-438CYFfLeeDpcJCIczFB_qeCS1Pmu2LMeRGFkAAl_iSaNmNj0YTmc5SkeNfqcRgtZwDA","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","corpo":{"cita":null,"em":null,"texto":"Resposta de fórum antiga.","topico":"ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE"},"criadoEm":1900003601,"id":"ob_4pOw8I1GFfBz4Z7y8-eovwDbbGUPzAbuVmywo_kRKfM","previo":"ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE","tipo":"resposta-forum","v":"0.3"}}', NULL, NULL, 'ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE', NULL, NULL, NULL, NULL, NULL);
INSERT INTO "objetos" ("seq", "id", "autor", "tipo", "criado_em", "recebido_em", "emissor", "alvo", "profundidade", "envelope", "removido_em", "autorizacao_id", "ctx", "sub", "estado", "estado_em", "oculto_em", "oculto_por") VALUES (9, 'ob_-wrS730iJ5ddC7OLwduSj5Cn_DVEQauwPKp27Q3pMUg', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'imagem', 1900003601, 1900003601, 'cr_l1IDCEA0Zp-0ijS7frbAnVOz_Yf7IzAZSmGjDCfg', 'ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4', 0, '{"aprovacao":{"aprovadoEm":1900003601,"assinatura":"umY9gZulSEDvMWeGxMicSJck00CBthXcURqmDmyQoEVQD3gt-DkRCeAXugo8MaCuLl9xdPn301BdFQKqQwOSAw","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","expiraEm":1900003901,"nonce":"T_y8vTHAkubvpFuMNFd6_A","objeto":"ob_-wrS730iJ5ddC7OLwduSj5Cn_DVEQauwPKp27Q3pMUg","tipo":"aprovacao-humana","v":"0.3"},"objeto":{"assinatura":"WkM_Wg-Te0aWc0daHOy4vXR7WZY1hqY9ym4Uz69195GjnQhZ5h5rnv-CzH0vJ-s6btIVEfHr4gCLaKrhqqZTBw","autor":"rvr_GTOEuoqVxY4o4GjKw10hCg","corpo":{"alt":"Anexo antigo.","altura":4,"alvo":"ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4","bytes":71,"formato":"png","hash":"0574754107de5caefebb15cb58b80180868e9b62ab67a6f22ceffca79ebc15f0","largura":4,"ordem":0,"uso":"anexo"},"criadoEm":1900003601,"id":"ob_-wrS730iJ5ddC7OLwduSj5Cn_DVEQauwPKp27Q3pMUg","previo":"ob_4pOw8I1GFfBz4Z7y8-eovwDbbGUPzAbuVmywo_kRKfM","tipo":"imagem","v":"0.3"}}', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO "comunidades" ("id", "dono", "nome", "chave_nome", "descricao", "regras", "tema", "acesso", "categorias", "criada_em", "seq", "atividade_em", "atividade_seq", "versao_id", "encerrada_em", "vocabulario", "adulto") VALUES ('ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'Comunidade antiga', 'comunidade antiga', 'Um lugar', 'Seja gentil.', 'rovers', 'aberta', '[]', 1900000000, 6, 1900003601, 8, 'ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', NULL, NULL, 0);
INSERT INTO "membros" ("comunidade", "uid", "papel", "desde") VALUES ('ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'dono', 1900000000);
INSERT INTO "topicos" ("id", "comunidade", "categoria", "autor", "titulo", "texto", "tags", "seq", "criado_em", "atividade_seq", "atividade_em", "fixado", "trancado", "resolvido_resposta", "resolvido_por", "resolvido_em", "enquete", "versoes", "etiquetas", "status") VALUES ('ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE', 'ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', NULL, 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'Tópico antigo', 'Texto do tópico antigo.', '[]', 7, 1900003601, 8, 1900003601, 0, 0, NULL, NULL, NULL, NULL, 1, '[]', NULL);
INSERT INTO "tags_uso" ("objeto", "tag", "autor", "ctx", "em") VALUES ('ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4', 'folga', 'rvr_GTOEuoqVxY4o4GjKw10hCg', NULL, 1900000000);
INSERT INTO "busca" ("rowid", "tipo", "ref", "ctx", "titulo", "corpo") VALUES (1, 'rover', 'rvr_GTOEuoqVxY4o4GjKw10hCg', NULL, 'antiga.pipa antiga.pipa', 'Fixture.   ');
INSERT INTO "busca" ("rowid", "tipo", "ref", "ctx", "titulo", "corpo") VALUES (2, 'rover', 'rvr_Xd-PRp_mqpHiiYqqBeVenQ', NULL, 'antigo.zeca antigo.zeca', 'Fixture.   ');
INSERT INTO "busca" ("rowid", "tipo", "ref", "ctx", "titulo", "corpo") VALUES (3, 'comunidade', 'ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', 'ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', 'Comunidade antiga', 'Um lugar rovers');
INSERT INTO "busca" ("rowid", "tipo", "ref", "ctx", "titulo", "corpo") VALUES (4, 'topico', 'ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE', 'ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', 'Tópico antigo', 'Texto do tópico antigo. ');
INSERT INTO "placar" ("id", "tipo", "autor", "ctx", "em", "acima", "abaixo", "reacoes", "respostas", "pontos", "quente") VALUES ('ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4', 'postagem', 'rvr_GTOEuoqVxY4o4GjKw10hCg', NULL, 1900000000, 0, 0, 1, 1, 1, 4444.444444444444);
INSERT INTO "placar" ("id", "tipo", "autor", "ctx", "em", "acima", "abaixo", "reacoes", "respostas", "pontos", "quente") VALUES ('ob_kvBU7KAlvdf9fa1SUQBkHnCl-kRGUmnRu1QzRbwUTEE', 'topico', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 'ob_6dkp7OZxveV_QiQDGpzID17QdWKsJMLUxZehqbwRIN8', 1900003601, 0, 0, 0, 1, 0, 4444.524466666667);
INSERT INTO "karma_diario" ("para", "dia", "de", "bruto") VALUES ('rvr_GTOEuoqVxY4o4GjKw10hCg', 21990, 'rvr_Xd-PRp_mqpHiiYqqBeVenQ', 1);
INSERT INTO "midia" ("hash", "formato", "largura", "altura", "bytes", "recebida_em") VALUES ('0574754107de5caefebb15cb58b80180868e9b62ab67a6f22ceffca79ebc15f0', 'png', 4, 4, 71, 1900003601);
INSERT INTO "midia_envios" ("id", "hash", "uid", "em") VALUES (1, '0574754107de5caefebb15cb58b80180868e9b62ab67a6f22ceffca79ebc15f0', 'rvr_GTOEuoqVxY4o4GjKw10hCg', 1900003601);
INSERT INTO "imagens" ("id", "autor", "hash", "uso", "alvo", "ordem", "formato", "largura", "altura", "bytes", "alt") VALUES ('ob_-wrS730iJ5ddC7OLwduSj5Cn_DVEQauwPKp27Q3pMUg', 'rvr_GTOEuoqVxY4o4GjKw10hCg', '0574754107de5caefebb15cb58b80180868e9b62ab67a6f22ceffca79ebc15f0', 'anexo', 'ob_WgSlZvxxuWgCWTxbXOeu8UbDdZtkRjygd9yCguE32A4', 0, 'png', 4, 4, 71, 'Anexo antigo.');
