import { describe, it, expect, vi, beforeEach } from 'vitest'

import { runStreamPromotion } from './run-stream-promotion.js'
import { runRowIdCollisionDiagnostic } from './run-row-id-collision-diagnostic.js'
import { runBalanceDivergenceDiagnostic } from './run-balance-divergence-diagnostic.js'
import { runBalanceSizeDiagnostic } from './run-balance-size-diagnostic.js'
import { runCanonicalSourceCensus } from './run-canonical-source-census.js'

import { runPromotionThenDiagnostics } from './run-promotion-then-diagnostics.js'

vi.mock('./run-stream-promotion.js', () => ({
  runStreamPromotion: vi.fn()
}))
vi.mock('./run-row-id-collision-diagnostic.js', () => ({
  runRowIdCollisionDiagnostic: vi.fn()
}))
vi.mock('./run-balance-divergence-diagnostic.js', () => ({
  runBalanceDivergenceDiagnostic: vi.fn()
}))
vi.mock('./run-balance-size-diagnostic.js', () => ({
  runBalanceSizeDiagnostic: vi.fn()
}))
vi.mock('./run-canonical-source-census.js', () => ({
  runCanonicalSourceCensus: vi.fn()
}))

describe('runPromotionThenDiagnostics', () => {
  const server = { name: 'fake-server' }

  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should not start diagnostics until promotion completes', async () => {
    let resolvePromotion
    runStreamPromotion.mockReturnValue(
      new Promise((resolve) => {
        resolvePromotion = resolve
      })
    )

    const promise = runPromotionThenDiagnostics(server)

    // Flush microtasks — diagnostics should NOT have been called yet
    await vi.waitFor(() => {
      expect(runStreamPromotion).toHaveBeenCalledWith(server)
    })

    expect(runRowIdCollisionDiagnostic).not.toHaveBeenCalled()
    expect(runBalanceDivergenceDiagnostic).not.toHaveBeenCalled()
    expect(runBalanceSizeDiagnostic).not.toHaveBeenCalled()
    expect(runCanonicalSourceCensus).not.toHaveBeenCalled()

    // Now let promotion finish
    resolvePromotion()
    await promise

    expect(runRowIdCollisionDiagnostic).toHaveBeenCalledWith(server)
    expect(runBalanceDivergenceDiagnostic).toHaveBeenCalledWith(server)
    expect(runBalanceSizeDiagnostic).toHaveBeenCalledWith(server)
    expect(runCanonicalSourceCensus).toHaveBeenCalledWith(server)
  })

  it('should still run diagnostics if promotion rejects', async () => {
    runStreamPromotion.mockRejectedValue(new Error('promotion failed'))

    await runPromotionThenDiagnostics(server)

    expect(runRowIdCollisionDiagnostic).toHaveBeenCalledWith(server)
    expect(runBalanceDivergenceDiagnostic).toHaveBeenCalledWith(server)
    expect(runBalanceSizeDiagnostic).toHaveBeenCalledWith(server)
    expect(runCanonicalSourceCensus).toHaveBeenCalledWith(server)
  })
})
