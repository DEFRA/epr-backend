import { describe, expect, it } from 'vitest'

import {
  approvedTimelineFrom,
  buildReadAccreditation,
  buildReadApprovedOrganisation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadOrganisation,
  buildReadOrganisationWithNumbersOf,
  buildReadReprocessorRegistration,
  servedOrganisations
} from './read-model-test-data.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'

describe('read-model-test-data', () => {
  describe('approvedTimelineFrom', () => {
    it('puts created no later than approved, whatever the approval date', () => {
      const [created, approved] = approvedTimelineFrom('2025-03-01')

      expect(created).toEqual({
        status: 'created',
        at: '2025-03-01T00:00:00.000Z',
        updatedAt: '2025-03-01T00:00:00.000Z'
      })
      expect(approved).toEqual({
        status: 'approved',
        at: '2025-03-01T00:00:00.000Z',
        updatedAt: '2025-03-01T00:00:00.000Z'
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
        accreditations: { 2026: buildReadExporterAccreditation() }
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
        accreditations: {
          2027: buildReadExporterAccreditation({
            status: {
              current: 'approved',
              timeline: approvedTimelineFrom('2027-01-01')
            }
          })
        }
      })

      expect(registration.standingByDate).toEqual({
        2026: { '2026-02-01': { standing: 'registeredOnly' } },
        2027: { '2027-01-01': { standing: 'accredited' } }
      })
    })

    it('keeps a standingByDate it is given', () => {
      const standingByDate = {
        2026: {
          '2026-01-01': { standing: /** @type {const} */ ('accredited') }
        }
      }

      expect(build({ standingByDate }).standingByDate).toBe(standingByDate)
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
      expect(organisation.registrations['R-EXP'].wasteProcessingType).toBe(
        'exporter'
      )
      expect(organisation.registrations['R-REP'].wasteProcessingType).toBe(
        'reprocessor'
      )
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
})
