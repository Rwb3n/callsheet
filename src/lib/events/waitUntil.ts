// waitUntil wrapper — SI §1.6
// Production: delegates to Vercel's waitUntil
// Tests: collector accumulates promises for assertion [AC-45]

export type WaitUntilFn = (promise: Promise<void>) => void

export function createWaitUntilCollector(): {
  waitUntilFn: WaitUntilFn
  getPromises: () => Promise<void>[]
} {
  const promises: Promise<void>[] = []
  return {
    waitUntilFn: (p) => { promises.push(p) },
    getPromises: () => promises,
  }
}
