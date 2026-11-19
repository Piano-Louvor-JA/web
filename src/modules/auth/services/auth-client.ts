/**
 * Auth client para coletâneas custom — login simples e-mail + senha
 * contra POST /v1/custom/auth/{register,login,logout}.
 *
 * Sessão persiste no localStorage (chave louvorja.custom.auth).
 * O token é enviado como Authorization: Bearer ${session.token} todas as chamadas
 * de escrita (create/update/delete) via authHeaders().
 */

export type AuthUser = {
  id_user: number
  email: string
  displayName: string
}

export type AuthSession = {
  token: string
  user: AuthUser
}

const SESSION_KEY = 'louvorja.custom.auth'

function authBaseUrl(): string {
  const base = import.meta.env.VITE_PALCO_API_URL
  if (base) return `${base.replace(/\/$/, '')}/v1/custom/auth`
  return '/v1/custom/auth'
}

export function getAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed?.token || !parsed?.user?.id_user) return null
    return parsed
  } catch {
    return null
  }
}

/** Salva ou limpa a sessão local (usado também pelo firebase-client). */
export function saveSession(session: AuthSession | null): void {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(SESSION_KEY)
  }
}

/** Headers de auth p/ chamadas autenticadas. */
export function authHeaders(): Record<string, string> {
  const session = getAuthSession()
  if (!session) return {}
  return { authorization: `Bearer ${session.token}` }
}

export type DeleteAccountResult = 'ok' | 'password-required' | 'wrong-password' | 'unauthorized' | 'failed'

/**
 * Exclui a conta (DELETE /auth/me). Sessão legado manda a senha; sessão
 * Firebase passa o ID token fresco e não manda senha (o cliente já
 * reautenticou). Sucesso limpa a sessão local.
 */
export async function deleteAccount(password?: string, token?: string | null): Promise<DeleteAccountResult> {
  const bearer = token ?? getAuthSession()?.token
  if (!bearer) return 'unauthorized'
  try {
    const response = await fetch(`${authBaseUrl()}/me`, {
      method: 'DELETE',
      headers: { 'X-Tenant': 'piano', authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify(password ? { password } : {}),
    })
    if (response.ok) {
      saveSession(null)
      return 'ok'
    }
    if (response.status === 400) return 'password-required'
    if (response.status === 403) return 'wrong-password'
    if (response.status === 401) return 'unauthorized'
    return 'failed'
  } catch {
    return 'failed'
  }
}

async function authRequest(
  path: 'register' | 'login',
  body: Record<string, string>,
): Promise<AuthSession | null> {
  try {
    const response = await fetch(`${authBaseUrl()}/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!response.ok) return null
    const json = (await response.json()) as AuthSession
    if (!json?.token || !json?.user) return null
    saveSession(json)
    return json
  } catch {
    return null
  }
}

export function register(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthSession | null> {
  return authRequest('register', { email, password, displayName })
}

export function login(
  email: string,
  password: string,
): Promise<AuthSession | null> {
  return authRequest('login', { email, password })
}

/** Logout: invalida a sessão na API (best-effort) e limpa local. */
export async function logout(): Promise<void> {
  const session = getAuthSession()
  if (session) {
    try {
      await fetch(`${authBaseUrl()}/logout`, {
        method: 'POST',
        headers: { authorization: `Bearer ${session.token}` },
      })
    } catch {
      // best-effort — limpa local de qualquer forma
    }
  }
  saveSession(null)
}

/**
 * Pede token de reset (POST /auth/forgot-password). A API responde 200
 * sempre; quando RESET_TOKEN_EXPOSE=1 (self-host sem SMTP) o token vem no
 * corpo e o fluxo segue direto na UI. Sem o flag, o token vai pelo suporte.
 * Retorna o token (quando exposto) ou null.
 */
export async function requestPasswordReset(email: string): Promise<string | null> {
  try {
    const response = await fetch(`${authBaseUrl()}/forgot-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    if (!response.ok) return null
    const json = (await response.json()) as { ok?: boolean; token?: string }
    return json?.token ?? null
  } catch {
    return null
  }
}

/** Troca a senha com token de reset (POST /auth/reset-password). */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  try {
    const response = await fetch(`${authBaseUrl()}/reset-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
    return response.ok
  } catch {
    return false
  }
}

function clearAuthSession(): void {
  saveSession(null)
}

export { clearAuthSession as clearSession }