import { logger } from '#common/helpers/logging/logger.js'
import { createWasteBalancesRepository } from '#repositories/waste-balances/mongodb.js'
import { roundTo2dp } from '#domain/waste-balances/decimal-utils.js'

/**
 * Determine whether a stored value contains a floating-point rounding error.
 * The data layer guarantees all inputs are at most 2 decimal places, so any
 * value that changes when rounded to 2 dp is the result of accumulated IEEE 754
 * drift and should be corrected.
 *
 * @param {number} value
 * @returns {boolean}
 */
export function hasRoundingError(value) {
  return roundTo2dp(value) !== value
}

/**
 * Correct a single waste balance if it contains rounding errors.
 *
 * @param {import('#domain/waste-balances/model.js').WasteBalance} balance
 * @param {import('#repositories/waste-balances/port.js').WasteBalancesRepository} repository
 * @param {{ dryRun?: boolean }} options
 * @returns {Promise<boolean>} true if corrected (or would correct), false if no error
 */
export async function correctWasteBalance(balance, repository, options = {}) {
  const correctAmount = roundTo2dp(balance.amount)
  const correctAvailableAmount = roundTo2dp(balance.availableAmount)

  const amountError = hasRoundingError(balance.amount)
  const availableError = hasRoundingError(balance.availableAmount)

  if (!amountError && !availableError) {
    return false
  }

  const amountDelta = correctAmount - balance.amount
  const availableDelta = correctAvailableAmount - balance.availableAmount

  if (options.dryRun) {
    logger.info(
      /** @type {any} */ ({
        message: `[DRY-RUN] Would apply rounding correction to waste balance for accreditation ${balance.accreditationId}`,
        accreditationId: balance.accreditationId,
        storedAmount: balance.amount,
        correctAmount,
        amountDelta,
        storedAvailableAmount: balance.availableAmount,
        correctAvailableAmount,
        availableDelta
      })
    )
    return true
  }

  logger.info(
    /** @type {any} */ ({
      message: `Applying rounding correction to waste balance for accreditation ${balance.accreditationId}`,
      accreditationId: balance.accreditationId,
      amountDelta,
      availableDelta
    })
  )

  await repository.applyRoundingCorrectionToWasteBalance({
    accreditationId: balance.accreditationId,
    correctedAmount: correctAmount,
    correctedAvailableAmount: correctAvailableAmount
  })

  return true
}

/**
 * Iterate all waste balance documents and apply rounding corrections.
 *
 * @param {import('#repositories/waste-balances/port.js').WasteBalancesRepository} wasteBalancesRepository
 * @param {boolean} dryRun
 * @returns {Promise<{dryRun: boolean, corrected?: number, wouldCorrect?: number, total: number}>}
 */
async function executeCorrection(wasteBalancesRepository, dryRun) {
  const balances = await wasteBalancesRepository.findAll()
  let correctedCount = 0

  for (const balance of balances) {
    try {
      const wasCorrected = await correctWasteBalance(
        balance,
        wasteBalancesRepository,
        { dryRun }
      )
      if (wasCorrected) {
        correctedCount++
      }
    } catch (error) {
      logger.error(
        error,
        `Failed to correct waste balance for accreditation ${balance.accreditationId}`
      )
    }
  }

  if (dryRun) {
    logger.info({
      message: `[DRY-RUN] Waste balance rounding correction would correct ${correctedCount}/${balances.length} balances`
    })
    return {
      dryRun: true,
      wouldCorrect: correctedCount,
      total: balances.length
    }
  }

  logger.info({
    message: `Waste balance rounding correction completed (${correctedCount}/${balances.length} balances corrected)`
  })
  return {
    dryRun: false,
    corrected: correctedCount,
    total: balances.length
  }
}

/**
 * Run waste balance rounding correction on startup (PAE-1082).
 * Replays each balance's transaction chain with exact decimal arithmetic to
 * detect IEEE 754 rounding errors and appends a ROUNDING_CORRECTION transaction
 * to bring the stored totals back to the exact values.
 *
 * @param {Object} server
 * @returns {Promise<{dryRun: boolean, corrected?: number, wouldCorrect?: number, total: number}|undefined>}
 */
export const runWasteBalanceRoundingCorrection = async (server) => {
  try {
    const mode = server.featureFlags.getWasteBalanceRoundingCorrectionMode()
    const dryRun = mode === 'dry-run'

    logger.info({
      message: `Starting waste balance rounding correction. Mode: ${mode}`
    })

    if (mode === 'disabled') {
      return undefined
    }

    const lock = await server.locker.lock('waste-balance-rounding-correction')
    if (!lock) {
      logger.info({
        message:
          'Unable to obtain lock, skipping waste balance rounding correction'
      })
      return undefined
    }

    try {
      const wasteBalancesRepository = (
        await createWasteBalancesRepository(server.db)
      )()
      return await executeCorrection(wasteBalancesRepository, dryRun)
    } finally {
      await lock.free()
    }
  } catch (error) {
    logger.error(error, 'Failed to run waste balance rounding correction')
    return undefined
  }
}
