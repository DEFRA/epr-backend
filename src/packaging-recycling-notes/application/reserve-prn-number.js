/**
 * Reserving the number a note is about to be issued with. The number is
 * generated rather than stored, so it can collide with one already taken;
 * everything here exists to settle that collision.
 */

import Boom from '@hapi/boom'

import { generatePrnNumber } from '#packaging-recycling-notes/domain/prn-number-generator.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'

const COLLISION_SUFFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Write the note's number onto its document, retrying with a new suffix while
 * the generated one is already taken. The unique index on the number is what
 * settles the collision, so the write is the only way to find out. The document
 * written is the caught-up projection handed in, so this also flushes the fold
 * the transition was decided against.
 *
 * Running before the append moves where a same-note race is refused: a second
 * issuance fails on this document write rather than at the ledger slot. An
 * issuance refused the slot by another note is left holding a number it did not
 * get to use until its own next attempt replaces it. Both costs are tracked
 * separately.
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
