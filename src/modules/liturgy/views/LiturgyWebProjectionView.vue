<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'

import { syncPopupWindows } from '@shared/services/popup-windows'

import LiturgyWebControlBar from '../components/LiturgyWebControlBar.vue'
import { toggleLiturgyScreensFromControl } from '../services/liturgy-web-projection'
import { youtubeEmbedPlayerVars, youtubeVeilAfter } from '../services/youtube-embed'
import { useLiturgyVideoAutoclose } from '../composables/useLiturgyVideoAutoclose'
import {
  captureCurrentSurface,
  startSiteMirrorBroadcaster,
  startSiteMirrorViewer,
  type SiteMirrorBroadcaster,
  type SiteMirrorViewer,
} from '../services/liturgy-site-mirror'
import {
  DEFAULT_LITURGY_WEB_RUNTIME,
  LITURGY_SITE_SYNC_CHANNEL,
  LITURGY_WEB_RUNTIME_CHANNEL,
  LITURGY_WEB_RUNTIME_STORAGE_KEY,
  LITURGY_YT_SYNC_CHANNEL,
  normalizeLiturgySiteSync,
  normalizeLiturgyWebRuntime,
  normalizeLiturgyYtSync,
  patchLiturgyWebRuntime,
  publishLiturgySiteSync,
  publishLiturgyYtSync,
  readLiturgyWebRuntimeFromStorage,
  type LiturgySiteSyncPayload,
  type LiturgyWebProjectionRuntime,
  type LiturgyYtSyncPayload,
} from '../services/liturgy-web-runtime'

const route = useRoute()

const runtime = ref<LiturgyWebProjectionRuntime>({
  ...DEFAULT_LITURGY_WEB_RUNTIME,
})
const imageIndex = ref(0)
const isPlaying = ref(true)
const muted = ref(false)
const volume = ref(1)
const currentTime = ref(0)
const duration = ref(0)
const seeking = ref(false)
const siteFrameSrc = ref('')
const siteHistory = ref<string[]>([])
const siteHistoryIndex = ref(-1)
const mirrorActive = ref(false)
const mirrorStream = ref<MediaStream | null>(null)
const screenReloadToken = ref(0)

const videoEl = ref<HTMLVideoElement | HTMLAudioElement | null>(null)
const ytHostEl = ref<HTMLElement | null>(null)
const ytVeiled = ref(true)
const siteFrameEl = ref<HTMLIFrameElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const mirrorVideoEl = ref<HTMLVideoElement | null>(null)

let runtimeChannel: BroadcastChannel | null = null
let syncChannel: BroadcastChannel | null = null
let siteSyncChannel: BroadcastChannel | null = null
let imageTimer: ReturnType<typeof setInterval> | null = null
let syncPublishTimer: ReturnType<typeof setInterval> | null = null
let siteSyncTimer: ReturnType<typeof setInterval> | null = null
let ytPlayer: YT.Player | null = null
let ytApiLoading: Promise<void> | null = null
let applyingRemoteSync = false
let applyingSiteSync = false
let lastAudibleVolume = 1
let siteReloadTokenValue = 0
const siteReloadToken = ref(0)
let lastSiteScroll = { x: -1, y: -1 }
let mirrorBroadcaster: SiteMirrorBroadcaster | null = null
let mirrorViewer: SiteMirrorViewer | null = null

const isControl = computed(() => {
  const role = String(route.query.role ?? '')
  if (role === 'control') return true
  if (role === 'screen') return false
  return window.name === 'LiturgyWebControl'
})

// Autoclose de mídia com fim natural (vídeo local/YouTube) — paridade app RF-03.
useLiturgyVideoAutoclose({ runtime, isControl })
const runtimeAutoclose = computed(
  () =>
    (runtime.value as LiturgyWebProjectionRuntime & {
      __autoclose?: { onLocalVideoEnded: () => void; handleYtStateChange: (state: number) => void }
    }).__autoclose,
)

const showContent = computed(
  () => runtime.value.active && Boolean(runtime.value.url),
)

const showTransport = computed(
  () =>
    runtime.value.kind === 'youtube' ||
    runtime.value.kind === 'video' ||
    runtime.value.kind === 'audio',
)

const showSiteNav = computed(
  () => isControl.value && runtime.value.kind === 'site',
)

