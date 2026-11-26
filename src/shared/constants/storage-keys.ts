/** Chaves de persistência no browser (localStorage / sessionStorage). */
export const BROWSER_STORAGE_KEYS = {
  userPreferences: 'user_data',
  popupLayout: 'louvorja_popup_layout',
  popupModule: 'louvorja_popup_module',
  recentCollections: 'history_recent_collections',
  topSongs: 'history_top_songs',
  catalogSessionPrefix: 'db:',
} as const

/** Campos dentro de `user_data` (preferências do operador). */
export const USER_PREFERENCE_KEYS = {
  theme: 'theme',
  blur: 'blur',
  accent: 'accent',
  interaction: 'interaction',
  autoBrightness: 'autoBrightness',
  language: 'language',
  popupCount: 'popup_count',
  /** Slots de popup selecionados para receber projeção (1..popupCount). */
  targetPopupSlots: 'projection.targetPopupSlots',
  /** Próximas popups tentam fullscreen durante o gesto de projetar. */
  projectionFullscreenMode: 'projection.fullscreenMode',
  /** Preferências de projeção (letra + popups); alinhado ao Electron. */
  projectionSettings: 'projection.settings',
  /** Personalização do Palco por módulo (formato StageSettings do APK). */
  stageSettingsPrefix: 'stage.settings.',
  homeLocation: 'home.location',
  /** Último distrito/igreja não vazios já digitados (por campo). Local: não sincroniza; usado no envio de telemetria quando o campo for apagado. */
  homeLocationLastKnown: 'home.locationLastKnown',
  /** Telemetria de dispositivos: UUID anônimo desta instalação. Local: não sincroniza. */
  telemetryInstallId: 'telemetry.installId',
  /** Assistente de primeira execução e lembrete de distrito/igreja. Local por instalação: não sincroniza. */
  onboarding: 'onboarding.state',
  /** Zoom da UI do operador (fator 0.7–1.5). */
  uiZoom: 'ui.zoom',
  mediaUseInternalPlayer: 'media_use_internal_player',
  mediaAutoProjectVideo: 'media_auto_project_video',
  mediaPauseOnMinimize: 'media_pause_on_minimize',
  mediaLazyLoad: 'media_lazy_load',
  mediaFadeAudio: 'media_fade_audio',
  bibleSelectedVersion: 'bible.selectedVersionId',
  bibleSelectedBook: 'bible.selectedBookId',
  bibleSelectedChapter: 'bible.selectedChapter',
  clockConfig: 'clock.config',
  timerConfig: 'timer.config',
  countdownConfig: 'countdown.config',
  randomConfig: 'random.config',
  randomSession: 'random.session',
  liturgyState: 'liturgy.state',
  scheduledState: 'scheduled.state',
} as const
