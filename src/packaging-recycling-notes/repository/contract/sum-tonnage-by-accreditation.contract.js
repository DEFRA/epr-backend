import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { beforeEach, describe, expect } from 'vitest'
import {
  buildAccreditationId,
  buildAwaitingAcceptancePrn,
  buildCancelledPrn,
  buildDeletedPrn,
  buildDraftPrn,
  underAccreditation
} from './test-data.js'

/** @import { AccreditationTonnage, PackagingRecyclingNotesRepository as PrnRepository } from '../port.js' */
/** @import { RegistrationOrAccreditationId } from '#waste-balances/repository/ledger-schema.js' */

const EXCLUDE_DELETED = { excludeStatuses: [PRN_STATUS.DELETED] }

/**
 * The Mongo test database is shared across the tests in a file, so a test
 * reads back only the accreditations it created.
 *
 * @param {AccreditationTonnage[]} totals
 * @param {RegistrationOrAccreditationId} id
 */
const totalFor = (totals, id) =>
  totals.find(
    (total) =>
      total.id.organisationId === id.organisationId &&
      total.id.registrationId === id.registrationId &&
      total.id.accreditationId === id.accreditationId
  )

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

    it('totals an accreditation’s tonnage by current status', async () => {
      const accreditation = buildAccreditationId()
      await repository.create(
        buildDraftPrn(underAccreditation(accreditation, { tonnage: 10 }))
      )
      await repository.create(
        buildAwaitingAcceptancePrn(
          underAccreditation(accreditation, { tonnage: 20 })
        )
      )
      await repository.create(
        buildAwaitingAcceptancePrn(
          underAccreditation(accreditation, { tonnage: 30 })
        )
      )
      await repository.create(
        buildCancelledPrn(underAccreditation(accreditation, { tonnage: 40 }))
      )

      const totals = await repository.sumTonnageByAccreditation(EXCLUDE_DELETED)

      expect(totalFor(totals, accreditation)).toStrictEqual({
        id: accreditation,
        tonnageByStatus: {
          [PRN_STATUS.DRAFT]: 10,
          [PRN_STATUS.AWAITING_ACCEPTANCE]: 50,
          [PRN_STATUS.CANCELLED]: 40
        }
      })
    })

    it('leaves out PRNs in an excluded status', async () => {
      const accreditation = buildAccreditationId()
      await repository.create(
        buildDraftPrn(underAccreditation(accreditation, { tonnage: 10 }))
      )
      await repository.create(
        buildDeletedPrn(underAccreditation(accreditation, { tonnage: 99 }))
      )

      const totals = await repository.sumTonnageByAccreditation(EXCLUDE_DELETED)

      expect(totalFor(totals, accreditation)?.tonnageByStatus).toStrictEqual({
        [PRN_STATUS.DRAFT]: 10
      })
    })

    it('omits an accreditation whose PRNs are all excluded', async () => {
      const accreditation = buildAccreditationId()
      await repository.create(
        buildDeletedPrn(underAccreditation(accreditation, { tonnage: 99 }))
      )

      const totals = await repository.sumTonnageByAccreditation(EXCLUDE_DELETED)

      expect(totalFor(totals, accreditation)).toBeUndefined()
    })

    it('keeps accreditations apart', async () => {
      const first = buildAccreditationId()
      const second = buildAccreditationId()
      await repository.create(
        buildDraftPrn(underAccreditation(first, { tonnage: 10 }))
      )
      await repository.create(
        buildDraftPrn(underAccreditation(second, { tonnage: 20 }))
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
      const accreditation = buildAccreditationId()
      await repository.create(
        buildDraftPrn(
          underAccreditation(accreditation, {
            organisation: {
              id: accreditation.organisationId,
              name: 'Name when raised'
            },
            tonnage: 10
          })
        )
      )
      await repository.create(
        buildDraftPrn(
          underAccreditation(accreditation, {
            organisation: {
              id: accreditation.organisationId,
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
