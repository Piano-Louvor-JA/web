import { onMounted, onUnmounted } from 'vue'

import { useMediaStore } from '../stores/useMediaStore'

/** Keep editing and native control navigation ahead of player shortcuts. */
function ownsKeyboard(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  return Boolean(
    (target instanceof HTMLElement && target.isContentEditable) ||
    target.closest(
      'input, textarea, select, button, a[href], summary, audio[controls], video[controls], ' +
      '[contenteditable]:not([contenteditable="false"]), [role="textbox"], ' +
      '[role="slider"], [role="combobox"], [role="listbox"], [role="button"]',
    ),
  )
}

/** Operator-only: mounted once by AppShell, independently of the active route. */
export function useMediaPlayerHotkeys(): void {
  const player = useMediaStore()

  function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented || event.isComposing) return
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    if (!player.hasSession || !['ready', 'playing', 'paused'].includes(player.status)) return
    if (ownsKeyboard(event.composedPath()[0] ?? event.target) || ownsKeyboard(document.activeElement)) return
    if (document.querySelector('[role="dialog"]:not([hidden]):not([aria-hidden="true"]), dialog[open]')) return

    let action: (() => Promise<void>) | undefined
    if (event.key === 'ArrowLeft') action = player.previousSlide
    if (event.key === 'ArrowRight') action = player.nextSlide
    if (event.key === ' ' && player.hasAudio && player.session?.mode !== 'no_audio') {
      // A held space must not repeatedly pause/resume, but must still suppress scroll.
      action = event.repeat ? async () => {} : player.togglePlay
    }
    if (!action) return

    event.preventDefault()
    // The same arrow must not also move a Bible verse underneath the miniplayer.
    event.stopPropagation()
    void action()
  }

  onMounted(() => window.addEventListener('keydown', onKeydown, true))
  onUnmounted(() => window.removeEventListener('keydown', onKeydown, true))
}
