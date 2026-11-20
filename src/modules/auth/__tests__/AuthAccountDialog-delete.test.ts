// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'

vi.mock('vuetify/components', () => ({
  VBtn: { template: '<button v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>' },
  VCard: { template: '<div v-bind="$attrs"><slot /></div>' },
  VDialog: {
    props: { modelValue: Boolean },
    template: '<div v-if="modelValue" v-bind="$attrs"><slot /></div>',
  },
  VIcon: { template: '<i v-bind="$attrs"><slot /></i>' },
  VTextField: {
    props: { modelValue: { type: String, default: '' }, label: String, type: String },
    emits: ['update:modelValue'],
    template: `<input :type="type || 'text'" :placeholder="label" :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)" />`,
  },
}))

const auth = vi.hoisted(() => ({
  accountProvider: vi.fn(),
  deleteAccount: vi.fn(),
}))

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    session: ref({ token: 't', user: { id_user: 1, email: 'ana@example.org', displayName: 'Ana' } }),
    isLoggedIn: { value: true },
    userName: { value: 'Ana' },
    userEmail: { value: 'ana@example.org' },
    login: vi.fn(),
    register: vi.fn(),
    loginGoogle: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
    accountProvider: auth.accountProvider,
    deleteAccount: auth.deleteAccount,
  }),
}))

import AuthAccountDialog from '../components/AuthAccountDialog.vue'

const i18n = createI18n({ legacy: false, locale: 'pt', missingWarn: false, fallbackWarn: false, messages: { pt: {} } })
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

function mountDialog() {
  return mount(AuthAccountDialog, { props: { modelValue: true }, global: { plugins: [i18n] } })
}

describe('AuthAccountDialog — excluir conta (paridade app)', () => {
  beforeEach(() => {
    auth.accountProvider.mockReturnValue('password')
    auth.deleteAccount.mockResolvedValue(true)
  })
  afterEach(() => { vi.clearAllMocks() })

  it('pede a senha, só exclui com senha e fecha no sucesso', async () => {
    const wrapper = mountDialog()
    await wrapper.find('[data-test="auth-delete-start"]').trigger('click')

    expect(wrapper.text()).toContain('auth.deleteWarning')
    await wrapper.find('[data-test="auth-delete"]').trigger('submit')
    await flush()
    expect(auth.deleteAccount).not.toHaveBeenCalled()

    await wrapper.find('[data-test="auth-delete"] input[type="password"]').setValue('secret')
    await wrapper.find('[data-test="auth-delete"]').trigger('submit')
    await flush()
    expect(auth.deleteAccount).toHaveBeenCalledWith('secret')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('conta Google confirma sem campo de senha', async () => {
    auth.accountProvider.mockReturnValue('google')
    const wrapper = mountDialog()
    await wrapper.find('[data-test="auth-delete-start"]').trigger('click')
    expect(wrapper.find('[data-test="auth-delete"] input').exists()).toBe(false)
    expect(wrapper.text()).toContain('auth.deleteGoogleHint')
    await wrapper.find('[data-test="auth-delete"]').trigger('submit')
    await flush()
    expect(auth.deleteAccount).toHaveBeenCalledWith('')
  })

  it('falha mantém aberto; cancelar volta para a conta', async () => {
    auth.deleteAccount.mockResolvedValue(false)
    const wrapper = mountDialog()
    await wrapper.find('[data-test="auth-delete-start"]').trigger('click')
    await wrapper.find('[data-test="auth-delete"] input[type="password"]').setValue('errada')
    await wrapper.find('[data-test="auth-delete"]').trigger('submit')
    await flush()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()

    await wrapper.find('[data-test="auth-delete-cancel"]').trigger('click')
    expect(wrapper.find('[data-test="auth-delete"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="auth-delete-start"]').exists()).toBe(true)
  })
})
