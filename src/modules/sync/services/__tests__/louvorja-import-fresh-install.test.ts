// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
	clear: () => storage.clear(),
	getItem: (key: string) => storage.get(key) ?? null,
	setItem: (key: string, value: string) => storage.set(key, value),
	removeItem: (key: string) => storage.delete(key),
});

const { getUserPreferenceMock, setUserPreferenceMock } = vi.hoisted(() => ({
	getUserPreferenceMock: vi.fn(),
	setUserPreferenceMock: vi.fn(),
}));

vi.mock("@shared/services/user-preferences", () => ({
	getUserPreference: getUserPreferenceMock,
	setUserPreference: setUserPreferenceMock,
}));

import {
	importLouvorjaIntoBrowser,
	SYNC_MODIFIED_PREFIX,
} from "@modules/sync/services/louvorja-adapter";
import type { LouvorjaSyncPackage } from "@modules/sync/services/louvorja-package";
import { USER_PREFERENCE_KEYS } from "@shared/constants/storage-keys";

const FUTURE = "2099-01-01T00:00:00.000Z";

function saturdayPackage(): LouvorjaSyncPackage {
	return {
		schema: 1,
		appVersion: "test",
		platform: "desktop",
		exportedAt: FUTURE,
		entities: {
			liturgy: {
				type: "liturgy",
				modified: FUTURE,
				data: {
					saturday: {
						items: [
							{
								id: "cat-1",
								type: "category",
								name: "Culto",
								subtitle: "",
								done: false,
								durationMs: 0,
								accentColor: "#FFD600",
								startTime: "10:30",
								endTime: "12:00",
							},
							{
								id: "m-1",
								type: "music",
								name: "Hino",
								subtitle: "",
								done: false,
								durationMs: 0,
								accentColor: "#00E676",
								categoryId: "cat-1",
								musicId: 2000,
								musicMode: "audio",
							},
						],
						notes: "Nota do sábado",
					},
				},
			},
		},
	} as unknown as LouvorjaSyncPackage;
}

// Fresh install: nunca abriu a página Liturgia — liturgy.state é null.
describe("import .louvorja em fresh install hidrata liturgy.state ausente (t_cc016ef6)", () => {
	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
		getUserPreferenceMock.mockReturnValue(null);
		setUserPreferenceMock.mockImplementation(() => {});
	});

	it("RED: pacote com saturday é aplicado — applied contém 'liturgy' e state persistido tem os itens", () => {
		const result = importLouvorjaIntoBrowser(saturdayPackage());

		expect(result.applied).toContain("liturgy");
		expect(result.skipped).not.toContain("liturgy");

		const persisted = setUserPreferenceMock.mock.calls.find(
			([key]) => key === USER_PREFERENCE_KEYS.liturgyState,
		)?.[1] as Record<string, unknown> | undefined;
		expect(persisted).toBeDefined();
		const saturday = (persisted?.weekdays as Record<string, unknown[]>)
			?.saturday;
		expect(Array.isArray(saturday)).toBe(true);
		expect(saturday).toHaveLength(2);
		expect((saturday?.[0] as { name?: string }).name).toBe("Culto");
		expect(
			(persisted?.dayNotes as Record<string, string>)?.saturday,
		).toBe("Nota do sábado");
		// Estado padrão completo: customLiturgies vazio e deletionLocks vazio.
		expect(persisted?.customLiturgies).toEqual([]);
		expect(persisted?.deletionLocks).toEqual({});
		expect(persisted?.daySessionTimes).toBeDefined();

		// sync.modified.v1.liturgy é escrito com o modified do pacote.
		expect(
			localStorage.getItem(`${SYNC_MODIFIED_PREFIX}.liturgy`),
		).toBe(FUTURE);
	});

	it("RED: dados do pacote vazios/inválidos (sem dias) continua sendo skip", () => {
		const pkg = saturdayPackage();
		(
			pkg.entities.liturgy as { data: Record<string, unknown> }
		).data = {};

		const result = importLouvorjaIntoBrowser(pkg);

		expect(result.applied).not.toContain("liturgy");
		expect(result.skipped).toContain("liturgy");
	});
});
