import { describe, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { REGISTRATION_NUMBER, buildFutureAccreditation } from './test-data.js'

/** @import { FutureAccreditationsContractIt } from '../port.contract.js' */

/** @param {FutureAccreditationsContractIt} it */
export const testUpsertBehaviour = (it) => {
  describe('upsert', () => {
    it('should return the stored accreditation', async ({
      futureAccreditationsRepository
    }) => {
      const accreditation = buildFutureAccreditation()

      const stored = await futureAccreditationsRepository.upsert(accreditation)

      expect(stored).toStrictEqual(accreditation)
    })

    it('should replace the accreditation held for the same registration and year', async ({
      futureAccreditationsRepository
    }) => {
      await futureAccreditationsRepository.upsert(buildFutureAccreditation())
      const replacement = buildFutureAccreditation({
        accreditationNumber: toAccreditationNumber('A27ER5000560000XX')
      })

      await futureAccreditationsRepository.upsert(replacement)

      expect(
        await futureAccreditationsRepository.findByRegistrationNumbers([
          REGISTRATION_NUMBER
        ])
      ).toStrictEqual([replacement])
    })

    it('should keep the accreditations held for other years', async ({
      futureAccreditationsRepository
    }) => {
      const in2027 = buildFutureAccreditation()
      const in2028 = buildFutureAccreditation({ year: toYear(2028) })

      await futureAccreditationsRepository.upsert(in2027)
      await futureAccreditationsRepository.upsert(in2028)

      expect(
        await futureAccreditationsRepository.findByRegistrationNumbers([
          REGISTRATION_NUMBER
        ])
      ).toStrictEqual([in2027, in2028])
    })
  })
}
