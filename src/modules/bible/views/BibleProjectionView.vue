<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

import { ProjectionBackground } from '@design-system/index'

import { readEffectiveStageSettings, subscribeStageSettings } from '../../settings/services/stage-settings-runtime'
import type { StageSettings } from '../../settings/types/stage-settings'
import { resolveBackgroundImage } from '../../settings/types/stage-settings'

import {
  BIBLE_RUNTIME_CHANNEL,
  BIBLE_RUNTIME_STORAGE_KEY,
  DEFAULT_BIBLE_RUNTIME,
  normalizeBibleRuntime,
  readBibleRuntimeFromStorage,
  type BibleProjectionRuntime,
} from '../services/bible-runtime'

const runtime = ref<BibleProjectionRuntime>({ ...DEFAULT_BIBLE_RUNTIME })
let runtimeChannel: BroadcastChannel | null = null

function refreshRuntime() {
  runtime.value = readBibleRuntimeFromStorage()
}

function onStorage(event: StorageEvent) {
  if (event.key === BIBLE_RUNTIME_STORAGE_KEY) {
    refreshRuntime()
  }
}

function onRuntimeMessage(event: MessageEvent<unknown>) {
  runtime.value = normalizeBibleRuntime(event.data)
}

onMounted(() => {
  refreshRuntime()
  window.addEventListener('storage', onStorage)

  try {
    runtimeChannel = new BroadcastChannel(BIBLE_RUNTIME_CHANNEL)
    runtimeChannel.addEventListener('message', onRuntimeMessage)
  } catch {
    runtimeChannel = null
  }
})

onUnmounted(() => {
  window.removeEventListener('storage', onStorage)
  runtimeChannel?.removeEventListener('message', onRuntimeMessage)
  runtimeChannel?.close()
  runtimeChannel = null
})

const showContent = computed(
  () => runtime.value.active && Boolean(runtime.value.text || runtime.value.reference),
)

const contentKey = computed(
  () => `${runtime.value.text}|${runtime.value.reference}`,
)

// Re-aplica o fit quando o bloco de conteúdo (re)aparece (a Transition
// troca o elemento — o textEl troca de nó, o fit antigo não serve).
watch(showContent, (v) => {
  if (v) void nextTick(applyFit)
})

// ===== Personalização do Palco (escopo bible — paridade APK) =====
const stage = ref<StageSettings>(readEffectiveStageSettings('bible'))
let unsubStage: (() => void) | null = null

onMounted(() => {
  unsubStage = subscribeStageSettings(() => {
    stage.value = readEffectiveStageSettings('bible')
  })
})

onUnmounted(() => unsubStage?.())

const stageStyle = computed(() => ({
  backgroundColor: stage.value.backgroundColor ?? 'transparent',
  backgroundImage: resolveBackgroundImage(stage.value.backgroundImage)
    ? `url(${resolveBackgroundImage(stage.value.backgroundImage)})`
    : undefined,
}))

const stageAlign = computed(() => ({
  alignItems:
    stage.value.textVerticalAlign === 'top'
      ? 'flex-start'
      : stage.value.textVerticalAlign === 'bottom'
        ? 'flex-end'
        : 'center',
  justifyContent:
    stage.value.textAlign === 'left'
      ? 'flex-start'
      : stage.value.textAlign === 'right'
        ? 'flex-end'
        : 'center',
}))

const verseStyle = computed(() => ({
  color: stage.value.bibleTextColor,
  fontSize: `${((stage.value.bibleFontSize / 1920) * 100 * fitScale.value).toFixed(3)}cqw`,
  fontWeight: String(stage.value.bibleFontWeight),
  textAlign: stage.value.textAlign,
  textTransform:
    stage.value.bibleTextTransform === 'none' ? 'none' : stage.value.bibleTextTransform,
  textShadow: stage.value.textShadow
    ? `0 0 ${(stage.value.shadowBlur / 108) * 100}cqw rgba(0,0,0,${stage.value.shadowIntensity})`
    : 'none',
}))

const verseBoxStyle = computed(() => {
  if (!stage.value.textBox) return {}
  return {
    backgroundColor: `rgba(0,0,0,${stage.value.boxOpacity})`,
    border: stage.value.boxBorder ? '1px solid rgba(255,255,255,0.25)' : 'none',
    // Padrão folha característico do design (como o media-projection)
    borderRadius: 'clamp(14px, 2.4vmin, 32px) 0 clamp(14px, 2.4vmin, 32px) 0',
  }
})

