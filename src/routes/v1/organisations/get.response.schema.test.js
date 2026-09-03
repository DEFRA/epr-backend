import { describe, it, expect } from 'vitest'
import { organisationsListResponseSchema } from './get.response.schema.js'

/**
 * @returns {import('#application/organisations/organisations-list-view.js').OrganisationListItem}
 */
const listItem = () => ({
  id: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
  orgId: 500118,
  companyDetails: { name: 'Kirkby Plastics Ltd' },
  status: 'approved',
  submittedToRegulator: 'ea',
  registrations: [
    {
      registrationNumber: 'R26ER5001180041PL',
      accreditationId: '3f2504e0-4f89-11d3-9a0c-0305e82c3302'
    }
  ],
  accreditations: [
    {
      id: '3f2504e0-4f89-11d3-9a0c-0305e82c3302',
      accreditationNumber: 'A26ER5001180114PL'
    }
  ]
})

/** @param {unknown[]} items */
const page = (items) => ({
  items,
  page: 1,
  pageSize: 50,
  totalItems: 1,
  totalPages: 1
})

/** @param {unknown} value */
const errorFrom = (value) =>
  organisationsListResponseSchema.validate(value).error?.message

describe('the organisations list response schema', () => {
  it('accepts the page the search branch returns', () => {
    expect(errorFrom(page([listItem()]))).toBeUndefined()
  })

  it('accepts the bare array the no-criteria branch returns', () => {
    expect(errorFrom([listItem()])).toBeUndefined()
  })

  it('accepts an empty page', () => {
    expect(errorFrom(page([]))).toBeUndefined()
  })

  it('accepts a registration that carries no number and no accreditation', () => {
    const item = {
      ...listItem(),
      registrations: [{ registrationNumber: null }]
    }

    expect(errorFrom(page([item]))).toBeUndefined()
  })

  it('accepts an accreditation that carries no number', () => {
    const item = {
      ...listItem(),
      accreditations: [
        {
          id: '3f2504e0-4f89-11d3-9a0c-0305e82c3302',
          accreditationNumber: null
        }
      ]
    }

    expect(errorFrom(page([item]))).toBeUndefined()
  })

  it.each([
    ['users', [{ email: 'jo.sample@example.com' }]],
    ['submitterContactDetails', { email: 'jo.sample@example.com' }],
    ['formSubmission', { id: 'submission-1' }],
    ['statusHistory', [{ status: 'approved' }]],
    ['linkedDefraOrganisation', { orgName: 'Linked Ltd' }]
  ])('refuses an item carrying %s', (field, value) => {
    const item = { ...listItem(), [field]: value }

    expect(errorFrom(page([item]))).toContain(field)
  })

  it('refuses a registration line beyond the published number and its pairing', () => {
    const item = {
      ...listItem(),
      registrations: [
        { registrationNumber: 'R26ER5001180041PL', id: 'registration-1' }
      ]
    }

    expect(errorFrom(page([item]))).toContain('id')
  })

  it('refuses an accreditation line beyond the published number', () => {
    const item = {
      ...listItem(),
      accreditations: [
        {
          id: '3f2504e0-4f89-11d3-9a0c-0305e82c3302',
          accreditationNumber: 'A26ER5001180114PL',
          status: 'granted'
        }
      ]
    }

    expect(errorFrom(page([item]))).toContain('status')
  })

  it('refuses a company that carries more than its name', () => {
    const item = {
      ...listItem(),
      companyDetails: { name: 'Kirkby Plastics Ltd', companiesHouseNumber: '1' }
    }

    expect(errorFrom(page([item]))).toContain('companiesHouseNumber')
  })

  it('refuses an envelope carrying a field of its own', () => {
    expect(errorFrom({ ...page([listItem()]), cursor: 'abc' })).toContain(
      'cursor'
    )
  })

  it('refuses an item that names no organisation', () => {
    const item = { ...listItem(), companyDetails: undefined }

    expect(errorFrom(page([item]))).toContain('companyDetails')
  })
})
