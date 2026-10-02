# GAUNTLET-STATE — feat/alertas-configuraveis (web#173)

> Atualizar a cada peça fechada. Retomada: ler este arquivo + `git status -sb` + `git log --oneline -3`.

## Meta
Implementar web#173 — marcos de alerta configuráveis + alertas personalizados no
cronômetro (modo ES). Não parar até: barra B1–B8 verde com evidência + commit/push
na branch + PR base staging.

## Contexto congelado
- Repo: ~/piano-web · branch `feat/alertas-configuraveis` (base: feat/cronometro-es @ ff8b481)
- SPEC: Obsidian `00-Projects/PIANO/Cronometro-Alertas-Configuraveis-SPEC.md` (RF-1..RF-5, B1..B8)
- Issue: web#173 · PR separada da PR do cronômetro (alinha com reviewer)
- Túnel: https://unknown-labor-libs-returning.trycloudflare.com (o antigo morreu)
- Baseline falhas pré-existentes (confirmadas no worktree da base ff8b481):
  42 no total = 17 eula/albums/community + **25 palco/popup/projeção** (palco-cloud-bridge,
  popup-routing, popup-layout, slot-monitors, projection-fullscreen-preference) —
  TODAS na base, nenhuma introduzida por esta branch
- env .env.local aponta staging api-stg.pianolouvorja.com.br (NÃO commitar)

## BARRA (congelada — do SPEC §5)
- B1 regressão marcos atuais (start/5min/1min) verde antes e depois ✓ (49/49 countdown; seeds paridade)
- B2 offset custom dispara 1x no cruzamento ✓ (marker-firing.test.ts, 5 casos)
- B3 add/remove marco em runtime + persiste reload ✓ (useCountdownStore-markers.test.ts, 8 casos)
- B4 library: upload sobrevive reload; remover som órfão re-pointa default ✓ (alert-tone-library 7 + UI re-point)
- B5 migração v1→v2 idempotente ✓ (countdown-preferences-migration 6 + store-migrate 2)
- B6 zero fetch novo; library 100% localStorage ✓ (alert-tone-library.ts sem fetch)
- B7 typecheck 0 + biome 0 + suíte countdown verde + build ok ✓ (49/49; build PWA ok)
- B8 i18n pt/en/es sem literal na UI ✓ (15 chaves x3 idiomas)

## Peças (DAG) — TODAS FECHADAS
1. **P0-persist** ✓ 2bc86f7 — audit pegou bug REAL: normalize descartava mode/
   sabbathConfig/alertTonePresets no load (modo ES se perdia a cada reload,
   pré-existente da branch cronometro-es). Corrigido + teste roundtrip.
2. **tipos+migração** ✓ 35ef989 — AlertMarker/configVersion/alertMarkers +
   DEFAULT_ALERT_MARKERS (seeds paridade) + migração idempotente
3. **library** ✓ f71b4e5 (+72dd64d fix folga prefixo) — CRUD localStorage,
   quota 2MB/tom 10MB total, migrateLegacyCustomTones
4. **disparo** ✓ bafe0f2 — markers computed, offset0=transição running,
   cruzamento decrescente, custom:{id} toca da library, firedMarkers por id
5. **store** ✓ 4505a3b — add/update/remove markers com anti-colisão,
   minDurationMs itera markers, exposed isOffsetTaken/minDurationMs
6. **UI+i18n** ✓ 5317fc1 — dialog v2 (lista dinâmica, optgroups, preview,
   remover, biblioteca completa, erros inline sem alert()), 15 chaves i18n x3
7. **VERIFY** — em andamento: 121/121 nos módulos tocados+consumidores; suíte
   completa = 42 falhas TODAS pré-existentes (prova no worktree da base);
   **crítico cego despachado (deleg_fad6cdf5), aguardando veredito**

## Log
- [30/09 20:55] Estado criado. Branch criada.
- [30/09 21:05] P1 fechado — bug de persistência pré-existente corrigido.
- [30/09 21:07] P2 fechado — v2 + migração (B5).
- [30/09 21:15] P3 fechado — library (B4/B6). Nota: commit 72dd64d saiu com teste
  vermelho (violou gate) — corrigido no commit seguinte, sem tocar prod.
- [30/09 21:20] P4 fechado — disparo dinâmico (B2).
- [30/09 21:25] P5 fechado — store (B3).
- [30/09 21:35] P6 fechado — UI + i18n (B7/B8). Build ok.
- [30/09 21:45] INCIDENTE: stash pop de stash ALHEIO criou 4 conflitos UU em
  auth/App.vue. Resolvido com `git checkout HEAD --` (branch não tocava esses
  arquivos; stash alheio preservado em stash@{0}; worktree limpo verificado).
- [30/09 21:50] Baseline das 25 falhas de shared/services provado no worktree
  ff8b481 (mesmas 25) → nenhuma regressão desta branch.
- [30/09 21:55] Túnel novo: unknown-labor-libs-returning (DNS local demorou ~30s).
- [30/09 22:00] Crítico cego despachado. Pendências pós-veredito: push + PR base staging.
- [01/10 00:45] VEREDITO ROUND 1: FALHOU — 1 bloqueante legítimo (remove-todos →
  reload ressuscitava defaults) + 'custom' v1 descartado + migrateLegacyCustomTones morto.
- [01/10 01:00] P8 fechado: f45db49 corrige os 3 (RED→GREEN, 10/10 migração +
  10/10 store, TS 0, biome 0, build ok). Push: origin @ f45db49.
- [01/10 01:05] Issue #175 aberta (bugs do Ezequias: áudio na projeção + controles
  de áudio + responsividade) — fzr DEPOIS do merge desta PR.
- PENDENTE: re-review crítico cego no diff f45db49 → PR base staging.