const referenceStyle = computed(() => ({
  color: stage.value.footerRefColor,
  fontWeight: String(stage.value.footerRefWeight),
}))

// ===== Auto-fit (WT-5f): texto SEMPRE dentro da área útil =====
// Versículos múltiplos (Gn 1:1–3) geram texto longo que estoura a tela com
// a fonte configurada. Mede e reduz o fitScale até caber (paridade com o
// auto-fit do receiver). O scale entra no verseStyle (cqw).
const textEl = ref<HTMLParagraphElement | null>(null)
const fitScale = ref(1)

function applyFit() {
  const el = textEl.value
  if (!el) return
  // área útil: altura do palco menos rodapé/padding (~12%)
  const palco = el.closest('.bible-projection') as HTMLElement | null
  const maxH = (palco?.clientHeight ?? window.innerHeight) * 0.86
  const base = stage.value.bibleFontSize / 1920 * 100 // cqw alvo
  let scale = 1
  let guard = 0
  // medir: aplicar o scale candidato direto e checar overflow
  while (guard < 30) {
    el.style.fontSize = `${(base * scale).toFixed(3)}cqw`
    if (el.scrollHeight <= maxH) break
    scale *= 0.94
    guard++
  }
  fitScale.value = scale
  // limpa o style inline (verseStyle assume pelo computed)
  el.style.fontSize = ''
}

watch(
  () => [runtime.value.text, stage.value.bibleFontSize, stage.value.bibleTextTransform],
  () => void nextTick(applyFit),
  { flush: 'post' },
)
onMounted(() => {
  applyFit()
  window.addEventListener('resize', applyFit)
})
onUnmounted(() => {
  window.removeEventListener('resize', applyFit)
})
</script>

<template>
  <ProjectionBackground
    class="bible-projection"
    :style="stageStyle"
  >
    <div
      class="bible-projection__stage"
      :style="stageAlign"
    >
      <Transition
        name="bible-fade"
        mode="out-in"
      >
        <div
          v-if="showContent"
          :key="contentKey"
          class="bible-projection__stack"
          :style="stageAlign"
        >
          <div
            class="bible-projection__content"
            :style="verseBoxStyle"
          >
            <p
              v-if="runtime.text"
              ref="textEl"
              class="bible-projection__text"
              :style="verseStyle"
            >
              {{ runtime.text }}
            </p>
          </div>
          <!-- WT-5f: referência FORA da caixinha de texto, com gap (Rafael) —
               o content (caixinha) abraça só o texto; a reference é irmã. -->
          <p
            v-if="runtime.reference && stage.showBibleVersion"
            class="bible-projection__reference"
            :style="referenceStyle"
          >
            {{ runtime.reference }}
          </p>
        </div>
        <div
          v-else
          key="empty"
          class="bible-projection__empty"
        />
      </Transition>
    </div>
  </ProjectionBackground>
</template>

<style scoped lang="scss">
.bible-projection {
  container-type: inline-size;
  width: 100vw;
  height: 100vh;
  background-size: cover;
  background-position: center;
  overflow: hidden;
}

.bible-projection__stage {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: clamp(1.5rem, 6vmin, 4rem);
}

/* WT-5f: stack column (caixinha do texto + referência FORA dela) — herda o
   alinhamento do palco via stageAlign e dá o gap entre caixinha e ref. */
.bible-projection__stack {
  display: flex;
  flex-direction: column;
  gap: 1.4vmin;
  max-width: 100%;
}

.bible-projection__content {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: fit-content;
}

.bible-projection__text {
  margin: 0;
  color: #fff;
  font-size: clamp(1.75rem, 5.2vmin, 3.75rem);
  font-weight: 500;
  line-height: 1.45;
  text-align: center;
  text-shadow: 0 1px 4px rgb(0 0 0 / 0.7);
  white-space: pre-wrap;
}

.bible-projection__reference {
  margin: 0;
  color: #fb8c00;
  font-size: clamp(1rem, 2.8vmin, 1.85rem);
  font-weight: 600;
  letter-spacing: 0.02em;
  text-align: right;
  text-transform: uppercase;
}

.bible-projection__empty {
  width: 100%;
  height: 100%;
}

.bible-fade-enter-active,
.bible-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.bible-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.bible-fade-leave-to {
  opacity: 0;
}
</style>
