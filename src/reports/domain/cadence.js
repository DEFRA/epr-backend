/** @import { AccreditationNumber } from '#domain/organisations/numbers.js' */

export const CADENCE = Object.freeze({
  monthly: 'monthly',
  quarterly: 'quarterly'
})

/**
 * @typedef {keyof typeof CADENCE} Cadence
 */

export const MONTHS_PER_PERIOD = Object.freeze({
  [CADENCE.monthly]: 1,
  [CADENCE.quarterly]: 3
})

/**
 * @typedef {{ cadence: typeof CADENCE.monthly, accreditationNumber: AccreditationNumber }
 *   | { cadence: typeof CADENCE.quarterly, accreditationNumber: null }} CadenceAccreditation
 */

/**
 * @type {{ [C in Cadence]: (accreditationNumber: AccreditationNumber | null | undefined) => CadenceAccreditation }}
 */
const CADENCE_ACCREDITATION = {
  [CADENCE.monthly]: (accreditationNumber) => {
    if (!accreditationNumber) {
      throw new Error('A monthly report needs an accreditation number')
    }
    return { cadence: CADENCE.monthly, accreditationNumber }
  },
  [CADENCE.quarterly]: () => ({
    cadence: CADENCE.quarterly,
    accreditationNumber: null
  })
}

/**
 * @param {Cadence} cadence
 * @param {AccreditationNumber | null | undefined} accreditationNumber
 * @returns {CadenceAccreditation}
 */
export const cadenceAccreditationFor = (cadence, accreditationNumber) =>
  CADENCE_ACCREDITATION[cadence](accreditationNumber)
