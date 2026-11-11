import { afterEach, beforeEach, describe, expect, vi } from 'vitest'

import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { config } from '#root/config.js'
import { buildExternalAccreditation } from '#organisation-read-model/repository/contract/test-data.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  ACCREDITATION_NUMBER,
  APPROVED_SITE_ID,
  EXPORTER_NUMBER,
  MISSING_SITE_ID,
  REPROCESSOR_NUMBER,
  accreditation,
  approvedTimeline,
  exporter,
  findOrganisation,
  overseasSites,
  reprocessor
} from './organisation-read-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { OrganisationReadRepositoryContractIt } from '../port.contract.js' */

/** @param {string} registrationNumber */
const externalAccreditationOf = (registrationNumber) =>
  buildExternalAccreditation({
    registrationNumber: toRegistrationNumber(registrationNumber)
  })

const externalAccreditation2027 = {
  accreditationNumber: 'A27ER5000560000AL',
  prnIssuance: { tonnageBand: 'up_to_500' },
  status: {
    current: 'approved',
    timeline: [
      {
        status: 'approved',
        at: '2027-01-01T00:00:00.000Z',
        updatedAt: '2026-12-14T10:31:00.000Z'
      }
    ]
  }
}

const storedAccreditation2026 = {
  accreditationNumber: ACCREDITATION_NUMBER,
  prnIssuance: { tonnageBand: 'over_10000' },
  status: { current: 'approved', timeline: approvedTimeline('2026-07-01') }
}

/** A reprocessor holding a stored 2026 accreditation. */
const accreditedIn2026 = () => {
  const granted2026 = accreditation()
  return buildOrganisation({
    registrations: [reprocessor({ accreditationId: granted2026.id })],
    accreditations: [granted2026]
  })
}

