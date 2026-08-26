/**
 * Persisting a PRN as it is issued, which is where its number is stamped. The
 * number is generated rather than stored, so it can collide with one already
 * taken; everything here exists to settle that collision.
 */

import Boom from '@hapi/boom'

import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'

/** Suffixes A-Z for PRN-number collision avoidance on issuance */
const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Persist a projected PRN, retrying with new PRN number suffixes when the
 * generated one collides. `prnNumber` is the only field that changes between
 * attempts.
 *
 * @param {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @param {Object} issued
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} issued.projection
 * @param {number} issued.expectedVersion
 * @param {import('#domain/organisations/accreditation.js').Accreditation} issued.accreditation
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
export async function persistIssuedPrn(
  prnRepository,
  { projection, expectedVersion, accreditation }
) {
  const prnNumberParams = {
    regulator: accreditation.submittedToRegulator,
    isExport: projection.isExport,
    accreditationYear: projection.accreditation.accreditationYear
  }

  for (const suffix of [undefined, ...COLLISION_SUFFIXES]) {
    const prnNumber = generatePrnNumber({ ...prnNumberParams, suffix })

    try {
      const result = await prnRepository.persistProjection({
        projection: { ...projection, prnNumber },
        expectedVersion
      })
      if (!result) {
        throw Boom.badImplementation('Failed to persist PRN projection')
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
