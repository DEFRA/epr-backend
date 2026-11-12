import { describe, expect, it } from 'vitest'

import { buildReadOrganisationWithNumbersOf } from './read-model-test-data.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'

describe('read-model-test-data', () => {
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
})