const canGoBack = computed(() => siteHistoryIndex.value > 0)
const canGoForward = computed(
  () =>
    siteHistoryIndex.value >= 0 &&
    siteHistoryIndex.value < siteHistory.value.length - 1,
)

const showMirrorHint = computed(
  () =>
    isControl.value &&
    runtime.value.kind === 'site' &&
    runtime.value.projectingScreens &&
    !mirrorActive.value,
)

const lockScreenInteraction = computed(
  () =>
    !isControl.value &&
    (runtime.value.kind === 'site' ||
      runtime.value.kind === 'pdf' ||
      runtime.value.kind === 'image' ||
      Boolean(mirrorStream.value)),
)

const imageUrls = computed(() => {
  if (runtime.value.kind !== 'image') return []
  return runtime.value.urls.length > 0
    ? runtime.value.urls
    : runtime.value.url
      ? [runtime.value.url]
      : []
})

const currentImage = computed(
  () => imageUrls.value[imageIndex.value] ?? imageUrls.value[0] ?? '',
)

const frameSrc = computed(() => {
  if (!showContent.value) return ''
  const url = runtime.value.url
  if (
    runtime.value.kind === 'video' ||
    runtime.value.kind === 'audio' ||
    runtime.value.kind === 'image' ||
    runtime.value.kind === 'youtube' ||
    runtime.value.kind === 'site'
  ) {
    return ''
  }
  if (runtime.value.kind === 'pdf') return url

  if (runtime.value.kind === 'vimeo') {
    const id = runtime.value.videoId.trim()
    if (!id) return url
    const mute = isControl.value ? 0 : 1
    return `https://player.vimeo.com/video/${encodeURIComponent(id)}?autoplay=1&muted=${mute}`
  }

  return url
})

function ensureReferrerMeta() {
  const existing = document.querySelector('meta[name="referrer"]')
  if (existing) {
    existing.setAttribute('content', 'strict-origin-when-cross-origin')
    return
  }
  const meta = document.createElement('meta')
  meta.name = 'referrer'
  meta.content = 'strict-origin-when-cross-origin'
  document.head.appendChild(meta)
}

function stopImageRotation() {
  if (imageTimer != null) {
    clearInterval(imageTimer)
    imageTimer = null
  }
}

function startImageRotation() {
  stopImageRotation()
  imageIndex.value = 0
  if (imageUrls.value.length <= 1) return
  imageTimer = setInterval(() => {
    imageIndex.value = (imageIndex.value + 1) % imageUrls.value.length
  }, 8000)
}

function resetSiteHistory(url: string) {
  const next = url.trim()
  if (!next) {
    siteHistory.value = []
    siteHistoryIndex.value = -1
    siteFrameSrc.value = ''
    return
  }
  siteHistory.value = [next]
  siteHistoryIndex.value = 0
  siteFrameSrc.value = next
}

function pushSiteHistory(url: string) {
  const next = url.trim()
  if (!next) return
  if (siteHistory.value[siteHistoryIndex.value] === next) {
    siteFrameSrc.value = next
    return
  }
  const truncated = siteHistory.value.slice(0, siteHistoryIndex.value + 1)
  truncated.push(next)
  siteHistory.value = truncated
  siteHistoryIndex.value = truncated.length - 1
  siteFrameSrc.value = next
}

function readSiteFrameLocation(): string | null {
  const frame = siteFrameEl.value
  if (!frame) return null
  try {
    const href = frame.contentWindow?.location.href
    if (!href || href === 'about:blank') return null
    return href
  } catch {
    return null
  }
}

function readSiteFrameScroll(): { x: number; y: number } | null {
  const frame = siteFrameEl.value
  if (!frame) return null
  try {
    const win = frame.contentWindow
    if (!win) return null
    return {
      x: Math.round(win.scrollX || 0),
      y: Math.round(win.scrollY || 0),
    }
  } catch {
    return null
  }
}

function applySiteFrameScroll(x: number, y: number) {
  const frame = siteFrameEl.value
  if (!frame) return
  try {
    frame.contentWindow?.scrollTo(x, y)
  } catch {
    // cross-origin
  }
}

