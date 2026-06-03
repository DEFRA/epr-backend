import { describe, expect, it } from 'vitest'

import { userSummarySchema } from '#reports/repository/schema.js'

import { extractChangedBy } from './shared.js'

const defraIdStandardUser = {
  id: 'contact-1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  issuer: 'defra-id',
  scope: ['standard_user'],
  currentRelationshipId: 'rel-1'
}

const entraAdminUser = {
  id: 'oid-1',
  email: 'maintainer@example.com',
  issuer: 'entra-id',
  scope: ['admin.write']
}

describe('extractChangedBy', () => {
  it('carries name and email distinctly for a Defra ID standard user', () => {
    expect(extractChangedBy(defraIdStandardUser)).toEqual({
      id: 'contact-1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      position: 'User'
    })
  })

  it('carries email and omits name for an Entra ID admin (no name claim)', () => {
    expect(extractChangedBy(entraAdminUser)).toEqual({
      id: 'oid-1',
      email: 'maintainer@example.com',
      position: 'User'
    })
  })

  it('never coerces the email into the name slot', () => {
    expect(extractChangedBy(entraAdminUser).name).toBeUndefined()
  })

  it('produces a value userSummarySchema accepts and preserves email for both providers', () => {
    const defraId = userSummarySchema.validate(
      extractChangedBy(defraIdStandardUser)
    )
    expect(defraId.error).toBeUndefined()
    expect(defraId.value.email).toBe('ada@example.com')

    const entra = userSummarySchema.validate(extractChangedBy(entraAdminUser))
    expect(entra.error).toBeUndefined()
    expect(entra.value.email).toBe('maintainer@example.com')
  })
})
