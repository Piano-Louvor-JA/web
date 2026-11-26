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

CI em 4 portões: **Lint** (Biome) · **Type Check** · **Unit Tests** (Vitest) · **Build** — mais um **Regression Gate** anti-regressão. Verificações de segurança (Gitleaks, npm audit e Semgrep) em todo PR.

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

Requisito: Node.js `^22.22.2`, `^24.15.0` ou `>=26.0.0`

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

## Identificação das chamadas à API

O `fetch` instalado no boot envia `X-Client-Platform: web`, a versão do build
em `X-Client-Version` e, quando configurado, o identificador revogável
`X-Partner-Key`. Esse identificador é próprio do web; não reutilize as chaves
do desktop ou do APK. `Api-Token` legado e `Authorization` da sessão continuam
independentes.

Configure `VITE_PARTNER_KEY_STG` para a API de staging e
`VITE_PARTNER_KEY_PROD` para produção. A URL efetiva da requisição seleciona a
chave; `VITE_PARTNER_KEY` é um override opcional para builds locais. Sem chave
configurada, o header é omitido. Somente as APIs HTTPS
`api-stg.pianolouvorja.com.br` e `api.pianolouvorja.com.br`, além de APIs locais
em `localhost`/`127.0.0.1`, recebem a chave configurada. Upstream, CDN,
Google/Firebase e requisições `no-cors` não recebem essa chave.

No GitHub, os secrets do repositório web são `PARTNER_KEY_STG` e
`PARTNER_KEY_PROD`. O build de CI usa apenas a chave e as URLs do ambiente
alvo: PR/push de staging usa staging; PR/push de main usa produção.
O deploy é gerenciado pela hospedagem: configure também nela as variáveis
`VITE_*` do ambiente correspondente antes de gerar o build publicado.
Secrets do GitHub não são repassados automaticamente à hospedagem.

O Vite incorpora os valores no JavaScript distribuído. A chave identifica o
parceiro nas métricas e permite revogação; ela não é uma credencial de usuário.
Uma chave desconhecida ou revogada enviada à API resulta em 401.

## Contribuir

Abra PRs de funcionalidades, correções e documentação para `staging`. A promoção para produção segue por PR de `staging` para `main`. Antes do merge, o CI valida lint, tipos, testes, build, contratos comuns app↔web, regressão e mutação do diff quando aplicável.

---

## Licença

Licença [MIT](LICENSE) — LouvorJA - PIANO.
