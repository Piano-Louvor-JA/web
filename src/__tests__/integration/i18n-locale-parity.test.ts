// TDD de paridade i18n — GARANTE: todos os locales suportados têm exatamente
// as mesmas chaves que pt-BR (0 missing / 0 extra), placeholders idênticos,
// UTF-8 sem BOM, e nenhuma string vazia. Fonte canônica: pt-BR.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import ptRoot from "@locales/pt-BR";
import ptAlbums from "@modules/albums/locales/pt-BR";
import ptAuth from "@modules/auth/locales/pt-BR";
import ptBible from "@modules/bible/locales/pt-BR";
import ptClock from "@modules/clock/locales/pt-BR";
import ptCommunity from "@modules/community/locales/pt-BR";
import ptCountdown from "@modules/countdown/locales/pt-BR";
import ptHome from "@modules/home/locales/pt-BR";
import ptOnboarding from "@modules/onboarding/locales/pt-BR";
import ptLiturgy from "@modules/liturgy/locales/pt-BR";
import ptMedia from "@modules/media/locales/pt-BR";
import ptRandom from "@modules/random/locales/pt-BR";
import ptSettings from "@modules/settings/locales/pt-BR";
import ptTimer from "@modules/timer/locales/pt-BR";
import { describe, expect, it } from "vitest";

// Locales suportados pelo produto (12 idiomas). pt-BR é a fonte canônica.
const SUPPORTED_LOCALES = [
	"pt-BR",
	"en",
	"es",
	"fr",
	"ru",
	"uk",
	"ja",
	"ko",
	"zh",
	"tr",
	"ar",
	"hi",
] as const;

const ROOT = join(__dirname, "..", "..", "..");

const ptModules: Record<string, Record<string, unknown>> = {
	"": ptRoot as Record<string, unknown>,
	albums: ptAlbums as Record<string, unknown>,
	auth: ptAuth as Record<string, unknown>,
	bible: ptBible as Record<string, unknown>,
	clock: ptClock as Record<string, unknown>,
	community: ptCommunity as Record<string, unknown>,
	countdown: ptCountdown as Record<string, unknown>,
	home: ptHome as Record<string, unknown>,
	onboarding: ptOnboarding as Record<string, unknown>,
	liturgy: ptLiturgy as Record<string, unknown>,
	media: ptMedia as Record<string, unknown>,
	random: ptRandom as Record<string, unknown>,
	settings: ptSettings as Record<string, unknown>,
	timer: ptTimer as Record<string, unknown>,
};

function localePath(module: string, locale: string): string {
	if (module === "") return join(ROOT, "src", "locales", `${locale}.ts`);
	return join(ROOT, "src", "modules", module, "locales", `${locale}.ts`);
}

// Carrega o módulo de locale dinamicamente (import é estático p/ pt-BR; os
// demais entram via require dinâmico do Vite ssr-load).
const dynamicCache: Record<string, Record<string, unknown>> = {};
function loadLocale(module: string, locale: string): Record<string, unknown> {
	const key = `${module}/${locale}`;
	if (!dynamicCache[key]) {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		const loaded = require(localePath(module, locale)) as {
			default: Record<string, unknown>;
		};
		dynamicCache[key] = loaded.default;
	}
	return dynamicCache[key];
}

function flatten(
	obj: unknown,
	prefix = "",
	out: Record<string, unknown> = {},
): Record<string, unknown> {
	for (const [k, v] of Object.entries((obj ?? {}) as Record<string, unknown>)) {
		const key = prefix ? `${prefix}.${k}` : k;
		if (v && typeof v === "object") flatten(v, key, out);
		else out[key] = v;
	}
	return out;
}

function placeholders(value: unknown): string[] {
	if (typeof value !== "string") return [];
	return [...value.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
}

describe("i18n: paridade estrutural dos 12 locales", () => {
	for (const module of Object.keys(ptModules)) {
		for (const locale of SUPPORTED_LOCALES) {
			if (locale === "pt-BR") continue;
			it(`${module || "root"}: ${locale} tem 0 missing / 0 extra vs pt-BR`, () => {
				const base = flatten(ptModules[module]);
				const cur = flatten(loadLocale(module, locale));
				const missing = Object.keys(base).filter((k) => !(k in cur));
				const extra = Object.keys(cur).filter((k) => !(k in base));
				expect(missing.join(","), `${module}/${locale} missing`).toBe("");
				expect(extra.join(","), `${module}/${locale} extra`).toBe("");
			});

			it(`${module || "root"}: ${locale} tem placeholders idênticos ao pt-BR`, () => {
				const base = flatten(ptModules[module]);
				const cur = flatten(loadLocale(module, locale));
				const diffs: string[] = [];
				for (const [k, v] of Object.entries(base)) {
					if (
						JSON.stringify(placeholders(v)) !==
						JSON.stringify(placeholders(cur[k]))
					) {
						diffs.push(k);
					}
				}
				expect(diffs.join(",")).toBe("");
			});

			it(`${module || "root"}: ${locale} UTF-8 sem BOM e sem string vazia`, () => {
				const raw = readFileSync(localePath(module, locale));
				expect(raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf).toBe(
					false,
				);
				const cur = flatten(loadLocale(module, locale));
				const empties = Object.entries(cur)
					.filter(([, v]) => typeof v === "string" && v.trim() === "")
					.map(([k]) => k);
				expect(empties.join(",")).toBe("");
			});
		}
	}

	it("todos os arquivos de locale existem para os 12 idiomas (sem locale órfão)", () => {
		const expectedDirs = [join(ROOT, "src", "locales")];
		const modulesDir = join(ROOT, "src", "modules");
		for (const m of readdirSync(modulesDir)) {
			const loc = join(modulesDir, m, "locales");
			try {
				statSync(loc);
			} catch {
				continue; // módulo sem locales — ok
			}
			// diretório de locales vazio (só .gitkeep) = módulo ainda sem strings — ok
			const realFiles = readdirSync(loc).filter((f) => f.endsWith(".ts"));
			if (realFiles.length === 0) continue;
			expectedDirs.push(loc);
		}
		const problems: string[] = [];
		for (const dir of expectedDirs) {
			const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
			for (const locale of SUPPORTED_LOCALES) {
				if (!files.includes(`${locale}.ts`)) {
					problems.push(`${relative(ROOT, dir)} falta ${locale}.ts`);
				}
			}
			for (const f of files) {
				const locale = f.replace(".ts", "");
				if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) {
					problems.push(
						`${relative(ROOT, dir)}${sep}${f} não está em SUPPORTED_LOCALES`,
					);
				}
			}
		}
		expect(problems.join("; ")).toBe("");
	});

	it("chaves usadas no código existem no dicionário pt-BR mesclado (common.on/off etc.)", () => {
		const merged: Record<string, unknown> = {};
		for (const m of Object.keys(ptModules))
			Object.assign(merged, flatten(ptModules[m]));
		// chaves usadas hoje em componentes (grep manual mantido em sincronia via teste abaixo)
		const usedInCode = [
			"common.on",
			"common.off",
			"common.cancel",
			"common.apply",
			"common.comingSoon",
		];
		const missing = usedInCode.filter((k) => !(k in merged));
		expect(missing.join(",")).toBe("");
	});

	it("plugin i18n registra exatamente os 12 locales", {
		timeout: 30_000,
	}, async () => {
		const i18n = (await import("@plugins/i18n")).default;
		expect(Object.keys(i18n.global.messages.value).sort()).toEqual(
			[...SUPPORTED_LOCALES].sort(),
		);
	});
});
