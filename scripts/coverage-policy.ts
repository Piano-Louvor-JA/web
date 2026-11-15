/** Staging usa 50%; main, tags e demais eventos preservam 100%. */
export function coverageThreshold(env: Record<string, string | undefined>): number {
  const stagingPr = env.GITHUB_EVENT_NAME === 'pull_request' && env.GITHUB_BASE_REF === 'staging'
  const stagingPush = env.GITHUB_EVENT_NAME === 'push' && env.GITHUB_REF === 'refs/heads/staging'
  return stagingPr || stagingPush ? 50 : 100
}
