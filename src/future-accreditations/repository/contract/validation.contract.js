import { describe, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { REGISTRATION_NUMBER, buildFutureAccreditation } from './test-data.js'

/** @import { FutureAccreditationsContractIt } from '../port.contract.js' */

/** @param {FutureAccreditationsContractIt} it */
export const testValidationBehaviour = (it) => {
  describe('validation', () => {
    it.for([
      {
        description: 'a year the REEX database holds accreditations for',
        accreditation: buildFutureAccreditation({ year: toYear(2026) })
      },
      {
        description: 'no accreditation number',
        accreditation: buildFutureAccreditation({
          accreditationNumber: toAccreditationNumber('')
        })
      },
      {
        description: 'an unknown status',
        accreditation: buildFutureAccreditation({
          status: {
            current: /** @type {any} */ ('pending'),
            timeline: []
          }
        })
      },
      {
        description: 'an unknown tonnage band',
        accreditation: buildFutureAccreditation({
          prnIssuance: { tonnageBand: 'lots' }
        })
      }
    ])(
      'should refuse to store an accreditation with $description',
      async ({ accreditation }, { futureAccreditationsRepository }) => {
        await expect(
          futureAccreditationsRepository.upsert(accreditation)
        ).rejects.toHaveProperty('output.statusCode', 422)

        expect(
          await futureAccreditationsRepository.findByRegistrationNumbers([
            REGISTRATION_NUMBER
          ])
        ).toStrictEqual([])
      }
    )
  })
}
