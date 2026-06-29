import Boom from '@hapi/boom'

import { validateAccreditationId } from './validation.js'
import { appendToStream } from '../application/append-to-stream.js'
import { STREAM_EVENT_KIND } from './stream-schema.js'

/**
 * Append a PRN event to the stream.
 *
 * @param {Object} params
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} params.streamRepository
 * @param {string} params.registrationId
 * @param {string} params.accreditationId
 * @param {string} params.organisationId
 * @param {string} params.prnId
 * @param {number} params.tonnage
 * @param {import('./stream-schema.js').StreamUserSummary} params.createdBy
 * @param {import('./stream-schema.js').StreamEventKind} params.streamKind
 * @param {number} params.expectedHead - Stream position the caller's decision
 *   was based on; the event is written at `expectedHead + 1`.
 * @returns {Promise<import('./stream-port.js').StreamEvent>} The appended event.
 */
const appendPrnStreamEvent = async ({
  streamRepository,
  registrationId,
  accreditationId,
  organisationId,
  prnId,
  tonnage,
  createdBy,
  streamKind,
  expectedHead
}) =>
  appendToStream(
    {
      repository: streamRepository,
      registrationId,
      accreditationId,
      organisationId,
      expectedHead
    },
    {
      kind: streamKind,
      payload: { prnId, amount: tonnage },
      createdBy
    }
  )

/**
 * Append a PRN stream event with no balance side-effect (PRN_ACCEPTED,
 * PRN_REJECTED). Throws when no balance document exists for the accreditation.
 *
 * @param {Object} params
 * @param {Object} params.appendParams
 * @param {string} params.appendParams.accreditationId
 * @param {string} params.appendParams.registrationId
 * @param {string} params.appendParams.organisationId
 * @param {string} params.appendParams.prnId
 * @param {number} params.appendParams.tonnage
 * @param {import('./stream-schema.js').StreamUserSummary} params.appendParams.createdBy
 * @param {import('./stream-schema.js').StreamEventKind} params.appendParams.streamKind
 * @param {(partition: { registrationId: string, accreditationId: string }) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {Object} params.dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} params.dependencies.streamRepository
 * @returns {Promise<import('./stream-port.js').StreamEvent>}
 */
export const performAppendPrnStreamEvent = async ({
  appendParams,
  findBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    streamKind
  } = appendParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance({
    registrationId,
    accreditationId: validatedAccreditationId
  })

  if (!wasteBalance) {
    throw Boom.badImplementation(
      `appendStreamEvent requires a stream-backed balance (accreditation ${validatedAccreditationId})`
    )
  }

  return appendPrnStreamEvent({
    streamRepository: dependencies.streamRepository,
    registrationId,
    accreditationId: validatedAccreditationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    streamKind,
    expectedHead: wasteBalance.eventNumber
  })
}

/**
 * Deduct available balance for PRN creation (ringfencing tonnage).
 *
 * @param {Object} params
 * @param {import('./port.js').DeductAvailableBalanceParams} params.deductParams
 * @param {(partition: { registrationId: string, accreditationId: string }) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {Object} params.dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} params.dependencies.streamRepository
 * @returns {Promise<import('./stream-port.js').StreamEvent | null>} The appended
 *   stream event, or `null` when no balance exists.
 */
export const performDeductAvailableBalanceForPrnCreation = async ({
  deductParams,
  findBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    expectedHead
  } = deductParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance({
    registrationId,
    accreditationId: validatedAccreditationId
  })

  if (!wasteBalance) {
    return null
  }

  return appendPrnStreamEvent({
    streamRepository: dependencies.streamRepository,
    registrationId,
    accreditationId: validatedAccreditationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    streamKind: STREAM_EVENT_KIND.PRN_CREATED,
    expectedHead
  })
}

/**
 * Deduct total balance for PRN issue (finalising the deduction).
 *
 * @param {Object} params
 * @param {import('./port.js').DeductTotalBalanceParams} params.deductParams
 * @param {(partition: { registrationId: string, accreditationId: string }) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {Object} params.dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} params.dependencies.streamRepository
 * @returns {Promise<import('./stream-port.js').StreamEvent | null>} The appended
 *   stream event, or `null` when no balance exists.
 */
export const performDeductTotalBalanceForPrnIssue = async ({
  deductParams,
  findBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    expectedHead
  } = deductParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance({
    registrationId,
    accreditationId: validatedAccreditationId
  })

  if (!wasteBalance) {
    return null
  }

  return appendPrnStreamEvent({
    streamRepository: dependencies.streamRepository,
    registrationId,
    accreditationId: validatedAccreditationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    streamKind: STREAM_EVENT_KIND.PRN_ISSUED,
    expectedHead
  })
}

/**
 * Credit both amount and available balance for issued PRN cancellation.
 * Reverses both the creation ringfence and the issue deduction.
 *
 * @param {Object} params
 * @param {import('./port.js').CreditAvailableBalanceParams} params.creditParams
 * @param {(partition: { registrationId: string, accreditationId: string }) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {Object} params.dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} params.dependencies.streamRepository
 * @returns {Promise<import('./stream-port.js').StreamEvent>} The appended stream
 *   event. Throws when no balance exists.
 */
export const performCreditFullBalanceForIssuedPrnCancellation = async ({
  creditParams,
  findBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    expectedHead
  } = creditParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance({
    registrationId,
    accreditationId: validatedAccreditationId
  })

  if (!wasteBalance) {
    throw Boom.internal(
      `Waste balance not found for accreditation ${validatedAccreditationId} during PRN cancellation`
    )
  }

  return appendPrnStreamEvent({
    streamRepository: dependencies.streamRepository,
    registrationId,
    accreditationId: validatedAccreditationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    streamKind: STREAM_EVENT_KIND.PRN_CANCELLED_AFTER_ISSUE,
    expectedHead
  })
}

/**
 * Credit available balance for PRN cancellation (reversing the ringfenced
 * tonnage).
 *
 * @param {Object} params
 * @param {import('./port.js').CreditAvailableBalanceParams} params.creditParams
 * @param {(partition: { registrationId: string, accreditationId: string }) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {Object} params.dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} params.dependencies.streamRepository
 * @returns {Promise<import('./stream-port.js').StreamEvent>} The appended stream
 *   event. Throws when no balance exists.
 */
export const performCreditAvailableBalanceForPrnCancellation = async ({
  creditParams,
  findBalance,
  dependencies
}) => {
  const {
    accreditationId,
    registrationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    expectedHead
  } = creditParams
  const validatedAccreditationId = validateAccreditationId(accreditationId)

  const wasteBalance = await findBalance({
    registrationId,
    accreditationId: validatedAccreditationId
  })

  if (!wasteBalance) {
    throw Boom.internal(
      `Waste balance not found for accreditation ${validatedAccreditationId} during PRN cancellation`
    )
  }

  return appendPrnStreamEvent({
    streamRepository: dependencies.streamRepository,
    registrationId,
    accreditationId: validatedAccreditationId,
    organisationId,
    prnId,
    tonnage,
    createdBy,
    streamKind: STREAM_EVENT_KIND.PRN_CREATION_CANCELLED,
    expectedHead
  })
}
