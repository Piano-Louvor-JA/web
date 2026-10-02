# Mutation Score — como interpretar

Config: `stryker.config.json` (FINAL, baseline MUT-3). Gate de diff: `scripts/mutation-diff.mjs` + job CI `mutation-score`.

## Como o gate funciona

O job `mutation-score` roda **só nos arquivos .ts do diff do PR** que caem nos globos
`mutate` da config (settings, clock, random, timer, shared services/composables, albums
services). Full tree em CI é inviável (10.895 mutantes ≈ 2,5h+).

- **<50%** = `::error::` e exit 1 → **FAIL** (bloqueante)
- **<80%** = `::warning::` → WARNING (não bloqueia o merge)
- **≥80%** = OK
- Diff não toca arquivos do escopo → skip com notice (não roda Stryker)

Fase 1: o job inteiro está com `continue-on-error: true` (warning apenas). Para tornar o
<50% realmente bloqueante, remover essa linha do job no `ci.yml`.

## Como interpretar survivors

Um mutant **Survived** não é automaticamente teste ruim. Na ordem:

1. **Equivalent mutant** — a mudança não altera o comportamento observável
   (ex: `const` → `let`, reordenação de declaração sem efeito, `===` entre tipos
   sempre iguais). Não existe teste que mate. **Documentar** no PR ou no comentário
   do survivor e seguir — equivalente provado conta como "morto" para a meta.

2. **Defensive guard** — código de proteção contra estados impossíveis no fluxo
   atual (ex: fallback se API retorna null que o interceptor já garante). Matar
   exigiria mock artificial que testa o mock. **Documentar** como defensive-guard.

3. **Survivor real** — o teste passa com o bug injetado = **gap de assertion**.
   Corrigir adicionando/reforçando assertion no teste. Este é o alvo real do gate.

### Meta acordada (Rafael)

**≥95% por módulo**, onde score efetivo = (killed + equivalents/defensive-guards
documentados) / total. Os ~3.053 survivors do baseline MUT-3 full são majoritariamente
equivalents/defensive-guards a documentar módulo a módulo (ver killplanes doc inline
do gauntlet) — o score bruto do Stryker NÃO é a métrica da meta.

## Baseline incremental

`reports/stryker-incremental.json` é gerado pelo Stryker (`incremental: true` na config)
e acelera runs seguintes (só re-testa código alterado). O arquivo foi commitado vazio na
fase 1: o primeiro `stryker run` local (full) o popula. **Não deletar** — é o cache do gate.

## Rodando local

```bash
npm run test:mutation                     # full tree (lento, ~2-3h) — popula o incremental
node scripts/mutation-diff.mjs            # só o diff vs origin/staging (rápido)
node scripts/mutation-diff.mjs --base main # outra base
```

**NUNCA rodar 2 Strykers simultâneos nesta máquina** (55% RAM cada — earlyoom mata o desktop).
