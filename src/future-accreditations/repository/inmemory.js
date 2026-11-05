/** @import { FutureAccreditation, FutureAccreditationsRepositoryFactory } from './port.js' */

/**
 * @param {Pick<FutureAccreditation, 'registrationNumber' | 'year'>} accreditation
 */
const keyOf = ({ registrationNumber, year }) => `${registrationNumber}:${year}`

/**
 * @param {FutureAccreditation} a
 * @param {FutureAccreditation} b
 */
const byRegistrationThenYear = (a, b) =>
  a.registrationNumber.localeCompare(b.registrationNumber) || a.year - b.year

/** @returns {FutureAccreditationsRepositoryFactory} */
export const createInMemoryFutureAccreditationsRepository = () => {
  /** @type {Map<string, FutureAccreditation>} */
  const storage = new Map()

  return () => ({
    findByRegistrationNumbers: async (registrationNumbers) =>
      [...storage.values()]
        .filter(({ registrationNumber }) =>
          registrationNumbers.includes(registrationNumber)
        )
        .sort(byRegistrationThenYear)
        .map((accreditation) => structuredClone(accreditation)),

    upsert: async (accreditation) => {
      storage.set(keyOf(accreditation), structuredClone(accreditation))
      return structuredClone(accreditation)
    },

    remove: async (registrationNumber, year) => {
      const key = keyOf({ registrationNumber, year })
      const held = storage.get(key)
      storage.delete(key)
      return held ?? null
    }
  })
}
