import { createPinia, setActivePinia } from 'pinia'
import { defineComponent } from 'vue'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'

import { useMediaStore } from '../stores/useMediaStore'
import { publishMediaRuntime } from '../services/media-runtime'
import { useMediaPlayerHotkeys } from './useMediaPlayerHotkeys'

const { audio } = vi.hoisted(() => ({
  audio: { currentTime: 0, duration: 90, volume: 1, paused: false },
}))
vi.mock('../services/media-audio', async (original) => ({
  ...await original<typeof import('../services/media-audio')>(),
  getMediaAudioElement: () => audio,
  fadeInMediaAudio: async () => { audio.paused = false; return true },
  fadeVolumeMediaAudio: async () => {},
  pauseMediaAudio: () => { audio.paused = true },
}))
vi.mock('../services/media-runtime', () => ({
  publishMediaRuntime: vi.fn(), clearMediaRuntime: vi.fn(),
}))
vi.mock('../services/custom-catalog', () => ({ resolveMediaTrack: vi.fn() }))
vi.mock('@shared/services/palco-cloud-bridge', () => ({ publishToStageRelay: vi.fn() }))

enableAutoUnmount(afterEach)
const Host = defineComponent({ setup() { useMediaPlayerHotkeys(); return () => null } })

function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useMediaStore()
  store.session = {
    musicId: 1, albumId: null, title: 'Hino', subtitle: '', mode: 'audio',
    coverUrl: null, audioUrl: 'https://example.test/hino.wav', hasInstrumental: true,
    slideTimesSec: [0, 12, 30],
    slides: [0, 12, 30].map((time, order) => ({
      order, lyric: `Estrofe ${order}`, showSlide: true, time: String(time),
      instrumentalTime: String(time), imageUrl: null, imagePosition: null, isCover: order === 0,
    })),
  }
  store.status = 'playing'
  store.minimized = true
  const wrapper = mount(Host, { global: { plugins: [pinia] } })
  return { store, wrapper, pinia }
}

function key(key: string, options: KeyboardEventInit = {}, target: EventTarget = document.body) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options })
  target.dispatchEvent(event)
  return event
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.assign(audio, { currentTime: 0, paused: false, volume: 1 })
})
afterEach(() => { document.body.innerHTML = '' })

describe('HK-1: teclado do operador com store real', () => {
  it.each(['playing', 'paused'] as const)('navega estrofes e sincroniza áudio mantendo %s', async (status) => {
    const { store } = setup()
    store.status = status
    audio.paused = status === 'paused'
    expect(key('ArrowRight').defaultPrevented).toBe(true)
    await flushPromises()
    expect(store.slideIndex).toBe(1)
    expect(store.currentTimeSec).toBe(12)
    expect(audio.currentTime).toBe(12)
    expect(store.status).toBe(status)
    expect(audio.paused).toBe(status === 'paused')
    expect(publishMediaRuntime).toHaveBeenLastCalledWith(expect.objectContaining({ slideIndex: 1, lyric: 'Estrofe 1' }))
    key('ArrowRight'); key('ArrowRight')
    expect(store.slideIndex).toBe(2)
    expect(audio.currentTime).toBe(30)
    key('ArrowLeft'); key('ArrowLeft'); key('ArrowLeft')
    expect(store.slideIndex).toBe(0)
    expect(audio.currentTime).toBe(0)
  })

  it('Espaço pausa e retoma sem scroll, inclusive no miniplayer', async () => {
    const { store } = setup()
    expect(key(' ').defaultPrevented).toBe(true)
    await flushPromises()
    expect(store.status).toBe('paused')
    expect(audio.paused).toBe(true)
    expect(key(' ').defaultPrevented).toBe(true)
    await flushPromises()
    expect(store.status).toBe('playing')
    expect(audio.paused).toBe(false)
  })

  it('segurar Espaço não alterna repetidamente nem rola a página', async () => {
    const { store } = setup()
    key(' ')
    expect(key(' ', { repeat: true }).defaultPrevented).toBe(true)
    await flushPromises()
    expect(store.status).toBe('paused')
  })

  it.each(['ctrlKey', 'metaKey', 'altKey', 'shiftKey'])('preserva combinações com %s', (modifier) => {
    const { store } = setup()
    for (const name of ['ArrowLeft', 'ArrowRight', ' ', 'p']) {
      expect(key(name, { [modifier]: true }).defaultPrevented).toBe(false)
    }
    expect(store.slideIndex).toBe(0)
    expect(store.status).toBe('playing')
  })

  it.each([
    '<input>', '<textarea></textarea>', '<select><option>Um</option></select>',
    '<input type="range">', '<button>Botão</button>', '<a href="#">Link</a>',
    '<div contenteditable="true"><span>Texto</span></div>', '<div role="textbox" tabindex="0">Texto</div>',
  ])('preserva edição e teclado nativo de %s', (html) => {
    const { store } = setup()
    document.body.innerHTML = html
    const target = document.querySelector('span') ?? document.body.firstElementChild!
    for (const name of ['ArrowRight', ' ']) expect(key(name, {}, target).defaultPrevented).toBe(false)
    expect(store.slideIndex).toBe(0)
    expect(store.status).toBe('playing')
  })

  it('preserva composição, evento já tratado, diálogos e teclas desconhecidas', () => {
    const { store } = setup()
    expect(key('ArrowRight', { isComposing: true }).defaultPrevented).toBe(false)
    const handled = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true, bubbles: true })
    handled.preventDefault()
    document.body.dispatchEvent(handled)
    expect(key('Escape').defaultPrevented).toBe(false)
    document.body.innerHTML = '<div role="dialog"></div>'
    expect(key('ArrowRight').defaultPrevented).toBe(false)
    expect(store.slideIndex).toBe(0)
  })

  it.each(['idle', 'loading', 'error'] as const)('não captura durante %s', (status) => {
    const { store } = setup()
    store.status = status
    expect(key('ArrowRight').defaultPrevented).toBe(false)
    expect(key(' ').defaultPrevented).toBe(false)
  })

  it('não captura sem sessão; Espaço também não captura sem áudio ou em modo sem áudio', () => {
    const { store } = setup()
    store.session!.mode = 'no_audio'
    expect(key(' ').defaultPrevented).toBe(false)
    store.session!.mode = 'audio'
    store.session!.audioUrl = ''
    expect(key(' ').defaultPrevented).toBe(false)
    store.session = null
    expect(key('ArrowRight').defaultPrevented).toBe(false)
    expect(key(' ').defaultPrevented).toBe(false)
  })

  it('impede que a mesma seta navegue também outro módulo', () => {
    setup()
    const otherModule = vi.fn()
    window.addEventListener('keydown', otherModule)
    try {
      key('ArrowRight')
      expect(otherModule).not.toHaveBeenCalled()
      key('x')
      expect(otherModule).toHaveBeenCalledOnce()
    } finally { window.removeEventListener('keydown', otherModule) }
  })

  it('remove o listener ao desmontar, sem duplicar quando monta novamente', () => {
    const { store, wrapper, pinia } = setup()
    wrapper.unmount()
    expect(key('ArrowRight').defaultPrevented).toBe(false)
    mount(Host, { global: { plugins: [pinia] } })
    key('ArrowRight')
    expect(store.slideIndex).toBe(1)
  })
})
