// @vitest-environment node
import { expect, it, vi } from 'vitest'
vi.mock('@shared/services/popup-routing', () => ({ getPopupRoute: vi.fn() }))
vi.mock('@modules/settings/services/stage-settings-runtime', () => ({ readEffectiveStageSettings: vi.fn() }))
vi.mock('@modules/settings/types/stage-settings', () => ({ resolveBackgroundImage: vi.fn() }))
it('publicar sem window é um no-op', async () => {
  const { publishToStageRelay } = await import('../palco-cloud-bridge')
  expect(() => publishToStageRelay('bible', {})).not.toThrow()
})
