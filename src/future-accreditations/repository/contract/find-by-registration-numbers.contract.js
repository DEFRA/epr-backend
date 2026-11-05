import { describe, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import {
  OTHER_REGISTRATION_NUMBER,
  REGISTRATION_NUMBER,
  buildFutureAccreditation
} from './test-data.js'

/** @import { FutureAccreditationsContractIt } from '../port.contract.js' */

/** @param {FutureAccreditationsContractIt} it */
export const testFindByRegistrationNumbersBehaviour = (it) => {
  describe('findByRegistrationNumbers', () => {
    it('should return nothing when given no registration numbers', async ({
      futureAccreditationsRepository
    }) => {
      await futureAccreditationsRepository.upsert(buildFutureAccreditation())

      expect(
        await futureAccreditationsRepository.findByRegistrationNumbers([])
      ).toStrictEqual([])
    })

    it('should return only the accreditations of the registrations given', async ({
      futureAccreditationsRepository
    }) => {
      const wanted = buildFutureAccreditation()
      await futureAccreditationsRepository.upsert(wanted)
      await futureAccreditationsRepository.upsert(
        buildFutureAccreditation({
          registrationNumber: OTHER_REGISTRATION_NUMBER
        })
      )

      expect(
        await futureAccreditationsRepository.findByRegistrationNumbers([
          REGISTRATION_NUMBER
        ])
      ).toStrictEqual([wanted])
    })

    it('should order accreditations by registration number then year', async ({
      futureAccreditationsRepository
    }) => {
      const other2027 = buildFutureAccreditation({
        registrationNumber: OTHER_REGISTRATION_NUMBER
      })
      const own2028 = buildFutureAccreditation({ year: toYear(2028) })
      const own2027 = buildFutureAccreditation()
      await futureAccreditationsRepository.upsert(other2027)
      await futureAccreditationsRepository.upsert(own2028)
      await futureAccreditationsRepository.upsert(own2027)

      expect(
        await futureAccreditationsRepository.findByRegistrationNumbers([
          OTHER_REGISTRATION_NUMBER,
          REGISTRATION_NUMBER
        ])
      ).toStrictEqual([own2027, own2028, other2027])
    })
  })
}
