import { describe, expect } from 'vitest'

import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { buildFutureAccreditation } from '#future-accreditations/repository/contract/test-data.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  exporter,
  findOrganisation,
  overseasSites,
  reprocessor
} from './organisation-read-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

/** @param {string} registrationNumber */
const futureAccreditationOf = (registrationNumber) =>
  buildFutureAccreditation({
    registrationNumber: toRegistrationNumber(registrationNumber)
  })

/** @param {OrganisationReadRepositoryContractIt} it */
export const testFutureAccreditationsBehaviour = (it) => {
  describe('future accreditations', () => {
    it('should serve a future accreditation for a year the registration holds none', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [reprocessor()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        futureAccreditations: [futureAccreditationOf(REPROCESSOR_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        String(stored.orgId)
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations
      ).toStrictEqual({
        2027: {
          accreditationNumber: 'A27ER5000560000AL',
          prnIssuance: { tonnageBand: 'up_to_500' },
          status: {
            current: 'approved',
            timeline: [{ status: 'approved', at: '2027-01-01T00:00:00.000Z' }]
          }
        }
      })
    })

    it('should serve the future accreditation over a stored one for the same year', async ({
      organisationReadRepositoryWith
    }) => {
      const stored2027 = accreditation({
        validFrom: '2027-01-01',
        validTo: '2027-12-31'
      })
      const stored = buildOrganisation({
        registrations: [reprocessor({ accreditationId: stored2027.id })],
        accreditations: [stored2027]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        futureAccreditations: [futureAccreditationOf(REPROCESSOR_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        String(stored.orgId)
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations[2027]
          .accreditationNumber
      ).toBe('A27ER5000560000AL')
    })

    it("should list the registration's overseas sites on an exporter's future accreditation", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [exporter()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites,
        futureAccreditations: [futureAccreditationOf(EXPORTER_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        String(stored.orgId)
      )

      expect(
        organisation.registrations[EXPORTER_NUMBER].accreditations[2027]
      ).toMatchObject({
        overseasSites: {
          '001': { status: 'approved', approvedOn: '2026-01-01' },
          '002': { status: 'pending' }
        }
      })
    })

    it('should work out the registration’s status in the future year', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [reprocessor()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        futureAccreditations: [futureAccreditationOf(REPROCESSOR_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        String(stored.orgId)
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].regAccStatusByDate[2027]
      ).toStrictEqual({ '2027-01-01': { status: 'accredited' } })
    })
  })
}
