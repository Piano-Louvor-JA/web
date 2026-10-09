// Setup compartilhado dos testes sob o runner do Stryker.
// jsdom não expõe localStorage/sessionStorage como globals do Node —
// polyfill em memória (mesmo padrão dos specs do repo, ex. stage-settings-runtime).
function polyfillStorage(name: 'localStorage' | 'sessionStorage'): void {
  if (typeof globalThis[name] !== 'undefined') return
  const map = new Map<string, string>()
  Object.defineProperty(globalThis, name, {
    configurable: true,
    get() {
      return {
        getItem: (k: string) => map.get(k) ?? null,
        setItem: (k: string, v: string) => map.set(String(k), String(v)),
        removeItem: (k: string) => map.delete(k),
        clear: () => map.clear(),
        key: (i: number) => [...map.keys()][i] ?? null,
        get length() {
          return map.size
        },
      }
    },
  })
}

polyfillStorage('localStorage')
polyfillStorage('sessionStorage')
