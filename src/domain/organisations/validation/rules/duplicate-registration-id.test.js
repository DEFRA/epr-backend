import { describe, it, expect } from 'vitest'
import { duplicateRegistrationIdRule } from './duplicate-registration-id.js'
import {
  SEVERITY,
  TARGET_TYPE
} from '#domain/organisations/validation/issue.js'

/** @import { Organisation } from '#domain/organisations/model.js' */

const organisation = (registrations) =>
  /** @type {Organisation} */ (
    /** @type {unknown} */ ({ id: 'org-1', registrations, accreditations: [] })
  )

describe('duplicateRegistrationIdRule', () => {
  it('is an error-severity rule', () => {
    expect(duplicateRegistrationIdRule.code).toBe('DUPLICATE_REGISTRATION_ID')
    expect(duplicateRegistrationIdRule.severity).toBe(SEVERITY.ERROR)
  })

  it('flags an id shared by more than one registration, once', () => {
    const org = organisation([{ id: 'reg-1' }, { id: 'reg-1' }])

    expect(duplicateRegistrationIdRule.evaluate(org)).toEqual([
      {
        code: 'DUPLICATE_REGISTRATION_ID',
        severity: SEVERITY.ERROR,
        target: { type: TARGET_TYPE.REGISTRATION, id: 'reg-1' },
        message: 'Registration id reg-1 is used by more than one registration'
      }
    ])
  })

  it('does not flag distinct registration ids', () => {
    const org = organisation([{ id: 'reg-1' }, { id: 'reg-2' }])

    expect(duplicateRegistrationIdRule.evaluate(org)).toEqual([])
  })
})
