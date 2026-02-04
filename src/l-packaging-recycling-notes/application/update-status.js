import Boom from '@hapi/boom'

import { prnMetrics } from './metrics.js'
import {
  PRN_STATUS,
  PRN_STATUS_TRANSITIONS
} from '#l-packaging-recycling-notes/domain/model.js'
import { generatePrnNumber } from '#l-packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#l-packaging-recycling-notes/repository/mongodb.js'

/** Suffixes A-Z for collision avoidance */
const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * @typedef {import('#l-packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} PackagingRecyclingNotesRepository
 * @typedef {import('#repositories/waste-balances/port.js').WasteBalancesRepository} WasteBalancesRepository
 */

/**
 * Issues a PRN with retry logic for PRN number collisions.
 * Tries without suffix first, then A-Z on collision.
 *
 * @param {PackagingRecyclingNotesRepository} repository
 * @param {Object} updateParams - Parameters for updateStatus
 * @param {Object} prnParams - Parameters for PRN number generation
 * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
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
    await wasteBalancesRepository.deductAvailableBalanceForPrnCreation({
      accreditationId,
      organisationId,
      prnId,
      tonnage,
      userId
    })
  }
}

/**
 * Updates PRN status with all business logic
 *
 * @param {Object} params
 * @param {PackagingRecyclingNotesRepository} params.prnRepository
 * @param {WasteBalancesRepository} params.wasteBalancesRepository
 * @param {string} params.id
 * @param {string} params.organisationId
 * @param {string} params.accreditationId
 * @param {import('#l-packaging-recycling-notes/domain/model.js').PrnStatus} params.newStatus
 * @param {string} params.userId
 * @returns {Promise<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
export async function updatePrnStatus({
  prnRepository,
  wasteBalancesRepository,
  id,
  organisationId,
  accreditationId,
  newStatus,
  userId
}) {
  const prn = await prnRepository.findById(id)

  if (!prn) {
    throw Boom.notFound(`PRN not found: ${id}`)
  }

  if (
    prn.issuedByOrganisation !== organisationId ||
    prn.issuedByAccreditation !== accreditationId
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

  // Deduct available waste balance when creating PRN
  if (newStatus === PRN_STATUS.AWAITING_AUTHORISATION) {
    await deductWasteBalanceIfNeeded(wasteBalancesRepository, {
      accreditationId,
      organisationId,
      prnId: id,
      tonnage: prn.tonnage,
      userId
    })
  }

  const now = new Date()
  const updateParams = {
    id,
    status: newStatus,
    updatedBy: userId,
    updatedAt: now
  }

  // Issue with PRN number generation and collision retry
  if (newStatus === PRN_STATUS.AWAITING_ACCEPTANCE) {
    const issuedPrn = await issuePrnWithRetry(prnRepository, updateParams, {
      nation: prn.nation,
      isExport: prn.isExport
    })

    await prnMetrics.recordStatusTransition({
      fromStatus: currentStatus,
      toStatus: newStatus,
      material: prn.material,
      isExport: prn.isExport
    })

    return issuedPrn
  }

  // Simple status update without PRN number
  const updatedPrn = await prnRepository.updateStatus(updateParams)

  if (!updatedPrn) {
    throw Boom.badImplementation('Failed to update PRN status')
  }

  await prnMetrics.recordStatusTransition({
    fromStatus: currentStatus,
    toStatus: newStatus,
    material: prn.material,
    isExport: prn.isExport
  })

  return updatedPrn
}