function publishSiteSync(force = false) {
  if (!isControl.value || runtime.value.kind !== 'site') return
  const url =
    readSiteFrameLocation() ||
    siteFrameSrc.value ||
    runtime.value.url
  if (!url) return

  const scroll = readSiteFrameScroll()
  const scrollX = scroll?.x ?? lastSiteScroll.x
  const scrollY = scroll?.y ?? lastSiteScroll.y
  if (
    !force &&
    scroll &&
    scroll.x === lastSiteScroll.x &&
    scroll.y === lastSiteScroll.y &&
    url === runtime.value.url
  ) {
    return
  }
  if (scroll) lastSiteScroll = scroll

  if (url !== runtime.value.url) {
    patchLiturgyWebRuntime({ url })
    runtime.value = { ...runtime.value, url }
    pushSiteHistory(url)
  }

  publishLiturgySiteSync({
    url,
    scrollX: Math.max(0, scrollX),
    scrollY: Math.max(0, scrollY),
    reloadToken: siteReloadTokenValue,
    updatedAt: Date.now(),
  })
}

function applyRemoteSiteSync(payload: LiturgySiteSyncPayload) {
  if (isControl.value || runtime.value.kind !== 'site') return
  applyingSiteSync = true
  try {
    if (payload.reloadToken !== screenReloadToken.value) {
      screenReloadToken.value = payload.reloadToken
      siteFrameSrc.value = ''
      void nextTick(() => {
        siteFrameSrc.value = payload.url
        runtime.value = { ...runtime.value, url: payload.url }
        window.setTimeout(() => {
          applySiteFrameScroll(payload.scrollX, payload.scrollY)
          applyingSiteSync = false
        }, 80)
      })
      return
    }
    if (payload.url && payload.url !== siteFrameSrc.value) {
      siteFrameSrc.value = payload.url
      runtime.value = { ...runtime.value, url: payload.url }
    }
    window.setTimeout(() => {
      applySiteFrameScroll(payload.scrollX, payload.scrollY)
      applyingSiteSync = false
    }, 50)
  } catch {
    applyingSiteSync = false
  }
}

function siteBack() {
  if (!canGoBack.value) return
  siteHistoryIndex.value -= 1
  const url = siteHistory.value[siteHistoryIndex.value]
  if (!url) return
  siteFrameSrc.value = url
  patchLiturgyWebRuntime({ url })
  runtime.value = { ...runtime.value, url }
  siteReloadTokenValue += 1
  siteReloadToken.value = siteReloadTokenValue
  publishSiteSync(true)
}

function siteForward() {
  if (!canGoForward.value) return
  siteHistoryIndex.value += 1
  const url = siteHistory.value[siteHistoryIndex.value]
  if (!url) return
  siteFrameSrc.value = url
  patchLiturgyWebRuntime({ url })
  runtime.value = { ...runtime.value, url }
  siteReloadTokenValue += 1
  siteReloadToken.value = siteReloadTokenValue
  publishSiteSync(true)
}

function siteReload() {
  const url = siteFrameSrc.value || runtime.value.url
  if (!url) return
  siteReloadTokenValue += 1
  siteReloadToken.value = siteReloadTokenValue
  // Remonta o iframe no controle e nas telas.
  siteFrameSrc.value = ''
  void nextTick(() => {
    siteFrameSrc.value = url
    publishLiturgySiteSync({
      url,
      scrollX: 0,
      scrollY: 0,
      reloadToken: siteReloadTokenValue,
      updatedAt: Date.now(),
    })
  })
}

function stopMirrorBroadcast() {
  mirrorBroadcaster?.stop()
  mirrorBroadcaster = null
  mirrorActive.value = false
}

function stopMirrorViewer() {
  mirrorViewer?.stop()
  mirrorViewer = null
  mirrorStream.value = null
  if (mirrorVideoEl.value) {
    mirrorVideoEl.value.srcObject = null
  }
}

async function startMirrorFromControl() {
  if (!isControl.value || runtime.value.kind !== 'site') return false
  try {
    stopMirrorBroadcast()
    const stream = await captureCurrentSurface(stageEl.value)
    mirrorBroadcaster = startSiteMirrorBroadcaster(stream)
    mirrorActive.value = true
    return true
  } catch (error) {
    console.warn('[liturgy] falha ao iniciar espelho do site', error)
    mirrorActive.value = false
    return false
  }
}