/** @param {OrganisationReadRepositoryContractIt} it */
export const testExternalAccreditationsBehaviour = (it) => {
  describe('stored and external accreditations together', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10') })
    })

    afterEach(() => {
      vi.useRealTimers()
      config.reset('openNextYear')
    })

    it("serves a registration's stored and external accreditations side by side, each by its year", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = accreditedIn2026()
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [externalAccreditationOf(REPROCESSOR_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations
      ).toStrictEqual({
        2026: storedAccreditation2026,
        2027: externalAccreditation2027
      })
    })

    it('dates the status of each year from the accreditation held for it', async ({
      organisationReadRepositoryWith
    }) => {
      config.set('openNextYear', true)
      const stored = accreditedIn2026()
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [externalAccreditationOf(REPROCESSOR_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].standingByDate
      ).toStrictEqual({
        2026: {
          '2026-02-01': { standing: 'registeredOnly' },
          '2026-07-01': { standing: 'accredited' }
        },
        2027: { '2027-01-01': { standing: 'accredited' } }
      })
    })

    it('leaves out the status dates of an accreditation for a year not yet open', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = accreditedIn2026()
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [externalAccreditationOf(REPROCESSOR_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        Object.keys(
          organisation.registrations[REPROCESSOR_NUMBER].standingByDate
        )
      ).toEqual(['2026'])
    })

    it('serves the external accreditation for a year both hold, and logs the stored one it drops', async ({
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
      const logger = { warn: vi.fn() }
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [externalAccreditationOf(REPROCESSOR_NUMBER)],
        logger
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations
      ).toStrictEqual({ 2027: externalAccreditation2027 })
      expect(logger.warn).toHaveBeenCalledWith({
        message: `Registration ${REPROCESSOR_NUMBER} accreditation year 2027 is held as an external accreditation, so stored accreditation ${ACCREDITATION_NUMBER} is dropped`
      })
    })

    it('gives an external accreditation only to the registration with its number', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessor(), exporter()]
      })
      const other = buildOrganisation({
        registrations: [
          reprocessor({ registrationNumber: 'R26ER5001189999PL' })
        ]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored, other],
        externalAccreditations: [externalAccreditationOf(REPROCESSOR_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )
      const otherOrganisation = await findOrganisation(
        repository,
        other.organisationNumber
      )

      expect(
        organisation.registrations[EXPORTER_NUMBER].accreditations
      ).toStrictEqual({})
      expect(
        otherOrganisation.registrations.R26ER5001189999PL.accreditations
      ).toStrictEqual({})
    })

    it('serves nothing for an external accreditation whose registration no organisation holds', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [reprocessor()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [externalAccreditationOf('R26ER5001189999PL')]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(Object.keys(organisation.registrations)).toStrictEqual([
        REPROCESSOR_NUMBER
      ])
      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations
      ).toStrictEqual({})
    })

    it('leaves out a registration the model drops, even when it holds an external accreditation', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [reprocessor(), exporter({ validFrom: null })]
      })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [externalAccreditationOf(EXPORTER_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(Object.keys(organisation.registrations)).toStrictEqual([
        REPROCESSOR_NUMBER
      ])
    })

    it("lists the registration's overseas sites on an exporter's external accreditation", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [exporter()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites,
        externalAccreditations: [externalAccreditationOf(EXPORTER_NUMBER)]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
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

    it("lists an exporter's external accreditation's own overseas sites in place of the registration's", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [exporter()] })
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites,
        externalAccreditations: [
          buildExternalAccreditation({
            registrationNumber: toRegistrationNumber(EXPORTER_NUMBER),
            overseasSites: {
              '001': { status: 'pending' },
              '002': { status: 'approved', approvedOn: '2027-03-01' }
            }
          })
        ]
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[EXPORTER_NUMBER].accreditations[2027]
      ).toStrictEqual({
        ...externalAccreditation2027,
        overseasSites: {
          '001': { status: 'pending' },
          '002': { status: 'approved', approvedOn: '2027-03-01' }
        }
      })
    })

    it("drops an overseas site from an exporter's external accreditation that the registration does not hold, and logs it", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [exporter()] })
      const logger = { warn: vi.fn() }
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites,
        externalAccreditations: [
          buildExternalAccreditation({
            registrationNumber: toRegistrationNumber(EXPORTER_NUMBER),
            overseasSites: {
              '001': { status: 'pending' },
              '003': { status: 'pending' }
            }
          })
        ],
        logger
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[EXPORTER_NUMBER].accreditations[2027]
      ).toStrictEqual({
        ...externalAccreditation2027,
        overseasSites: { '001': { status: 'pending' } }
      })
      expect(logger.warn).toHaveBeenCalledWith({
        message: `Registration ${EXPORTER_NUMBER} accreditation year 2027 lists overseas site 003, which the registration does not hold`
      })
    })

    it("drops every overseas site from an exporter's external accreditation when the registration holds none, and logs them", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [exporter({ overseasSites: undefined })]
      })
      const logger = { warn: vi.fn() }
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [
          buildExternalAccreditation({
            registrationNumber: toRegistrationNumber(EXPORTER_NUMBER),
            overseasSites: { '001': { status: 'pending' } }
          })
        ],
        logger
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[EXPORTER_NUMBER].accreditations[2027]
      ).toStrictEqual({ ...externalAccreditation2027, overseasSites: {} })
      expect(logger.warn).toHaveBeenCalledWith({
        message: `Registration ${EXPORTER_NUMBER} accreditation year 2027 lists overseas site 001, which the registration does not hold`
      })
    })

    it("leaves out an external accreditation's overseas site whose site record no longer exists, without logging that the registration does not hold it", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({
        registrations: [
          exporter({
            overseasSites: {
              '001': { overseasSiteId: APPROVED_SITE_ID },
              '003': { overseasSiteId: MISSING_SITE_ID }
            }
          })
        ]
      })
      const logger = { warn: vi.fn() }
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        overseasSites,
        externalAccreditations: [
          buildExternalAccreditation({
            registrationNumber: toRegistrationNumber(EXPORTER_NUMBER),
            overseasSites: {
              '001': { status: 'pending' },
              '003': { status: 'pending' }
            }
          })
        ],
        logger
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[EXPORTER_NUMBER].accreditations[2027]
      ).toStrictEqual({
        ...externalAccreditation2027,
        overseasSites: { '001': { status: 'pending' } }
      })
      expect(logger.warn).not.toHaveBeenCalledWith({
        message: expect.stringContaining('does not hold')
      })
    })

    it("drops the overseas sites from a reprocessor's external accreditation, and logs it", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = buildOrganisation({ registrations: [reprocessor()] })
      const logger = { warn: vi.fn() }
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [
          buildExternalAccreditation({
            registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
            overseasSites: { '001': { status: 'pending' } }
          })
        ],
        logger
      })

      const organisation = await findOrganisation(
        repository,
        stored.organisationNumber
      )

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations[2027]
      ).toStrictEqual(externalAccreditation2027)
      expect(logger.warn).toHaveBeenCalledWith({
        message: `Registration ${REPROCESSOR_NUMBER} accreditation year 2027 lists overseas sites, but a reprocessor has none`
      })
    })

    it('serves only stored accreditations from find, which does not read external ones yet', async ({
      organisationReadRepositoryWith
    }) => {
      const stored = accreditedIn2026()
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [externalAccreditationOf(REPROCESSOR_NUMBER)]
      })

      const { items } = await repository.find({
        organisationNumber: stored.organisationNumber,
        page: 1,
        pageSize: 10
      })

      expect(
        items[0].registrations[REPROCESSOR_NUMBER].accreditations
      ).toStrictEqual({ 2026: storedAccreditation2026 })
    })

    it("serves a registration's stored and external accreditations from findAll", async ({
      organisationReadRepositoryWith
    }) => {
      const stored = accreditedIn2026()
      const repository = await organisationReadRepositoryWith({
        organisations: [stored],
        externalAccreditations: [externalAccreditationOf(REPROCESSOR_NUMBER)]
      })

      const [organisation] = await repository.findAll()

      expect(
        organisation.registrations[REPROCESSOR_NUMBER].accreditations
      ).toStrictEqual({
        2026: storedAccreditation2026,
        2027: externalAccreditation2027
      })
    })
  })
}
