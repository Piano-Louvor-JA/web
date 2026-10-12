import { nextTick } from 'vue'
import { beforeEach, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { DEFAULT_STAGE_SETTINGS } from '@modules/settings/types/stage-settings'
import { DEFAULT_MEDIA_PROJECTION } from '../types/media'
import { MEDIA_RUNTIME_STORAGE_KEY } from '../services/media-runtime'
import MediaProjectionView from '../views/MediaProjectionView.vue'

const overrides = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@modules/settings/services/stage-settings-runtime', () => ({
  readEffectiveStageSettings: () => ({ ...DEFAULT_STAGE_SETTINGS, ...overrides.value }),
  subscribeStageSettings: () => () => {},
}))
beforeEach(() => {
  localStorage.clear()
  overrides.value = {}
  localStorage.setItem(MEDIA_RUNTIME_STORAGE_KEY, JSON.stringify({ ...DEFAULT_MEDIA_PROJECTION, lyric: 'Minha estrofe', isCover: false }))
})

it('aplica overrides na estrofe renderizada', async () => {
  overrides.value = { lyricFontSize: 150, lyricFontWeight: 400, lyricTextColor: '#00C1E6', lyricUpperCase: true, lyricTextShadow: false }
  const wrapper = mount(MediaProjectionView)
  await nextTick()
  const lyric = wrapper.get('.media-projection__lyric').element as HTMLElement
  expect(lyric.style.fontSize).toBe('7.8125cqw')
  expect(lyric.style.fontWeight).toBe('400')
  expect(lyric.style.color).toBe('rgb(0, 193, 230)')
  expect(lyric.style.textTransform).toBe('uppercase')
  expect(lyric.style.textShadow).toBe('none')
  wrapper.unmount()
})

it('herda os campos gerais quando overrides são nulos', async () => {
  overrides.value = { fontSize: 120, fontWeight: 800, textColor: '#FF0000', textShadow: false }
  const wrapper = mount(MediaProjectionView)
  await nextTick()
  const lyric = wrapper.get('.media-projection__lyric').element as HTMLElement
  expect(lyric.style.fontSize).toBe('6.25cqw')
  expect(lyric.style.fontWeight).toBe('800')
  expect(lyric.style.color).toBe('rgb(255, 0, 0)')
  expect(lyric.style.textShadow).toBe('none')
  wrapper.unmount()
})
