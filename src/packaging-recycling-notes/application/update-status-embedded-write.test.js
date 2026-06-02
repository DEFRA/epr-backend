import { describe, it, expect } from 'vitest'

import { EMBEDDED_BALANCE_EFFECTS } from './update-status-embedded-write.js'
import { PRN_STATUS_TRANSITIONS } from '#packaging-recycling-notes/domain/model.js'

const isPermittedTransition = (from, to) =>
  (PRN_STATUS_TRANSITIONS[from] ?? []).some((t) => t.status === to)

describe('EMBEDDED_BALANCE_EFFECTS', () => {
  it('keys only transitions the state machine permits', () => {
    const forbidden = Object.keys(EMBEDDED_BALANCE_EFFECTS).filter((key) => {
      const [from, to] = key.split('|')
      return !isPermittedTransition(from, to)
    })

    expect(forbidden).toEqual([])
  })
})
