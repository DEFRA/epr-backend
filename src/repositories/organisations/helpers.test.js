import { describe, expect, it } from 'vitest'
import {
  organisationNumberOfStored,
  statusHistoryWithChanges
} from './helpers.js'

describe('organisationNumberOfStored', () => {
  it('reads a stored orgId as its organisation number', () => {
    expect(organisationNumberOfStored(500123)).toBe('500123')
  })

  it('refuses a stored orgId that is not an organisation number', () => {
    expect(() => organisationNumberOfStored(0)).toThrow(
      "'0' is not an organisation number"
    )
  })
})

describe('statusHistoryWithChanges', () => {
  it('returns initial status history when existingItem is null', () => {
    const updatedItem = { status: 'approved' }
    const result = statusHistoryWithChanges(updatedItem, null)

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('created')
    expect(result[0].updatedAt).toBeInstanceOf(Date)
  })

  it('returns initial status history when existingItem is undefined', () => {
    const updatedItem = { status: 'approved' }
    const result = statusHistoryWithChanges(updatedItem, undefined)

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('created')
    expect(result[0].updatedAt).toBeInstanceOf(Date)
  })

  it('returns initial status history when existingItem is falsy', () => {
    const updatedItem = {}
    const result = statusHistoryWithChanges(updatedItem, null)

    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('created')
    expect(result[0].updatedAt).toBeInstanceOf(Date)
  })
})