/**
 * Projetar site: inicia captura e abertura das telas no mesmo gesto
 * (sem await entre os dois) — senão o Chrome bloqueia getDisplayMedia.
 */
async function onToggleProject() {
  if (runtime.value.projectingScreens) {
    const projecting = await toggleLiturgyScreensFromControl()
    runtime.value = {
      ...runtime.value,
      projectingScreens: projecting,
    }
    stopMirrorBroadcast()
    return
  }

  const needsMirror = runtime.value.kind === 'site'
  const capturePromise = needsMirror
    ? captureCurrentSurface(stageEl.value).catch((error: unknown) => {
        console.warn('[liturgy] falha ao capturar aba para espelho', error)
        return null
      })
    : Promise.resolve(null)

  // Dispara abertura das telas ainda no mesmo turno do clique.
  const openedPromise = toggleLiturgyScreensFromControl()

  const [stream, opened] = await Promise.all([capturePromise, openedPromise])
  runtime.value = {
    ...runtime.value,
    projectingScreens: opened,
  }

  if (!opened) {
    stream?.getTracks().forEach((track) => track.stop())
    stopMirrorBroadcast()
    return
  }

  if (stream) {
    stopMirrorBroadcast()
    mirrorBroadcaster = startSiteMirrorBroadcaster(stream)
    mirrorActive.value = true
  }
}

async function onStartMirror() {
  await startMirrorFromControl()
}

function ensureMirrorViewer() {
  if (isControl.value || runtime.value.kind !== 'site') return
  if (mirrorViewer) return
  mirrorViewer = startSiteMirrorViewer((stream) => {
    mirrorStream.value = stream
  })
}

function onScreensChanged() {
  if (runtime.value.projectingScreens) {
    syncPopupWindows()
  }
}

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (ytApiLoading) return ytApiLoading

  ytApiLoading = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
    } else if (window.YT?.Player) {
      resolve()
    }
  })

  return ytApiLoading
}

function destroyYtPlayer() {
  try {
    ytPlayer?.destroy()
  } catch {
    // ignore
  }
  ytPlayer = null
}

async function mountYtPlayer() {
  destroyYtPlayer()
  if (runtime.value.kind !== 'youtube' || !runtime.value.videoId) return

  await nextTick()
  await loadYouTubeApi()
  if (!ytHostEl.value || runtime.value.kind !== 'youtube') return

  const host = ytHostEl.value
  host.replaceChildren()
  ytVeiled.value = true
  const mountNode = document.createElement('div')
  mountNode.className = 'liturgy-web-projection__yt-host'
  host.appendChild(mountNode)

  const videoId = runtime.value.videoId
  ytPlayer = new window.YT!.Player(mountNode, {
    videoId,
    playerVars: youtubeEmbedPlayerVars({ origin: window.location.origin, muted: !isControl.value }),
    events: {
      onReady: (event) => {
        if (!isControl.value) {
          event.target.mute()
          event.target.setVolume(0)
        } else {
          event.target.setVolume(Math.round(volume.value * 100))
          if (muted.value) event.target.mute()
          else event.target.unMute()
        }
        try {
          duration.value = event.target.getDuration() || 0
        } catch {
          duration.value = 0
        }
        if (isPlaying.value) event.target.playVideo()
        else event.target.pauseVideo()
        publishSyncFromLocal()
      },
      onStateChange: (event) => {
        ytVeiled.value = youtubeVeilAfter(ytVeiled.value, event.data)
        if (applyingRemoteSync) return
        const playing = event.data === window.YT!.PlayerState.PLAYING
        const paused = event.data === window.YT!.PlayerState.PAUSED
        if (playing) isPlaying.value = true
        if (paused) isPlaying.value = false
        if (event.data === window.YT!.PlayerState.ENDED) {
          runtimeAutoclose.value?.handleYtStateChange(0)
        }
        if (isControl.value) publishSyncFromLocal()
      },
    },
  })
}

