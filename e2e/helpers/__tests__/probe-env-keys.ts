// Chaves de env de API inspecionadas pelo probe do globalSetup (evita import circular).
export const APP_ENV_KEYS_FOR_TEST = [
  'VITE_URL_DATABASE',
  'VITE_URL_FILES',
  'VITE_PALCO_API_URL',
] as const
