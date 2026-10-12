/** Apenas PRs destinadas a staging usam 50%; main, tags e outros eventos mantêm 100%. */
export function coverageThreshold(env: Record<string, string | undefined>): number {
  return env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF === 'staging'
    ? 50
    : 100
}
