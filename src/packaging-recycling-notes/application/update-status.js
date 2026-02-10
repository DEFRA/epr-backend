import Boom from '@hapi/boom'

import { prnMetrics } from './metrics.js'
import {
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS
} from '#packaging-recycling-notes/domain/model.js'
import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'

/** Suffixes A-Z for collision avoidance */
const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const STATUS_OPERATION_SLOT = Object.freeze({
  [PRN_STATUS.DELETED]: 'deleted',
  [PRN_STATUS.CANCELLED]: 'cancelled'
})

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#repositories/waste-balances/port.js').WasteBalancesRepository} WasteBalancesRepository
 * @typedef {import('#repositories/organisations/port.js').OrganisationsRepository} OrganisationsRepository
 */

/**
 * Issues a PRN with retry logic for PRN number collisions.
 * Tries without suffix first, then A-Z on collision.
 *
 * @param {PackagingRecyclingNotesRepository} repository
 * @param {Object} updateParams - Parameters for updateStatus
 * @param {Object} prnParams - Parameters for PRN number generation
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
async function issuePrnWithRetry(repository, updateParams, prnParams) {
  const suffixAttempts = [undefined, ...COLLISION_SUFFIXES]

  for (const suffix of suffixAttempts) {
    const prnNumber = generatePrnNumber({ ...prnParams, suffix })

    try {
      const result = await repository.updateStatus({
        ...updateParams,
        prnNumber
      })
      if (!result) {
        throw new Error('Failed to update PRN status')
      }
      return result
    } catch (error) {
      if (error instanceof PrnNumberConflictError) {
        continue
      }
      throw error
    }
  }

  throw new Error('Unable to generate unique PRN number after all retries')
}

/**
 * Deducts available waste balance when creating a PRN.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
async function deductWasteBalanceIfNeeded(wasteBalancesRepository, params) {
  const { accreditationId, organisationId, prnId, tonnage, userId } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    if ((balance.availableAmount ?? 0) < tonnage) {
      throw Boom.conflict('Insufficient available waste balance')
    }

    await wasteBalancesRepository.deductAvailableBalanceForPrnCreation({
      accreditationId,
      organisationId,
      prnId,
      tonnage,
      userId
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Deducts total waste balance when issuing a PRN.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
async function deductTotalBalanceIfNeeded(wasteBalancesRepository, params) {
  const { accreditationId, organisationId, prnId, tonnage, userId } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    if ((balance.amount ?? 0) < tonnage) {
      throw Boom.conflict('Insufficient total waste balance')
    }

    await wasteBalancesRepository.deductTotalBalanceForPrnIssue({
      accreditationId,
      organisationId,
      prnId,
      tonnage,
      userId
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Credits available waste balance when cancelling a PRN from awaiting_authorisation.
 * Reverses the ringfencing that occurred when the PRN was created.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
async function creditWasteBalanceIfNeeded(wasteBalancesRepository, params) {
  const { accreditationId, organisationId, prnId, tonnage, userId } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    await wasteBalancesRepository.creditAvailableBalanceForPrnCancellation({
      accreditationId,
      organisationId,
      prnId,
      tonnage,
      userId
    })
  } else {
    throw Boom.badRequest(
      `No waste balance found for accreditation: ${accreditationId}`
    )
  }
}

/**
 * Applies waste balance side effects for a status transition.
 * Each transition type is mutually exclusive based on newStatus.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
async function applyWasteBalanceEffects(wasteBalancesRepository, params) {
  const { currentStatus, newStatus, ...balanceParams } = params

  if (newStatus === PRN_STATUS.AWAITING_AUTHORISATION) {
    await deductWasteBalanceIfNeeded(wasteBalancesRepository, balanceParams)
  }

  if (
    (newStatus === PRN_STATUS.CANCELLED || newStatus === PRN_STATUS.DELETED) &&
    currentStatus === PRN_STATUS.AWAITING_AUTHORISATION
  ) {
    await creditWasteBalanceIfNeeded(wasteBalancesRepository, balanceParams)
  }

  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    await deductTotalBalanceIfNeeded(wasteBalancesRepository, balanceParams)
  }
}

/**
 * Updates PRN status with all business logic
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {WasteBalancesRepository} params.wasteBalancesRepository
 * @param {OrganisationsRepository} params.organisationsRepository
 * @param {string} params.id
 * @param {string} params.organisationId
 * @param {string} params.accreditationId
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnStatus} params.newStatus
 * @param {{ id: string; name: string }} params.user
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} [params.providedPrn] - Optional pre-fetched PRN to avoid duplicate fetch
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
export async function updatePrnStatus({
  prnRepository,
  wasteBalancesRepository,
  organisationsRepository,
  id,
  organisationId,
  accreditationId,
  newStatus,
  user,
  providedPrn
}) {
  const prn = providedPrn ?? (await prnRepository.findById(id))

  if (
    !prn ||
    prn.organisation?.id !== organisationId ||
    prn.accreditation?.id !== accreditationId
  ) {
    throw Boom.notFound(`PRN not found: ${id}`)
  }

  const currentStatus = prn.status.currentStatus
  const allowedTransitions = PRN_STATUS_TRANSITIONS[currentStatus] || []
  if (!allowedTransitions.includes(newStatus)) {
    throw Boom.badRequest(
      `Invalid status transition: ${currentStatus} -> ${newStatus}`
    )
  }

  await applyWasteBalanceEffects(wasteBalancesRepository, {
    currentStatus,
    newStatus,
    accreditationId,
    organisationId,
    prnId: id,
    tonnage: prn.tonnage,
    userId: user.id
  })

  const now = new Date()
  const updateParams = {
    id,
    status: newStatus,
    updatedBy: user,
    updatedAt: now
  }

  // Issue with PRN number generation and collision retry
  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    updateParams.operation = {
      slot: 'issued',
      at: now,
      by: { id: user.id, name: user.name, position: '' }
    }

    const accreditation = await organisationsRepository.findAccreditationById(
      organisationId,
      accreditationId
    )

    const issuedPrn = await issuePrnWithRetry(prnRepository, updateParams, {
      regulator: accreditation.submittedToRegulator,
      isExport: prn.isExport,
      accreditationYear: prn.accreditation?.accreditationYear
    })

    await prnMetrics.recordStatusTransition({
      fromStatus: currentStatus,
      toStatus: newStatus,
      material: prn.accreditation?.material,
      isExport: prn.isExport
    })

    return issuedPrn
  }

  // Add business operation slot for transitions that have one
  const operationSlot = STATUS_OPERATION_SLOT[newStatus]
  if (operationSlot) {
    updateParams.operation = { slot: operationSlot, at: now, by: user }
  }

  // Simple status update without PRN number
  const updatedPrn = await prnRepository.updateStatus(updateParams)

  if (!updatedPrn) {
    throw Boom.badImplementation('Failed to update PRN status')
  }

  await prnMetrics.recordStatusTransition({
    fromStatus: currentStatus,
    toStatus: newStatus,
    material: prn.accreditation?.material,
    isExport: prn.isExport
  })

  return updatedPrn
}
