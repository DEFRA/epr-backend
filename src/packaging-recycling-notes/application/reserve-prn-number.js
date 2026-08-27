import Boom from '@hapi/boom'

import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'

const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Give the note a number if it has not got one, retrying with a new suffix
 * while the generated one is already taken. The number is generated rather than
 * stored, so the unique index on it is the only way to find out it collides.
 *
 * @param {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @param {Object} issuing
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} issuing.prn
 * @param {import('#domain/organisations/accreditation.js').Accreditation} issuing.accreditation
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
export async function reservePrnNumber(prnRepository, { prn, accreditation }) {
  if (prn.prnNumber) {
    return prn
  }

  const prnNumberParams = {
    regulator: accreditation.submittedToRegulator,
    isExport: prn.isExport,
    accreditationYear: prn.accreditation.accreditationYear
  }

  for (const suffix of [undefined, ...COLLISION_SUFFIXES]) {
    const prnNumber = generatePrnNumber({ ...prnNumberParams, suffix })

    try {
      const result = await prnRepository.persistProjection({
        projection: { ...prn, prnNumber },
        expectedVersion: prn.version
      })
      if (!result) {
        throw Boom.badImplementation("Failed to write the PRN's number")
      }
      return result
    } catch (error) {
      if (error instanceof PrnNumberConflictError) {
        continue
      }
      throw error
    }
  }

  throw Boom.badImplementation(
    'Unable to generate unique PRN number after all retries'
  )
}
