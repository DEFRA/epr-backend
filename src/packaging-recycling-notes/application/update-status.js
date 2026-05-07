import Boom from '@hapi/boom'

import { prnMetrics } from './metrics.js'
import {
  PRN_STATUS,
  validateTransition,
  assertAccreditationNotSuspended
} from '#packaging-recycling-notes/domain/model.js'
import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'

/** Suffixes A-Z for collision avoidance */
const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const STATUS_OPERATION_SLOT = Object.freeze({
  [PRN_STATUS.AWAITING_AUTHORISATION]: 'created',
  [PRN_STATUS.ACCEPTED]: 'accepted',
  [PRN_STATUS.AWAITING_CANCELLATION]: 'rejected',
  [PRN_STATUS.DELETED]: 'deleted',
  [PRN_STATUS.CANCELLED]: 'cancelled'
})

/**
 * @typedef {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#waste-balances/repository/port.js').WasteBalancesRepository} WasteBalancesRepository
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
 * Credits both amount and availableAmount when cancelling an issued PRN.
 * Reverses both the creation ringfence and the issue deduction.
 *
 * @param {WasteBalancesRepository} wasteBalancesRepository
 * @param {Object} params
 */
async function creditFullBalanceIfNeeded(wasteBalancesRepository, params) {
  const { accreditationId, organisationId, prnId, tonnage, userId } = params
  const balance =
    await wasteBalancesRepository.findByAccreditationId(accreditationId)

  if (balance) {
    await wasteBalancesRepository.creditFullBalanceForIssuedPrnCancellation({
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

  if (
    newStatus === PRN_STATUS.CANCELLED &&
    currentStatus === PRN_STATUS.AWAITING_CANCELLATION
  ) {
    await creditFullBalanceIfNeeded(wasteBalancesRepository, balanceParams)
  }

  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    await deductTotalBalanceIfNeeded(wasteBalancesRepository, balanceParams)
  }
}

/**
 * Performs the repository write for a status transition.
 * Issuance (AWAITING_ACCEPTANCE) verifies the accreditation and
 * generates a unique PRN number; all other transitions just stamp
 * an operation slot and update.
 *
 * @param {Object} params
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
async function applyStatusUpdate({
  prnRepository,
  organisationsRepository,
  prn,
  updateParams,
  newStatus,
  organisationId,
  accreditationId,
  user,
  now
}) {
  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    updateParams.operation = {
      slot: 'issued',
      at: now,
      by: { id: user.id, name: user.name }
    }

    const accreditation = await organisationsRepository.findAccreditationById(
      organisationId,
      accreditationId
    )

    assertAccreditationNotSuspended(accreditation)

    return issuePrnWithRetry(prnRepository, updateParams, {
      regulator: accreditation.submittedToRegulator,
      isExport: prn.isExport,
      accreditationYear: prn.accreditation.accreditationYear
    })
  }

  const operationSlot = STATUS_OPERATION_SLOT[newStatus]
  if (operationSlot) {
    updateParams.operation = { slot: operationSlot, at: now, by: user }
  }

  const updatedPrn = await prnRepository.updateStatus(updateParams)
  if (!updatedPrn) {
    throw Boom.badImplementation('Failed to update PRN status')
  }
  return updatedPrn
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
 * @param {import('#packaging-recycling-notes/domain/model.js').PrnActor} params.actor
 * @param {{ id: string; name: string }} params.user
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} [params.providedPrn] - Optional pre-fetched PRN to avoid duplicate fetch
 * @param {Date} [params.updatedAt] - Optional timestamp override (defaults to now)
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
  actor,
  user,
  providedPrn,
  updatedAt
}) {
  const prn = providedPrn ?? (await prnRepository.findById(id))

  if (
    !prn ||
    prn.organisation.id !== organisationId ||
    prn.accreditation.id !== accreditationId
  ) {
    throw Boom.notFound(`PRN not found: ${id}`)
  }

  const currentStatus = prn.status.currentStatus
  validateTransition(currentStatus, newStatus, actor)

  const balanceEffectsParams = {
    currentStatus,
    newStatus,
    accreditationId,
    organisationId,
    prnId: id,
    tonnage: prn.tonnage,
    userId: user.id
  }

  const isCreation = newStatus === PRN_STATUS.AWAITING_AUTHORISATION

  // Pre-flight balance effect is kept only for new-PRN creation, where a
  // post-CAS balance failure would strand the PRN in a state with no
  // legal user exit. For transitions on an existing PRN (issuance,
  // cancellation, deletion) the per-PRN CAS gates the balance write so
  // concurrent writers cannot double-debit or double-credit.
  if (isCreation) {
    await applyWasteBalanceEffects(
      wasteBalancesRepository,
      balanceEffectsParams
    )
  }

  const now = updatedAt ?? new Date()
  const updateParams = {
    id,
    version: prn.version,
    status: newStatus,
    updatedBy: user,
    updatedAt: now
  }

  const updatedPrn = await applyStatusUpdate({
    prnRepository,
    organisationsRepository,
    prn,
    updateParams,
    newStatus,
    organisationId,
    accreditationId,
    user,
    now
  })

  if (!isCreation) {
    await applyWasteBalanceEffects(
      wasteBalancesRepository,
      balanceEffectsParams
    )
  }

  await prnMetrics.recordStatusTransition({
    fromStatus: currentStatus,
    toStatus: newStatus,
    material: prn.accreditation.material,
    isExport: prn.isExport
  })

  return updatedPrn
}
