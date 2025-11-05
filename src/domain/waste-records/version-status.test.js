import { describe, it, expect } from 'vitest'
import { VERSION_STATUS } from './version-status.js'

describe('VERSION_STATUS', () => {
  it('exports expected version statuses', () => {
    expect(VERSION_STATUS).toEqual({
      CREATED: 'created',
      UPDATED: 'updated',
      PENDING: 'pending'
    })
  })

  it('is frozen', () => {
    expect(Object.isFrozen(VERSION_STATUS)).toBe(true)
  })
})
