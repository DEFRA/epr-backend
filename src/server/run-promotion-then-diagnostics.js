import { logger } from '#common/helpers/logging/logger.js'
import { runStreamPromotion } from '#server/run-stream-promotion.js'
import { runRowIdCollisionDiagnostic } from '#server/run-row-id-collision-diagnostic.js'
import { runBalanceDivergenceDiagnostic } from '#server/run-balance-divergence-diagnostic.js'
import { runBalanceSizeDiagnostic } from '#server/run-balance-size-diagnostic.js'
import { runCanonicalSourceCensus } from '#server/run-canonical-source-census.js'

/**
 * Sequences ledger promotion before diagnostics. Called as a floating
 * promise from onPostStart so the main loop is never blocked.
 */
export async function runPromotionThenDiagnostics(server) {
  try {
    await runStreamPromotion(server)
  } catch (error) {
    logger.error({
      message: 'Stream promotion failed, continuing with diagnostics',
      error
    })
  }

  runRowIdCollisionDiagnostic(server)
  runBalanceDivergenceDiagnostic(server)
  runBalanceSizeDiagnostic(server)
  runCanonicalSourceCensus(server)
}