function readLocalPlayback(): LiturgyYtSyncPayload {
  const videoId = runtime.value.videoId || runtime.value.url

  if (runtime.value.kind === 'youtube' && ytPlayer) {
    try {
      return {
        videoId,
        currentTime: ytPlayer.getCurrentTime() || 0,
        isPaused: ytPlayer.getPlayerState() !== window.YT!.PlayerState.PLAYING,
        volume: Math.min(1, Math.max(0, (ytPlayer.getVolume() || 0) / 100)),
        muted: ytPlayer.isMuted(),
        updatedAt: Date.now(),
      }
    } catch {
      // fall through
    }
  }

  if ((runtime.value.kind === 'video' || runtime.value.kind === 'audio') && videoEl.value) {
    return {
      videoId,
      currentTime: videoEl.value.currentTime || 0,
      isPaused: videoEl.value.paused,
      volume: videoEl.value.volume,
      muted: videoEl.value.muted,
      updatedAt: Date.now(),
    }
  }

  return {
    videoId,
    currentTime: currentTime.value,
    isPaused: !isPlaying.value,
    volume: volume.value,
    muted: muted.value,
    updatedAt: Date.now(),
  }
}

function publishSyncFromLocal() {
  if (!isControl.value || !showTransport.value) return
  const payload = readLocalPlayback()
  currentTime.value = payload.currentTime
  isPlaying.value = !payload.isPaused
  volume.value = payload.volume
  muted.value = payload.muted
  if (!payload.muted && payload.volume > 0) {
    lastAudibleVolume = payload.volume
  }
  if (runtime.value.kind === 'youtube' && ytPlayer) {
    try {
      duration.value = ytPlayer.getDuration() || duration.value
    } catch {
      // ignore
    }
  }
  publishLiturgyYtSync(payload)
}

function applyRemoteSync(payload: LiturgyYtSyncPayload) {
  if (isControl.value) return
  if (!showTransport.value) return

  applyingRemoteSync = true
  try {
    isPlaying.value = !payload.isPaused
    volume.value = payload.volume
    muted.value = true
    currentTime.value = payload.currentTime

    if (runtime.value.kind === 'youtube' && ytPlayer) {
      try {
        const localTime = ytPlayer.getCurrentTime() || 0
        if (Math.abs(localTime - payload.currentTime) > 0.75) {
          ytPlayer.seekTo(payload.currentTime, true)
        }
        ytPlayer.mute()
        ytPlayer.setVolume(0)
        if (payload.isPaused) ytPlayer.pauseVideo()
        else ytPlayer.playVideo()
      } catch {
        // ignore
      }
    }

    if ((runtime.value.kind === 'video' || runtime.value.kind === 'audio') && videoEl.value) {
      const el = videoEl.value
      el.muted = true
      el.volume = 0
      if (Math.abs(el.currentTime - payload.currentTime) > 0.5) {
        el.currentTime = payload.currentTime
      }
      if (payload.isPaused) void el.pause()
      else void el.play().catch(() => undefined)
    }
  } finally {
    window.setTimeout(() => {
      applyingRemoteSync = false
    }, 50)
  }
}

function onVideoMeta() {
  if (!videoEl.value) return
  duration.value = videoEl.value.duration || 0
  if (!isControl.value) {
    videoEl.value.muted = true
    videoEl.value.volume = 0
  } else {
    videoEl.value.muted = muted.value
    videoEl.value.volume = muted.value ? 0 : volume.value
  }
}

function onVideoTimeUpdate() {
  if (!videoEl.value || seeking.value) return
  currentTime.value = videoEl.value.currentTime
  if (isControl.value) publishSyncFromLocal()
}

function onVideoPlay() {
  if (applyingRemoteSync) return
  isPlaying.value = true
  if (isControl.value) publishSyncFromLocal()
}

function onVideoPause() {
  if (applyingRemoteSync) return
  isPlaying.value = false
  if (isControl.value) publishSyncFromLocal()
}

function togglePlay() {
  if (runtime.value.kind === 'youtube' && ytPlayer) {
    if (isPlaying.value) ytPlayer.pauseVideo()
    else ytPlayer.playVideo()
    return
  }
  if ((runtime.value.kind === 'video' || runtime.value.kind === 'audio') && videoEl.value) {
    if (videoEl.value.paused) void videoEl.value.play()
    else videoEl.value.pause()
  }
}

function toggleMute() {
  if (!isControl.value) return
  if (muted.value) {
    muted.value = false
    volume.value = lastAudibleVolume > 0 ? lastAudibleVolume : 1
  } else {
    if (volume.value > 0) lastAudibleVolume = volume.value
    muted.value = true
  }
  applyLocalAudio()
  publishSyncFromLocal()
}

