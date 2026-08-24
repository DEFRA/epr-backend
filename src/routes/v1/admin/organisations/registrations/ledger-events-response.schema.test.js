import { describe, it, expect } from 'vitest'

import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { ledgerEventsResponseSchema } from './ledger-events-response.schema.js'

const buildEntry = (overrides = {}) => ({
  number: 1,
  kind: LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED,
  createdAt: new Date('2026-01-15T10:00:00.000Z'),
  createdBy: { id: 'user-1' },
  balance: {
    opening: { total: 0, available: 0 },
    closing: { total: 100, available: 100 }
  },
  summaryLog: { id: 'log-1', creditTotal: 100 },
  ...overrides
})

const validate = (entry) =>
  ledgerEventsResponseSchema.validate({
    ledger: {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    },
    events: [entry]
  })

describe('waste balance ledger response schema', () => {
  it('accepts a submission entry naming the log it credits', () => {
    expect(validate(buildEntry()).error).toBeUndefined()
  })

  it('accepts a PRN entry naming the note it concerns', () => {
    const entry = buildEntry({
      kind: LEDGER_EVENT_KIND.PRN_CREATED,
      summaryLog: undefined,
      prn: { id: 'prn-1', tonnage: 50 }
    })

    expect(validate(entry).error).toBeUndefined()
  })

  it('refuses a submission entry that names a PRN', () => {
    const entry = buildEntry({ prn: { id: 'prn-1', tonnage: 50 } })

    expect(validate(entry).error?.message).toContain('prn')
  })

  it('refuses a PRN entry that names a summary log', () => {
    const entry = buildEntry({
      kind: LEDGER_EVENT_KIND.PRN_ISSUED,
      prn: { id: 'prn-1', tonnage: 50 }
    })

    expect(validate(entry).error?.message).toContain('summaryLog')
  })

  it('refuses a PRN entry that names no note', () => {
    const entry = buildEntry({
      kind: LEDGER_EVENT_KIND.PRN_ISSUED,
      summaryLog: undefined
    })

    expect(validate(entry).error?.message).toContain('prn')
  })

  it('refuses a submission entry that names no log', () => {
    const entry = buildEntry({ summaryLog: undefined })

    expect(validate(entry).error?.message).toContain('summaryLog')
  })

  it('accepts an actor the ledger knows only the id of', () => {
    const entry = buildEntry({ createdBy: { id: 'system' } })

    expect(validate(entry).error).toBeUndefined()
  })

  it('names the registered-only ledger by a null accreditation', () => {
    const { error } = ledgerEventsResponseSchema.validate({
      ledger: {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: null
      },
      events: []
    })

    expect(error).toBeUndefined()
  })
})
