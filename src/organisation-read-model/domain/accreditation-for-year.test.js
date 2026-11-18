import { toYear } from '#common/helpers/dates/year.js'
import {
  accreditationsByYear,
  buildReadAccreditation,
  buildReadReprocessorRegistration
} from '#organisation-read-model/repository/read-model-test-data.js'
import { accreditationForYear } from './accreditation-for-year.js'

describe('accreditationForYear', () => {
  const accreditation2026 = buildReadAccreditation()
  const registration = buildReadReprocessorRegistration({
    accreditations: accreditationsByYear(accreditation2026)
  })

  it('finds the accreditation for the year', () => {
    expect(accreditationForYear(registration, toYear(2026))).toBe(
      accreditation2026
    )
  })

  it('finds none for a year the registration is not accredited in', () => {
    expect(accreditationForYear(registration, toYear(2027))).toBeUndefined()
  })

  it.each(['constructor', '__proto__', 'toString'])(
    'finds none for the inherited name %s',
    (name) => {
      expect(
        accreditationForYear(registration, /** @type {never} */ (name))
      ).toBeUndefined()
    }
  )
})
