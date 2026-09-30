import { describe, expect, it } from 'vitest'

import {
  extractReportedData,
  reportedDataAreEquivalent
} from './reported-data-equivalence.js'

/**
 * A report carrying one supplier with every field the stored report holds, so
 * a test can vary a single field and assert whether it counts as reported data.
 */
const reportWithSupplier = (supplierOverrides = {}) => ({
  recyclingActivity: {
    suppliers: [
      {
        supplierName: 'Acme Plastics Ltd',
        supplierAddress: '1 Mill Lane, Leeds',
        supplierPhone: '01234 567890',
        supplierEmail: 'ops@acme.example',
        tonnageReceived: 12,
        ...supplierOverrides
      }
    ],
    totalTonnageReceived: 12
  }
})

const equivalent = (a, b) =>
  reportedDataAreEquivalent(extractReportedData(a), extractReportedData(b))

describe('reportedDataAreEquivalent — supplier contact exception', () => {
  it('treats a supplier telephone-only change as no reported-data change', () => {
    const before = reportWithSupplier()
    const after = reportWithSupplier({ supplierPhone: '09876 543210' })

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a supplier email-only change as no reported-data change', () => {
    const before = reportWithSupplier()
    const after = reportWithSupplier({ supplierEmail: 'new@acme.example' })

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a supplier name change as a reported-data change', () => {
    const before = reportWithSupplier()
    const after = reportWithSupplier({ supplierName: 'Acme Recycling Ltd' })

    expect(equivalent(before, after)).toBe(false)
  })

  it('treats a supplier address change as a reported-data change', () => {
    const before = reportWithSupplier()
    const after = reportWithSupplier({ supplierAddress: '2 Mill Lane, Leeds' })

    expect(equivalent(before, after)).toBe(false)
  })

  it('treats a supplier tonnage change as a reported-data change', () => {
    const before = reportWithSupplier()
    const after = reportWithSupplier({ tonnageReceived: 14 })

    expect(equivalent(before, after)).toBe(false)
  })
})

describe('reportedDataAreEquivalent — contact exception must not mask a real change', () => {
  it('treats a phone change alongside a tonnage change as a reported-data change', () => {
    const before = reportWithSupplier()
    const after = reportWithSupplier({
      supplierPhone: '09876 543210',
      tonnageReceived: 14
    })

    expect(equivalent(before, after)).toBe(false)
  })

  it('treats an email change alongside a name change as a reported-data change', () => {
    const before = reportWithSupplier()
    const after = reportWithSupplier({
      supplierEmail: 'new@acme.example',
      supplierName: 'Acme Recycling Ltd'
    })

    expect(equivalent(before, after)).toBe(false)
  })
})

describe('reportedDataAreEquivalent — casing/whitespace normalisation', () => {
  it('treats a supplier name casing-only change as no reported-data change', () => {
    const before = reportWithSupplier({ supplierName: 'Acme Plastics Ltd' })
    const after = reportWithSupplier({ supplierName: 'ACME PLASTICS LTD' })

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a supplier name internal-whitespace change as no reported-data change', () => {
    const before = reportWithSupplier({ supplierName: 'Acme Plastics Ltd' })
    const after = reportWithSupplier({ supplierName: 'Acme  Plastics   Ltd' })

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a supplier name leading/trailing whitespace change as no reported-data change', () => {
    const before = reportWithSupplier({ supplierName: 'Acme Plastics Ltd' })
    const after = reportWithSupplier({ supplierName: '  Acme Plastics Ltd  ' })

    expect(equivalent(before, after)).toBe(true)
  })

  it('still treats a genuine supplier name change as a reported-data change', () => {
    const before = reportWithSupplier({ supplierName: 'Acme Plastics Ltd' })
    const after = reportWithSupplier({ supplierName: 'Beta Plastics Ltd' })

    expect(equivalent(before, after)).toBe(false)
  })
})
