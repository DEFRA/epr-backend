import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import Joi from 'joi'

import { WASTE_BALANCE_CANONICAL_SOURCE } from '#waste-balances/domain/model.js'
import { promoteAccreditation } from '#server/run-stream-promotion.js'

/** @import {HapiRequest} from '#common/hapi-types.js' */

/**
 * @typedef {HapiRequest & {
 *   wasteBalancesRepository: import('#waste-balances/repository/port.js').WasteBalancesRepository
 *   streamRepository: import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository
 *   organisationsRepository: import('#repositories/organisations/port.js').OrganisationsRepository
 *   packagingRecyclingNotesRepository: import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository
 *   wasteRecordsRepository: import('#repositories/waste-records/port.js').WasteRecordsRepository
 *   overseasSitesRepository: import('#overseas-sites/repository/port.js').OverseasSitesRepository
 *   summaryLogsRepository: import('#repositories/summary-logs/port.js').SummaryLogsRepository
 *   params: { accreditationId: string }
 * }} PromoteToLedgerRequest
 */

export const devWasteBalancesPromoteToLedgerPath =
  '/v1/dev/waste-balances/{accreditationId}/promote-to-ledger'

const params = Joi.object({
  accreditationId: Joi.string().trim().min(1).required()
}).messages({
  'any.required': '{#label} is required',
  'string.empty': '{#label} cannot be empty',
  'string.min': '{#label} cannot be empty'
})

/**
 * Promote a single accreditation's waste balance from embedded to ledger.
 *
 * @param {PromoteToLedgerRequest} request
 * @param {Object} h - Hapi response toolkit
 */
async function handler(request, h) {
  const { accreditationId } = request.params
  const { wasteBalancesRepository, streamRepository } = request

  // Look up the waste balance
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (!balance) {
    throw Boom.notFound(
      `No waste balance found for accreditation ${accreditationId}`
    )
  }

  // Already promoted: idempotent no-op
  if (balance.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.LEDGER) {
    return h.response({ result: 'already-promoted' }).code(StatusCodes.OK)
  }

  // Stuck migrating: reset to embedded so promoteAccreditation can proceed
  if (balance.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING) {
    await wasteBalancesRepository.resetCanonicalSourceToEmbedded({
      accreditationId
    })
  }

  const deps = {
    wasteBalancesRepository,
    streamRepository,
    organisationsRepository: request.organisationsRepository,
    prnRepository: request.packagingRecyclingNotesRepository,
    wasteRecordsRepository: request.wasteRecordsRepository,
    overseasSitesRepository: request.overseasSitesRepository,
    summaryLogsRepository: request.summaryLogsRepository
  }

  const row = {
    accreditationId,
    organisationId: balance.organisationId,
    registrationId: balance.registrationId
  }

  const result = await promoteAccreditation(row, deps)

  if (result !== 'promoted') {
    throw Boom.internal(
      `Promotion failed for accreditation ${accreditationId}: ${result}`
    )
  }

  // Read the event count from the stream after promotion
  const latestEvent = await streamRepository.findLatestByPartition(
    balance.registrationId,
    accreditationId
  )
  const eventCount = latestEvent?.number ?? 0

  return h.response({ result: 'promoted', eventCount }).code(StatusCodes.OK)
}

export const devWasteBalancesPromoteToLedgerPost = {
  method: 'POST',
  path: devWasteBalancesPromoteToLedgerPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: {
      params
    }
  },
  handler
}
