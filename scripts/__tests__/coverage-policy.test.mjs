import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { coverageThreshold } from '../coverage-policy.ts'

describe('coverage policy por destino real do evento', () => {
  const cases = [
    ['PR staging', { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'staging' }, 50],
    ['PR main com origem staging', { GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main', GITHUB_HEAD_REF: 'staging' }, 100],
    ['push staging', { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/staging' }, 50],
    ['push main', { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' }, 100],
    ['push tag', { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/tags/v1.0.0' }, 100],
    ['push feature', { GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/feature' }, 100],
    ['manual main', { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main' }, 100],
    ['manual staging', { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/staging' }, 100],
    ['sem contexto', {}, 100],
  ]
  for (const [name, env, expected] of cases) {
    it(name, () => assert.equal(coverageThreshold(env), expected))
  }
})
