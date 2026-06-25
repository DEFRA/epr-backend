import { describe, expect, it } from 'vitest'
import {
  createStatusHistoryEntry,
  statusHistoryWithChanges
} from './helpers.js'

describe('createStatusHistoryEntry', () => {
  it('sets status and updatedAt and omits updatedBy when no user given', () => {
    const entry = createStatusHistoryEntry('approved')
    expect(entry.status).toBe('approved')
    expect(entry.updatedAt).toBeInstanceOf(Date)
    expect('updatedBy' in entry).toBe(false)
  })

  it('includes updatedBy when a user id is given', () => {
    const entry = createStatusHistoryEntry('approved', 'user-123')
    expect(entry).toEqual({
      status: 'approved',
      updatedAt: expect.any(Date),
      updatedBy: 'user-123'
    })
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