function setVolume(value: number) {
  volume.value = Math.min(1, Math.max(0, value))
  muted.value = volume.value <= 0
  if (!muted.value) lastAudibleVolume = volume.value
  applyLocalAudio()
  publishSyncFromLocal()
}

function applyLocalAudio() {
  if (runtime.value.kind === 'youtube' && ytPlayer) {
    try {
      ytPlayer.setVolume(Math.round((muted.value ? 0 : volume.value) * 100))
      if (muted.value || volume.value <= 0) ytPlayer.mute()
      else ytPlayer.unMute()
    } catch {
      // ignore
    }
  }
  if ((runtime.value.kind === 'video' || runtime.value.kind === 'audio') && videoEl.value) {
    videoEl.value.muted = muted.value
    videoEl.value.volume = muted.value ? 0 : volume.value
  }
}

function seekTo(seconds: number) {
  const t = Math.max(0, seconds)
  currentTime.value = t
  if (runtime.value.kind === 'youtube' && ytPlayer) {
    ytPlayer.seekTo(t, true)
  }
  if ((runtime.value.kind === 'video' || runtime.value.kind === 'audio') && videoEl.value) {
    videoEl.value.currentTime = t
  }
  publishSyncFromLocal()
}

function onSeekPreview(ratio: number) {
  if (!seeking.value) return
  currentTime.value = ratio * (duration.value || 0)
}

function onSeekStart() {
  seeking.value = true
}

function onSeekEnd() {
  seeking.value = false
}

function refreshRuntime() {
  const next = readLiturgyWebRuntimeFromStorage()
  const prevKind = runtime.value.kind
  const prevUrl = runtime.value.url
  runtime.value = next
  if (!isControl.value) {
    muted.value = true
    volume.value = 0
  }
  if (next.kind === 'image') {
    startImageRotation()
  } else {
    stopImageRotation()
  }
  if (next.kind === 'site') {
    if (isControl.value) {
      if (siteHistory.value.length === 0) resetSiteHistory(next.url)
    } else {
      if (!siteFrameSrc.value) siteFrameSrc.value = next.url
      ensureMirrorViewer()
    }
  }
  if (!next.projectingScreens && isControl.value) {
    stopMirrorBroadcast()
  }
}

function onStorage(event: StorageEvent) {
  if (event.key === LITURGY_WEB_RUNTIME_STORAGE_KEY) {
    refreshRuntime()
  }
}

function onRuntimeMessage(event: MessageEvent<unknown>) {
  const next = normalizeLiturgyWebRuntime(event.data)
  const prevUrl = runtime.value.url
  runtime.value = next
  if (next.kind === 'image') {
    startImageRotation()
  } else {
    stopImageRotation()
  }
  if (next.kind === 'site' && next.url !== prevUrl && !applyingSiteSync) {
    if (isControl.value) pushSiteHistory(next.url)
    else siteFrameSrc.value = next.url
  }
  if (next.kind === 'site' && !isControl.value) {
    ensureMirrorViewer()
  }
  if (!next.projectingScreens && isControl.value) {
    stopMirrorBroadcast()
  }
}

function onSyncMessage(event: MessageEvent<unknown>) {
  const payload = normalizeLiturgyYtSync(event.data)
  if (!payload) return
  applyRemoteSync(payload)
}

function onSiteSyncMessage(event: MessageEvent<unknown>) {
  const payload = normalizeLiturgySiteSync(event.data)
  if (!payload) return
  applyRemoteSiteSync(payload)
}

watch(
  () => [runtime.value.kind, runtime.value.videoId, runtime.value.url, isControl.value] as const,
  async ([kind, , url]) => {
    destroyYtPlayer()
    if (kind === 'youtube' && runtime.value.videoId) {
      await mountYtPlayer()
    }
    if (kind === 'site' && url && isControl.value && siteHistory.value.length === 0) {
      resetSiteHistory(url)
    }
  },
)

watch(mirrorStream, async (stream) => {
  await nextTick()
  if (!mirrorVideoEl.value) return
  mirrorVideoEl.value.srcObject = stream
  if (stream) {
    void mirrorVideoEl.value.play().catch(() => undefined)
  }
})

