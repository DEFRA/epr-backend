import { describe, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { REGISTRATION_NUMBER, buildFutureAccreditation } from './test-data.js'

/** @import { FutureAccreditationsContractIt } from '../port.contract.js' */

/** @param {FutureAccreditationsContractIt} it */
export const testRemoveBehaviour = (it) => {
  describe('remove', () => {
    it('should return the removed accreditation', async ({
      futureAccreditationsRepository
    }) => {
      const accreditation = buildFutureAccreditation()
      await futureAccreditationsRepository.upsert(accreditation)

      const removed = await futureAccreditationsRepository.remove(
        REGISTRATION_NUMBER,
        toYear(2027)
      )

      expect(removed).toStrictEqual(accreditation)
    })

    it('should leave the accreditations held for other years', async ({
      futureAccreditationsRepository
    }) => {
      const in2028 = buildFutureAccreditation({ year: toYear(2028) })
      await futureAccreditationsRepository.upsert(buildFutureAccreditation())
      await futureAccreditationsRepository.upsert(in2028)

      await futureAccreditationsRepository.remove(
        REGISTRATION_NUMBER,
        toYear(2027)
      )

      expect(
        await futureAccreditationsRepository.findByRegistrationNumbers([
          REGISTRATION_NUMBER
        ])
      ).toStrictEqual([in2028])
    })

    it('should return null when no accreditation is held for the year', async ({
      futureAccreditationsRepository
    }) => {
      expect(
        await futureAccreditationsRepository.remove(
          REGISTRATION_NUMBER,
          toYear(2027)
        )
      ).toBeNull()
    })
  })
}
