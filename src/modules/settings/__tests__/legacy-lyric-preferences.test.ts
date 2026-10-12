import { beforeEach, expect, it } from 'vitest'
import { setUserPreference, getUserPreference } from '@shared/services/user-preferences'
import { USER_PREFERENCE_KEYS } from '@shared/constants/storage-keys'
import { loadStageSettingsOptional, saveStageSettings } from '../services/stage-settings-preferences'
import { DEFAULT_STAGE_SETTINGS } from '../types/stage-settings'

beforeEach(() => localStorage.clear())
const globalKey = `${USER_PREFERENCE_KEYS.stageSettingsPrefix}global`
const legacy = { customTextFormat: true, fontSizePercent: 150, fontWeight: '700', fontColor: '#ff0000' }

it('migra somente sem configuração global, persiste uma vez e conserva o legado', () => {
  setUserPreference(USER_PREFERENCE_KEYS.projectionSettings, legacy)
  expect(loadStageSettingsOptional('global')).toMatchObject({ lyricFontSize: 144, lyricFontWeight: 800, lyricTextColor: '#FF0000' })
  expect(getUserPreference(globalKey)).toMatchObject({ lSize: 144 })
  setUserPreference(USER_PREFERENCE_KEYS.projectionSettings, { ...legacy, fontSizePercent: 100 })
  expect(loadStageSettingsOptional('global')?.lyricFontSize).toBe(144)
  expect(getUserPreference(USER_PREFERENCE_KEYS.projectionSettings)).toMatchObject({ fontSizePercent: 100 })
})

it('não sobrescreve configuração global atual nem overrides de módulos', () => {
  saveStageSettings('global', { ...DEFAULT_STAGE_SETTINGS, lyricFontSize: 80 })
  saveStageSettings('hymns', { ...DEFAULT_STAGE_SETTINGS, lyricFontSize: 120 })
  setUserPreference(USER_PREFERENCE_KEYS.projectionSettings, legacy)
  expect(loadStageSettingsOptional('global')?.lyricFontSize).toBe(80)
  expect(loadStageSettingsOptional('hymns')?.lyricFontSize).toBe(120)
})

it('não cria configuração global quando personalização antiga estava desativada', () => {
  setUserPreference(USER_PREFERENCE_KEYS.projectionSettings, { ...legacy, customTextFormat: false })
  expect(loadStageSettingsOptional('global')).toBeNull()
  expect(getUserPreference(globalKey)).toBeNull()
})
