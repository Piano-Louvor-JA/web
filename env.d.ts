/// <reference types="vite/client" />

declare global {
  const __APP_VERSION__: string

  /** Window Management API (multi-tela). */
  interface ScreenDetailed extends Screen {
    availLeft: number
    availTop: number
    left: number
    top: number
    isPrimary: boolean
    label: string
  }

  interface ScreenDetails {
    screens: ScreenDetailed[]
    currentScreen: ScreenDetailed
  }

  interface Window {
    getScreenDetails?: () => Promise<ScreenDetails>
    YT?: {
      Player: new (
        elementId: string | HTMLElement,
        options: {
          videoId?: string
          playerVars?: Record<string, string | number>
          events?: {
            onReady?: (event: { target: YT.Player }) => void
            onStateChange?: (event: { data: number; target: YT.Player }) => void
          }
        },
      ) => YT.Player
      PlayerState: {
        ENDED: number
        PLAYING: number
        PAUSED: number
        BUFFERING: number
        CUED: number
      }
    }
    onYouTubeIframeAPIReady?: () => void
  }

  namespace YT {
    interface Player {
      playVideo: () => void
      pauseVideo: () => void
      seekTo: (seconds: number, allowSeekAhead: boolean) => void
      getCurrentTime: () => number
      getDuration: () => number
      getPlayerState: () => number
      isMuted: () => boolean
      mute: () => void
      unMute: () => void
      setVolume: (volume: number) => void
      getVolume: () => number
      destroy: () => void
    }
  }
}

interface ImportMetaEnv {
  readonly VITE_APP_MODE?: string
  readonly VITE_URL_FILES?: string
  readonly VITE_URL_DATABASE?: string
  /** Origem upstream que publica /db/* (manifest + bundles) — SPEC v1.2.0 ADR-11. */
  readonly VITE_URL_BUNDLES?: string
  readonly VITE_API_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.svg' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

export {}
