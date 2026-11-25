import { describe, expect, it } from 'vitest'

import {
  accreditationsByYear,
  approvedStatusFrom,
  approvedTimelineFrom,
  buildReadAccreditation,
  buildReadApprovedOrganisation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadOrganisationWithNumbersOf,
  buildReadReprocessorRegistration,
  servedOrganisations,
  whileRegAccredIsDown,
  withStandingThrough
} from './read-model-test-data.js'
import { toYear } from '#common/helpers/dates/year.js'
import {
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

describe('read-model-test-data', () => {
  describe('approvedTimelineFrom', () => {
    it('is approved from the start of the date given', () => {
      expect(approvedTimelineFrom('2025-03-01')).toEqual([
        { status: 'approved', at: '2025-03-01T00:00:00.000Z' }
      ])
    })
  })

  describe('approvedStatusFrom', () => {
    it('is approved, and was last updated, at the start of the date given', () => {
      expect(approvedStatusFrom('2025-03-01')).toEqual({
        current: 'approved',
        lastUpdatedAt: '2025-03-01T00:00:00.000Z',
        timeline: [{ status: 'approved', at: '2025-03-01T00:00:00.000Z' }]
      })
    })
  })

  describe('buildReadAccreditation', () => {
    it('gives each default accreditation its own number', () => {
      expect(buildReadAccreditation().accreditationNumber).not.toBe(
        buildReadAccreditation().accreditationNumber
      )
    })
  })

  describe('buildReadExporterAccreditation', () => {
    it('builds an accreditation with no overseas sites unless given some', () => {
      expect(buildReadExporterAccreditation().overseasSites).toEqual({})
      expect(
        buildReadExporterAccreditation({
          overseasSites: { '001': { status: 'pending' } }
        }).overseasSites
      ).toEqual({ '001': { status: 'pending' } })
    })
  })

  describe.each([
    ['buildReadReprocessorRegistration', buildReadReprocessorRegistration],
    ['buildReadExporterRegistration', buildReadExporterRegistration]
  ])('%s', (_, build) => {
    it('is registered only from its approval when it has no accreditation', () => {
      expect(build().standingByDate).toEqual({
        2026: { '2026-02-01': { standing: 'registeredOnly' } }
      })
    })

    it('is accredited from its accreditation approval, as the mapper makes it', () => {
      const registration = build({
        accreditations: accreditationsByYear(buildReadExporterAccreditation())
      })

      expect(registration.standingByDate).toEqual({
        2026: {
          '2026-02-01': { standing: 'registeredOnly' },
          '2026-07-01': { standing: 'accredited' }
        }
      })
    })

    it('has a standing for each year up to its latest accreditation', () => {
      const registration = build({
        accreditations: accreditationsByYear(
          buildReadExporterAccreditation({
            status: approvedStatusFrom('2027-01-01'),
            year: toYear(2027)
          })
        )
      })

      expect(registration.standingByDate).toEqual({
        2026: { '2026-02-01': { standing: 'registeredOnly' } },
        2027: { '2027-01-01': { standing: 'accredited' } }
      })
    })
  })

  describe('withStandingThrough', () => {
    it('carries the standing into each year up to the year given', () => {
      const registration = withStandingThrough(
        buildReadReprocessorRegistration(),
        toYear(2028)
      )

      expect(registration.standingByDate).toEqual({
        2026: { '2026-02-01': { standing: 'registeredOnly' } },
        2027: { '2027-01-01': { standing: 'registeredOnly' } },
        2028: { '2028-01-01': { standing: 'registeredOnly' } }
      })
    })
  })

  describe('buildReadApprovedOrganisation', () => {
    it('dates its registration and accreditation from validFrom in the year given', () => {
      const organisation = buildReadApprovedOrganisation({ year: 2027 })
      const [registration] = Object.values(organisation.registrations)

      expect(registration.status.timeline).toEqual(
        approvedTimelineFrom('2027-01-01')
      )
      expect(registration.standingByDate).toEqual({
        2027: { '2027-01-01': { standing: 'accredited' } }
      })
    })

    it('carries its standing to the end of the open year given', () => {
      const organisation = buildReadApprovedOrganisation({
        year: 2025,
        openYear: toYear(2026)
      })
      const [registration] = Object.values(organisation.registrations)

      expect(registration.standingByDate).toEqual({
        2025: { '2025-01-01': { standing: 'accredited' } },
        2026: { '2026-01-01': { standing: 'registeredOnly' } }
      })
    })
  })

  describe('buildReadOrganisationWithNumbersOf', () => {
    it('serves each numbered registration under its number, as the kind of operator it names', () => {
      const organisation = buildReadOrganisationWithNumbersOf({
        organisationNumber: toOrganisationNumber('500001'),
        registrations: [
          { registrationNumber: 'R-EXP', wasteProcessingType: 'exporter' },
          { registrationNumber: 'R-REP', wasteProcessingType: 'reprocessor' }
        ]
      })

      expect(organisation.organisationNumber).toBe('500001')
      expect(
        organisation.registrations[toRegistrationNumber('R-EXP')]
          .wasteProcessingType
      ).toBe('exporter')
      expect(
        organisation.registrations[toRegistrationNumber('R-REP')]
          .wasteProcessingType
      ).toBe('reprocessor')
    })

    it('leaves out registrations that have no number', () => {
      const organisation = buildReadOrganisationWithNumbersOf({
        organisationNumber: toOrganisationNumber('500002'),
        registrations: [{ registrationNumber: null }]
      })

      expect(organisation.registrations).toEqual({})
    })
  })

  describe('servedOrganisations', () => {
    it('serves an organisation added after the repository was taken', async () => {
      const served = servedOrganisations()
      const repository = served.repository()

      const added = served.add(buildReadOrganisation())
      const approved = served.approved()

      expect(await repository.findAll()).toEqual([added, approved])
      expect(
        await repository.findByOrganisationNumber(added.organisationNumber)
      ).toEqual(added)
      const { items } = await repository.find({
        organisationNumber: approved.organisationNumber,
        page: 1,
        pageSize: 10
      })
      expect(items).toEqual([approved])
    })
  })

  describe('whileRegAccredIsDown', () => {
    it('fails a read with no year or for the service’s year, and serves a read for any other year', async () => {
      const served = servedOrganisations()
      const { organisationNumber } = served.approved({ year: 2026 })
      const repository = whileRegAccredIsDown(served.repository())

      await expect(
        repository.findByOrganisationNumber(organisationNumber)
      ).rejects.toThrow('Registration and Accreditation service unavailable')
      await expect(
        repository.findByOrganisationNumber(organisationNumber, {
          year: toYear(2027)
        })
      ).rejects.toThrow('Registration and Accreditation service unavailable')
      expect(
        await repository.findByOrganisationNumber(organisationNumber, {
          year: toYear(2026)
        })
      ).toMatchObject({ organisationNumber })
    })
  })
})
