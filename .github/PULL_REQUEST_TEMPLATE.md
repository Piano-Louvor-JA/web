<!--
  PR Template — pianolouvorja/web
  Base: SEMPRE `staging` (DEPLOY.md). main só via PR de staging.
  Uma PR única quando a funcionalidade INTEIRA estiver pronta (F0..F5) — NÃO uma PR por fase.
  Commits por fase dentro da branch feat/...
-->

## 📋 Descrição
<!-- O que muda e por quê. Link para issue/spec se houver. -->

## ✅ Checklist de Qualidade (obrigatório)
- [ ] `npm run lint` passa
- [ ] `npm run type-check` passa
- [ ] `npm run build` passa
- [ ] `npm run test` passa (cobertura ≥ threshold)
- [ ] Testes de mutação (`npm run test:mutation`) — score ≥ 80% ou justificativa
- [ ] **Evidência de Regressão** preenchida abaixo

## 🔁 Evidência de Regressão (obrigatório — anti-regressão)
| Métrica | Baseline (staging) | Pós-mudança (esta PR) |
|---------|-------------------|----------------------|
| Testes passed | | |
| Testes failed | | |
| Type-check | OK / FAIL | OK / FAIL |
| Build | OK / FAIL | OK / FAIL |

**Como obter:**
```bash
# 1. Em staging (baseline)
git checkout staging && git pull
npm run test:regression -- --baseline

# 2. Na branch da PR (comparação)
git checkout feat/sua-branch
npm run test:regression -- --compare
```
Cole os números acima. Se houver regressão → **PR não passa no CI** (gate `regression-gate`).

## 🎯 Consumidores impactados (paridade web↔app↔APK)
- [ ] Nenhum (mudança isolada)
- [ ] `pianolouvorja/app` (desktop Electron) — módulos: ____
- [ ] `pianolouvorja/apk` (Flutter) — módulos: ____
- [ ] `pianolouvorja/api` (Hono) — endpoints: ____
- [ ] Outro: ____

## 📸 Evidência visual (se UI/UX)
| Antes | Depois |
|-------|--------|
| ![antes](url) | ![depois](url) |

## 🧪 Como testar localmente
```bash
# passos para reproduzir/validar
```

---

> **Lembrete:** Paridade literal com `~/pianolouvorja/app` (F0..F5). Testes com música SACRA IASD (Athus, Vox, Arautos). Botões devem PARECER botões (borda/fundo). Fullscreen automático sem chrome/overlays.
