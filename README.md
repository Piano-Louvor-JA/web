# LouvorJA - PIANO (Web)

![CI](https://img.shields.io/github/actions/workflow/status/Piano-Louvor-JA/web/ci.yml?branch=main&label=CI)
![Security](https://img.shields.io/github/actions/workflow/status/Piano-Louvor-JA/web/security.yml?branch=main&label=security)
![Release](https://img.shields.io/github/v/release/Piano-Louvor-JA/web?include_prereleases)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-browser-lightgrey)

Aplicação web para gerenciamento de culto — músicas, bíblia, utilitários e projeção.

Este projeto é um fork de recursos em relação ao app Louvor JA ([app.louvorja.com.br](https://app.louvorja.com.br/), [github.com/louvorja/app](https://github.com/louvorja/app)), onde as principais ferramentas são migradas e adaptadas para as tecnologias usadas neste projeto.

O **LouvorJA - PIANO**, além de incluir os recursos do App Louvor JA, vai incorporar ao longo do desenvolvimento outras funcionalidades voltadas ao contexto ministerial e educacional.

Pacote: `louvorja-piano-web` · Plataforma: navegador.

---

## Versões do produto

O LouvorJA - PIANO existe em **duas linhas de entrega**:

| Versão | Escopo | Este repositório |
|--------|--------|------------------|
| **Electron (desktop)** | App nativo para Windows, macOS e Linux | Não |
| **Web** | Aplicação exclusiva para navegador | **Sim** |

Este README cobre apenas a **versão Web**. A versão Electron é um projeto separado, com shell desktop.

---

## Qualidade

CI em 4 portões: **Lint** (Biome) · **Type Check** · **Unit Tests** (Vitest) · **Build** — mais um **Regression Gate** anti-regressão. Security scan (gitleaks + npm audit) em todo PR.

---

## Roadmap (além do Louvor JA)

| Área | Exemplos |
|------|----------|
| **Agenda ministerial** | Escalas e gestão de cargos no âmbito distrital — pregação, músicas, eventos, escala pastoral, etc. |
| **Jogos bíblicos** | Atividades para adultos, crianças, Desbravadores e Aventureiros |
| **Estudos bíblicos** | Conteúdo e fluxos de estudo |
| **Outros** | Novos recursos conforme a evolução do produto |

---

## Stack

- Vue 3 (Composition API) + TypeScript
- Vite
- Pinia · Vue Router · Vue I18n
- Vuetify (componentes ricos) · Tailwind CSS (layout)
- Design system próprio (`src/design-system/`)
- Testes: Vitest

---

## Arquitetura

Separação clara entre **aplicação Vue** e **features modulares** (sem processo Electron).

```
src/                      → aplicação Vue
  design-system/          → linguagem visual (tokens, temas, primitivas)
  layouts/                → shell da UI (header + dock + RouterView)
  modules/                → features isoladas por domínio
  shared/                 → código compartilhado NÃO visual
  router/                 → agrega as rotas de cada módulo
  plugins/ locales/ styles/ assets/
```

### Camadas

| Camada | Responsabilidade |
|--------|------------------|
| `design-system/` | Tokens, temas, glass, dock, backgrounds — sem regra de negócio |
| `layouts/` | Compõe o design system e hospeda as páginas |
| `modules/` | Funcionalidades (home, bible, liturgy, clock, draw, timer, settings) |
| `shared/` | Utilitários, services e widgets de domínio reutilizáveis |
| `router/` | Registra `routes.ts` de cada módulo |

### Contrato de um módulo

Cada feature em `src/modules/<nome>/` segue o mesmo formato:

```
modules/<nome>/
├── components/
├── composables/
├── services/
├── stores/       # Pinia do módulo
├── types/
├── locales/
├── views/
└── routes.ts     # exportado para o router global
```

Fluxo: **módulo exporta rotas** → **router agrega** → **layout renderiza via `<RouterView />`**.

### Design system

- Temas: Ethereal Lumens (escuro) e Luminous Clarity (claro)
- Navegação principal: footer estilo macOS Dock
- Primitivas: `GlassCard`, `DockFooter`, `GradientBackground`, …
- Tailwind **só para layout** · Vuetify **para componentes ricos**
- Alias: `@design-system` — módulos não reimplementam glass/dock/gradient

### Aliases principais

`@` · `@modules` · `@shared` · `@design-system` · `@layouts` · `@plugins` · `@themes` · `@styles` · `@locales` · `@assets`

---

## Começar

Requisito: Node.js `^22.18.0` ou `>=24.12.0`

```bash
npm install
npm run dev              # browser
```

---

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento no browser (porta 5173) |
| `npm run host` | Vite na rede local |
| `npm run build` | Type-check + build de produção |
| `npm run preview` | Preview do build no browser |
| `npm run test` | Suite de testes (Vitest) |
| `npm run version:patch` | Sobe patch (`1.0.0` → `1.0.1`), commit + tag `vX.Y.Z` |
| `npm run version:minor` | Sobe minor (`1.0.0` → `1.1.0`), commit + tag |
| `npm run version:major` | Sobe major (`1.0.0` → `2.0.0`), commit + tag |
| `npm run git:publish` | Push do branch atual + tags |
| `npm run git:tag` | Cria/envia só a tag da versão atual do `package.json` (se ainda não existir) |

### Versionamento

```bash
npm run version:patch   # ou :minor / :major
npm run git:publish     # envia commit e tags ao remoto
```

Aliases: `version:bug` → patch · `version:min` → minor · `version:max` → major.

---

## Contribuir

Branch default: `main`. PRs passam por lint, type-check, testes, build e regression gate antes do merge.

---

## Licença

Licença [MIT](LICENSE.md) — LouvorJA - PIANO.
