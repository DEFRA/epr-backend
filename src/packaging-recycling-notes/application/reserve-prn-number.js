/**
 * Reserving the number a note is about to be issued with. The number is
 * generated rather than stored, so it can collide with one already taken;
 * everything here exists to settle that collision.
 */

import Boom from '@hapi/boom'

import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'

/** Suffixes A-Z for PRN-number collision avoidance on issuance */
const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Write the note's number onto its document, retrying with a new suffix while
 * the generated one is already taken. The unique index on the number is what
 * settles the collision, so the write is the only way to find out; `prnNumber`
 * is the only field that changes between attempts.
 *
 * This runs before the issuance event is appended, so that no reader can see
 * the event announcing the issue without also seeing the number it was issued
 * with. The cost falls on the issuance that is then refused, because a
 * competing writer took the ledger slot: the note is left holding the number it
 * did not get to use — replaced by the next issuance attempt, and announced by
 * no event of that note's in the meantime — and the competing writer, having
 * read the note before this write, finds its own version stale. Both are
 * tracked separately.
 *
 * @param {import('#packaging-recycling-notes/repository/port.js').PackagingRecyclingNotesRepository} prnRepository
 * @param {Object} issuing
 * @param {import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote} issuing.prn
 * @param {import('#domain/organisations/accreditation.js').Accreditation} issuing.accreditation
 * @returns {Promise<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>}
 */
export async function reservePrnNumber(prnRepository, { prn, accreditation }) {
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