onMounted(() => {
  ensureReferrerMeta()
  if (!isControl.value) {
    muted.value = true
    volume.value = 0
  }
  refreshRuntime()
  if (runtime.value.kind === 'site') {
    if (isControl.value) resetSiteHistory(runtime.value.url)
    else siteFrameSrc.value = runtime.value.url
  }

  window.addEventListener('storage', onStorage)

  try {
    runtimeChannel = new BroadcastChannel(LITURGY_WEB_RUNTIME_CHANNEL)
    runtimeChannel.addEventListener('message', onRuntimeMessage)
  } catch {
    runtimeChannel = null
  }

  try {
    syncChannel = new BroadcastChannel(LITURGY_YT_SYNC_CHANNEL)
    syncChannel.addEventListener('message', onSyncMessage)
  } catch {
    syncChannel = null
  }

  try {
    siteSyncChannel = new BroadcastChannel(LITURGY_SITE_SYNC_CHANNEL)
    siteSyncChannel.addEventListener('message', onSiteSyncMessage)
  } catch {
    siteSyncChannel = null
  }

  if (isControl.value) {
    syncPublishTimer = setInterval(() => {
      if (!seeking.value && showTransport.value) publishSyncFromLocal()
    }, 400)
    siteSyncTimer = setInterval(() => {
      if (runtime.value.kind === 'site') publishSiteSync()
    }, 120)
  }

  if (!isControl.value) {
    ensureMirrorViewer()
  }

  if (runtime.value.kind === 'youtube' && runtime.value.videoId) {
    void mountYtPlayer()
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  stopImageRotation()
  destroyYtPlayer()
  stopMirrorBroadcast()
  stopMirrorViewer()
  if (syncPublishTimer) {
    clearInterval(syncPublishTimer)
    syncPublishTimer = null
  }
  if (siteSyncTimer) {
    clearInterval(siteSyncTimer)
    siteSyncTimer = null
  }
  runtimeChannel?.removeEventListener('message', onRuntimeMessage)
  runtimeChannel?.close()
  runtimeChannel = null
  syncChannel?.removeEventListener('message', onSyncMessage)
  syncChannel?.close()
  syncChannel = null
  siteSyncChannel?.removeEventListener('message', onSiteSyncMessage)
  siteSyncChannel?.close()
  siteSyncChannel = null
})
</script>

<template>
  <div
    class="liturgy-web-projection"
    :class="{ 'is-control': isControl }"
  >
    <div
      ref="stageEl"
      class="liturgy-web-projection__stage"
    >
      <video
        v-if="!isControl && mirrorStream"
        ref="mirrorVideoEl"
        class="liturgy-web-projection__mirror"
        autoplay
        muted
        playsinline
      />

      <video
        v-else-if="showContent && runtime.kind === 'video'"
        :key="runtime.url"
        ref="videoEl"
        class="liturgy-web-projection__media"
        :src="runtime.url"
        :title="runtime.title || 'Projeção'"
        :muted="!isControl || muted"
        autoplay
        playsinline
        @loadedmetadata="onVideoMeta"
        @timeupdate="onVideoTimeUpdate"
        @play="onVideoPlay"
        @pause="onVideoPause"
        @ended="runtimeAutoclose?.onLocalVideoEnded()"
      />
      <!-- WT-6: áudio local — now-playing central + elemento de mídia oculto. -->
      <template v-else-if="showContent && runtime.kind === 'audio'">
        <div class="liturgy-web-projection__audio">
          <span class="liturgy-web-projection__audio-icon">♪</span>
          <span class="liturgy-web-projection__audio-title">{{ runtime.title || 'Áudio' }}</span>
        </div>
        <audio
          :key="runtime.url"
          ref="videoEl"
          :src="runtime.url"
          :muted="!isControl || muted"
          autoplay
          @loadedmetadata="onVideoMeta"
          @timeupdate="onVideoTimeUpdate"
          @play="onVideoPlay"
          @pause="onVideoPause"
          @ended="runtimeAutoclose?.onLocalVideoEnded()"
        />
      </template>
      <div
        v-else-if="showContent && runtime.kind === 'youtube'"
        class="liturgy-web-projection__yt-wrap"
      >
        <div
          ref="ytHostEl"
          class="liturgy-web-projection__yt"
        />
        <div
          class="liturgy-web-projection__yt-veil"
          :class="{ 'is-hidden': !ytVeiled }"
        />
      </div>
      <img
        v-else-if="showContent && runtime.kind === 'image' && currentImage"
        :key="currentImage"
        class="liturgy-web-projection__media"
        :src="currentImage"
        :alt="runtime.title || 'Projeção'"
      >
      <iframe
        v-else-if="showContent && runtime.kind === 'site' && siteFrameSrc"
        :key="isControl ? `${siteFrameSrc}::${siteReloadToken}` : `${siteFrameSrc}::${screenReloadToken}`"
        ref="siteFrameEl"
        class="liturgy-web-projection__frame"
        :class="{ 'is-screen': !isControl }"
        :src="siteFrameSrc"
        :title="runtime.title || 'Projeção'"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        referrerpolicy="strict-origin-when-cross-origin"
        loading="eager"
      />
      <iframe
        v-else-if="showContent && frameSrc"
        :key="frameSrc"
        class="liturgy-web-projection__frame"
        :class="{ 'is-screen': !isControl }"
        :src="frameSrc"
        :title="runtime.title || 'Projeção'"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
        allowfullscreen
        referrerpolicy="strict-origin-when-cross-origin"
        loading="eager"
      />
      <div
        v-else
        class="liturgy-web-projection__empty"
      />

      <!-- Bloqueia mouse/teclado nas telas — navegação só no controle. -->
      <div
        v-if="lockScreenInteraction"
        class="liturgy-web-projection__blocker"
        aria-hidden="true"
      />
    </div>

    <LiturgyWebControlBar
      v-if="isControl"
      :show-transport="showTransport"
      :show-site-nav="showSiteNav"
      :can-go-back="canGoBack"
      :can-go-forward="canGoForward"
      :is-playing="isPlaying"
      :muted="muted"
      :volume="volume"
      :current-time="currentTime"
      :duration="duration"
      :projecting="runtime.projectingScreens"
      :mirror-hint="showMirrorHint"
      @toggle-play="togglePlay"
      @toggle-mute="toggleMute"
      @update:volume="setVolume"
      @seek="seekTo"
      @seek-preview="onSeekPreview"
      @seek-start="onSeekStart"
      @seek-end="onSeekEnd"
      @toggle-project="onToggleProject"
      @screens-changed="onScreensChanged"
      @site-back="siteBack"
      @site-forward="siteForward"
      @site-reload="siteReload"
      @start-mirror="onStartMirror"
    />
  </div>
</template>

<style scoped lang="scss">
.liturgy-web-projection {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: #000;
}

.liturgy-web-projection.is-control .liturgy-web-projection__stage {
  height: calc(100% - 48px);
  overflow: hidden;
}

.liturgy-web-projection__stage {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #000;
}

.liturgy-web-projection__frame,
.liturgy-web-projection__media,
.liturgy-web-projection__mirror,
.liturgy-web-projection__yt,
.liturgy-web-projection__yt-host {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #000;
}

.liturgy-web-projection__media {
  object-fit: contain;
}

.liturgy-web-projection__mirror {
  object-fit: contain;
  background: #000;
}

/* WT-6: now-playing do áudio local (paridade do receiver MP3). */
.liturgy-web-projection__audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2.5vh;
  width: 100%;
  height: 100%;
  color: #fff;
  background: #000;
}

.liturgy-web-projection__audio-icon {
  font-size: 12vh;
  line-height: 1;
  opacity: 0.85;
}

.liturgy-web-projection__audio-title {
  max-width: 90vw;
  font-size: 5vh;
  font-weight: 600;
  text-align: center;
  overflow-wrap: break-word;
}

.liturgy-web-projection__frame.is-screen {
  pointer-events: none;
}

.liturgy-web-projection__yt-host,
.liturgy-web-projection__yt :deep(iframe) {
  width: 100%;
  height: 100%;
  border: 0;
}

.liturgy-web-projection__yt-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
}

.liturgy-web-projection__yt-veil {
  position: absolute;
  inset: 0;
  z-index: 1;
  background: #000;
  pointer-events: none;
  transition: opacity 0.3s;

  &.is-hidden {
    opacity: 0;
  }
}

.liturgy-web-projection__blocker {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: transparent;
  cursor: default;
  touch-action: none;
}

.liturgy-web-projection__empty {
  width: 100%;
  height: 100%;
  background: #000;
}
</style>
