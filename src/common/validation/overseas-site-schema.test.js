import { describe, expect, it } from 'vitest'
import { accreditedOverseasSitesSchema } from './overseas-site-schema.js'

describe('#accreditedOverseasSitesSchema', () => {
  it('accepts an approval dated by a calendar date', () => {
    const { error } = accreditedOverseasSitesSchema.validate({
      '001': { status: 'approved', approvedOn: '2027-01-01' }
    })

    expect(error).toBeUndefined()
  })

  it('refuses an approval dated by a timestamp', () => {
    const { error } = accreditedOverseasSitesSchema.validate({
      '001': { status: 'approved', approvedOn: '2027-01-01T00:00:00.000Z' }
    })

    expect(error).toBeDefined()
  })
})
