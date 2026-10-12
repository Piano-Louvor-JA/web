import { expect, it } from 'vitest'
import { coverageThreshold } from '../../../scripts/coverage-policy'

it('aplica 50 somente pela base staging de uma PR, preservando main e publicação', () => {
  expect(coverageThreshold({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'staging' })).toBe(50)
  expect(coverageThreshold({ GITHUB_EVENT_NAME: 'pull_request', GITHUB_BASE_REF: 'main', GITHUB_HEAD_REF: 'staging' })).toBe(100)
  expect(coverageThreshold({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/tags/v1.0.0' })).toBe(100)
  expect(coverageThreshold({ GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' })).toBe(100)
  expect(coverageThreshold({})).toBe(100)
})
