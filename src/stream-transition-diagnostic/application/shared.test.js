import { describe, it, expect } from 'vitest'

import { formatStatusHistory } from './shared.js'

describe('formatStatusHistory', () => {
  it('renders "none" for an empty or missing history', () => {
    expect(formatStatusHistory(undefined)).toBe('none')
    expect(formatStatusHistory([])).toBe('none')
  })

  it('renders a single entry as status@date', () => {
    expect(
      formatStatusHistory([{ status: 'created', updatedAt: '2026-01-12' }])
    ).toBe('created@2026-01-12')
  })

  it('renders multiple entries ascending, joined by " -> "', () => {
    const trail = formatStatusHistory([
      { status: 'approved', updatedAt: '2026-04-01' },
      { status: 'created', updatedAt: '2026-01-12' }
    ])
    expect(trail).toBe('created@2026-01-12 -> approved@2026-04-01')
  })

  it('renders an approve -> cancel -> reapprove cycle as a full trail', () => {
    const trail = formatStatusHistory([
      { status: 'created', updatedAt: '2026-01-01' },
      { status: 'approved', updatedAt: '2026-02-01' },
      { status: 'suspended', updatedAt: '2026-05-01' },
      { status: 'approved', updatedAt: '2026-06-01' },
      { status: 'cancelled', updatedAt: '2026-08-01' }
    ])
    expect(trail).toBe(
      'created@2026-01-01 -> approved@2026-02-01 -> suspended@2026-05-01 -> approved@2026-06-01 -> cancelled@2026-08-01'
    )
  })

  it('renders an entry with no resolvable date as status@unknown', () => {
    const trail = formatStatusHistory([
      { status: 'created', updatedAt: 'not-a-date' }
    ])
    expect(trail).toBe('created@unknown')
  })
})
