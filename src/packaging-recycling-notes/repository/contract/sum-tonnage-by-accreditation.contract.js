import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildAccreditationNaturalKeyId,
  buildAwaitingAcceptancePrn,
  buildCancelledPrn,
  buildDeletedPrn,
  buildDraftPrn,
  underAccreditationNaturalKey
} from './test-data.js'
import { randomUuid } from 'testcontainers'

/** @import { TestAPI } from 'vitest' */
/** @import { AccreditationNaturalKeyId, AccreditationTonnage, PackagingRecyclingNotesRepository as PrnRepository } from '../port.js' */

const EXCLUDE_DELETED = { excludeStatuses: [PRN_STATUS.DELETED] }

/**
 * The Mongo test database is shared across the tests in a file, so a test
 * reads back only the accreditations it created.
 *
 * @param {AccreditationTonnage[]} totals
 * @param { AccreditationNaturalKeyId} id
 */
const totalFor = (totals, id) =>
  totals.find(
    (total) =>
      total.naturalKeyId?.orgId === id.orgId &&
      total.naturalKeyId?.registrationNumber === id.registrationNumber &&
      total.naturalKeyId?.accreditationNumber === id.accreditationNumber
  )

/** @param {TestAPI<{ prnRepository: PrnRepository }>} it */
export const testSumTonnageByAccreditationBehaviour = (it) => {
  describe('sumTonnageByAccreditation', () => {
    /** @type {PrnRepository} */
    let repository

    beforeEach(
      async (
        /** @type {{ prnRepository: PrnRepository }} */ { prnRepository }
      ) => {
        repository = prnRepository
      }
    )

    it("totals an accreditation's tonnage by current status", async () => {
      const accreditation = buildAccreditationNaturalKeyId()

      const newLocal = underAccreditationNaturalKey(accreditation, {
        tonnage: 10
      })
      await repository.create(buildDraftPrn(newLocal))
      await repository.create(
        buildAwaitingAcceptancePrn(
          underAccreditationNaturalKey(accreditation, { tonnage: 20 })
        )
      )
      await repository.create(
        buildAwaitingAcceptancePrn(
          underAccreditationNaturalKey(accreditation, { tonnage: 30 })
        )
      )
      await repository.create(
        buildCancelledPrn(
          underAccreditationNaturalKey(accreditation, { tonnage: 40 })
        )
      )

      const totals = await repository.sumTonnageByAccreditation(EXCLUDE_DELETED)

      expect(totalFor(totals, accreditation)).toStrictEqual({
        // id: accreditation,
        naturalKeyId: {
          accreditationNumber: accreditation.accreditationNumber,
          orgId: accreditation.orgId,
          registrationNumber: accreditation.registrationNumber
        },
        tonnageByStatus: {
          [PRN_STATUS.DRAFT]: 10,
          [PRN_STATUS.AWAITING_ACCEPTANCE]: 50,
          [PRN_STATUS.CANCELLED]: 40
        }
      })
    })

    it('leaves out PRNs in an excluded status', async () => {
      const accreditation = buildAccreditationNaturalKeyId()
      await repository.create(
        buildDraftPrn(
          underAccreditationNaturalKey(accreditation, { tonnage: 10 })
        )
      )
      await repository.create(
        buildDeletedPrn(
          underAccreditationNaturalKey(accreditation, { tonnage: 99 })
        )
      )

      const totals = await repository.sumTonnageByAccreditation(EXCLUDE_DELETED)

      expect(totalFor(totals, accreditation)?.tonnageByStatus).toStrictEqual({
        [PRN_STATUS.DRAFT]: 10
      })
    })

    it('omits an accreditation whose PRNs are all excluded', async () => {
      const accreditation = buildAccreditationNaturalKeyId()
      await repository.create(
        buildDeletedPrn(
          underAccreditationNaturalKey(accreditation, { tonnage: 99 })
        )
      )

      const totals = await repository.sumTonnageByAccreditation(EXCLUDE_DELETED)

      expect(totalFor(totals, accreditation)).toBeUndefined()
    })

    it('keeps accreditations apart', async () => {
      const first = buildAccreditationNaturalKeyId()
      const second = buildAccreditationNaturalKeyId()

      await repository.create(
        buildDraftPrn(underAccreditationNaturalKey(first, { tonnage: 10 }))
      )
      await repository.create(
        buildDraftPrn(underAccreditationNaturalKey(second, { tonnage: 20 }))
      )

      const totals = await repository.sumTonnageByAccreditation(EXCLUDE_DELETED)
      expect(totalFor(totals, first)?.tonnageByStatus).toStrictEqual({
        [PRN_STATUS.DRAFT]: 10
      })
      expect(totalFor(totals, second)?.tonnageByStatus).toStrictEqual({
        [PRN_STATUS.DRAFT]: 20
      })
    })

    it('keys on ids, not on the names a PRN snapshots', async () => {
      const accreditation = buildAccreditationNaturalKeyId()
      await repository.create(
        buildDraftPrn(
          underAccreditationNaturalKey(accreditation, {
            organisation: {
              id: randomUuid(),
              organisationNumber: accreditation.orgId,
              name: 'Name when raised'
            },
            tonnage: 10
          })
        )
      )
      await repository.create(
        buildDraftPrn(
          underAccreditationNaturalKey(accreditation, {
            organisation: {
              id: randomUuid(),
              organisationNumber: accreditation.orgId,
              name: 'Name after a rename'
            },
            tonnage: 20
          })
        )
      )

      const totals = await repository.sumTonnageByAccreditation(EXCLUDE_DELETED)

      expect(totalFor(totals, accreditation)?.tonnageByStatus).toStrictEqual({
        [PRN_STATUS.DRAFT]: 30
      })
    })
  })
}
