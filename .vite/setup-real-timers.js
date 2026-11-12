import { afterAll, vi } from 'vitest'

afterAll(() => {
  vi.useRealTimers()
})
