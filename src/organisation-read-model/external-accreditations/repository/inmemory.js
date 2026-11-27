import { validateExternalAccreditation } from './validation.js'

/** @import { ExternalAccreditation } from '#organisation-read-model/repository/to-read-model.js' */
/** @import { ExternalAccreditationsRepositoryFactory } from './port.js' */

/**
 * @param {ExternalAccreditation} accreditation
 * @param {ExternalAccreditation} other
 */
const isSameAccreditation = (accreditation, other) =>
  accreditation.organisationNumber === other.organisationNumber &&
  accreditation.registrationNumber === other.registrationNumber &&
  accreditation.year === other.year

/**
 * Holds external accreditations in `held`, one for each organisation,
 * registration and year, as the MongoDB adapter does. A test that passes
 * `held` reads from it what was stored.
 *
 * @param {ExternalAccreditation[]} [held]
 * @returns {ExternalAccreditationsRepositoryFactory}
 */
export const createInMemoryExternalAccreditationsRepository =
  (held = []) =>
  () => ({
    upsert: async (accreditation) => {
      const validated = validateExternalAccreditation(accreditation)
      const index = held.findIndex((candidate) =>
        isSameAccreditation(candidate, validated)
      )
      if (index === -1) {
        held.push(structuredClone(validated))
      } else {
        held[index] = structuredClone(validated)
      }
      return validated
    }
  })
