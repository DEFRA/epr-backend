import Boom from '@hapi/boom'

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

  // Deduct available waste balance when creating PRN (transitioning to awaiting_authorisation)
  if (newStatus === PRN_STATUS.AWAITING_AUTHORISATION) {
    const balance =
      await wasteBalancesRepository.findByAccreditationId(accreditationId)
    if (balance) {
      await wasteBalancesRepository.deductAvailableBalanceForPrnCreation({
        accreditationId,
        organisationId,
        prnId: id,
        tonnage: prn.tonnage,
        userId
      })
    }
  }

  const now = new Date()
  const isIssuing = newStatus === PRN_STATUS.AWAITING_ACCEPTANCE

  if (isIssuing) {
    // Issue with collision retry logic
    const suffixAttempts = [undefined, ...COLLISION_SUFFIXES]

    for (const suffix of suffixAttempts) {
      const prnNumber = generatePrnNumber({
        nation: prn.nation,
        isExport: prn.isExport,
        suffix
      })

      try {
        return await prnRepository.updateStatus({
          id,
          status: newStatus,
          updatedBy: userId,
          updatedAt: now,
          prnNumber
        })
      } catch (error) {
        if (error instanceof PrnNumberConflictError) {
          continue
        }
        throw error
      }
    }

    throw new Error('Unable to generate unique PRN number after all retries')
  }

  // Simple status update without PRN number
  const updatedPrn = await prnRepository.updateStatus({
    id,
    status: newStatus,
    updatedBy: userId,
    updatedAt: now
  })

  if (!updatedPrn) {
    throw Boom.badImplementation('Failed to update PRN status')
  }

  return updatedPrn
}
