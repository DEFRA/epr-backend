import Joi from 'joi'
import { describe, expect, it } from 'vitest'

import { formatAddress } from '#reports/domain/aggregation/helpers.js'
import { reportDataFieldsSchema } from '#reports/repository/schema.js'

import {
  canonicalise,
  diffReportedData,
  extractReportedData,
  REPORTED_DATA_FIELDS,
  reportedDataAreEquivalent
} from './reported-data-equivalence.js'

/** @param {string} path @param {string} key */
const joinPath = (path, key) => (path ? `${path}.${key}` : key)

/**
 * Walks a Joi schema description alongside a field classification, recording
 * every schema field the classification leaves undecided and every classified
 * field the schema does not have. An `excluded` entry decides its whole subtree.
 *
 * @param {*} schemaNode
 * @param {*} fieldSpec
 * @param {string} path
 * @param {{ unclassified: string[], unknown: string[] }} findings
 */
const auditClassification = (schemaNode, fieldSpec, path, findings) => {
  if (fieldSpec === undefined) {
    findings.unclassified.push(path)
    return
  }
  if (typeof fieldSpec === 'object' && 'excluded' in fieldSpec) {
    return
  }
  if (schemaNode.type === 'object') {
    const schemaKeys = Object.keys(schemaNode.keys ?? {})
    for (const key of schemaKeys) {
      auditClassification(
        schemaNode.keys[key],
        fieldSpec[key],
        joinPath(path, key),
        findings
      )
    }
    for (const key of Object.keys(fieldSpec)) {
      if (!schemaKeys.includes(key)) {
        findings.unknown.push(joinPath(path, key))
      }
    }
    return
  }
  if (schemaNode.type === 'array') {
    auditClassification(
      schemaNode.items[0],
      fieldSpec[0],
      `${path}[]`,
      findings
    )
    return
  }
  if (typeof fieldSpec !== 'string') {
    findings.unclassified.push(path)
  }
}

/** @param {Record<string, import('joi').Schema>} schemaFields */
const auditReportData = (schemaFields) => {
  const findings = { unclassified: [], unknown: [] }
  auditClassification(
    Joi.object(schemaFields).describe(),
    REPORTED_DATA_FIELDS,
    '',
    findings
  )
  return findings
}

describe('REPORTED_DATA_FIELDS — every stored report field is classified', () => {
  it('decides every field the report schema stores, and nothing it does not', () => {
    expect(auditReportData(reportDataFieldsSchema)).toEqual({
      unclassified: [],
      unknown: []
    })
  })

  it('reports a newly added report field as unclassified until it is decided', () => {
    const findings = auditReportData({
      ...reportDataFieldsSchema,
      newReportedFigure: Joi.number()
    })

    expect(findings.unclassified).toEqual(['newReportedFigure'])
  })
})

describe('canonicalise — reported data must be plain JSON', () => {
  it('serialises plain objects, arrays, strings, finite numbers, booleans and null', () => {
    expect(canonicalise({ b: [2, 1], a: null, c: true, d: 'x', e: 1.5 })).toBe(
      '{"a":null,"b":[1,2],"c":true,"d":"x","e":1.5}'
    )
  })

  it('serialises strings verbatim: normalisation belongs to the field, not the serialiser', () => {
    expect(canonicalise({ d: 'X  Y' })).toBe('{"d":"X  Y"}')
  })

  it('accepts an object with no prototype', () => {
    expect(canonicalise(Object.assign(Object.create(null), { a: 1 }))).toBe(
      '{"a":1}'
    )
  })

  it('rejects a Date rather than collapsing every date to the same value', () => {
    expect(() => canonicalise({ at: new Date('2025-01-01') })).toThrow(
      TypeError
    )
  })

  it('rejects a non-finite number rather than serialising it as null', () => {
    expect(() => canonicalise(Number.NaN)).toThrow(TypeError)
  })

  it('rejects undefined', () => {
    expect(() => canonicalise(undefined)).toThrow(TypeError)
  })
})

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

/** @param {*} a @param {*} b */
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

/**
 * A report carrying one final destination, so a test can vary a single field.
 */
const reportWithFinalDestination = (destinationOverrides = {}) => ({
  wasteSent: {
    tonnageSentToReprocessor: 7,
    tonnageSentToExporter: 0,
    tonnageSentToAnotherSite: 0,
    finalDestinations: [
      {
        recipientName: 'Dest A',
        facilityType: 'Reprocessor',
        address: '456 Road, XY9 8ZW',
        tonnageSentOn: 7,
        ...destinationOverrides
      }
    ]
  }
})

describe('extractReportedData — free-text fields are normalised, exact fields are not', () => {
  it('treats a blank free-text field as equivalent to a null one', () => {
    const before = reportWithSupplier({ supplierAddress: null })
    const after = reportWithSupplier({ supplierAddress: '' })

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a whitespace-only free-text field as equivalent to a null one', () => {
    const before = reportWithSupplier({ supplierName: null })
    const after = reportWithSupplier({ supplierName: '   ' })

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a final destination name casing-only change as no reported-data change', () => {
    const before = reportWithFinalDestination()
    const after = reportWithFinalDestination({ recipientName: 'DEST  a' })

    expect(equivalent(before, after)).toBe(true)
  })

  it('compares a non-string free-text value (a numeric cell) as-is', () => {
    const before = reportWithSupplier({ supplierName: 123 })

    expect(equivalent(before, reportWithSupplier({ supplierName: 123 }))).toBe(
      true
    )
    expect(equivalent(before, reportWithSupplier({ supplierName: 124 }))).toBe(
      false
    )
  })

  // Addresses are stored as `formatAddress(address, postcode)` over the raw,
  // untrimmed cells, so stray whitespace lands next to the joining comma.
  it('treats a trailing space on a supplier address cell as no reported-data change', () => {
    const before = reportWithSupplier({
      supplierAddress: formatAddress('1 Mill Lane', 'LS1 1AA')
    })
    const after = reportWithSupplier({
      supplierAddress: formatAddress('1 Mill Lane ', 'LS1 1AA')
    })

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a whitespace-only address cell as equivalent to an empty one', () => {
    const before = reportWithSupplier({
      supplierAddress: formatAddress(null, 'LS1 1AA')
    })
    const after = reportWithSupplier({
      supplierAddress: formatAddress('   ', 'LS1 1AA')
    })

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a whitespace-only postcode cell as equivalent to an empty one', () => {
    const before = reportWithFinalDestination({
      address: formatAddress('456 Road', null)
    })
    const after = reportWithFinalDestination({
      address: formatAddress('456 Road', '  ')
    })

    expect(equivalent(before, after)).toBe(true)
  })

  it('still treats a changed postcode as a reported-data change', () => {
    const before = reportWithSupplier({
      supplierAddress: formatAddress('1 Mill Lane', 'LS1 1AA')
    })
    const after = reportWithSupplier({
      supplierAddress: formatAddress('1 Mill Lane', 'LS1 1AB')
    })

    expect(equivalent(before, after)).toBe(false)
  })

  it('compares a dropdown value exactly: a final destination facility type casing change is a change', () => {
    const before = reportWithFinalDestination()
    const after = reportWithFinalDestination({ facilityType: 'REPROCESSOR' })

    expect(equivalent(before, after)).toBe(false)
  })
})

/**
 * A report carrying the given suppliers, totalled, so a test can split one
 * supplier's tonnage across several list entries.
 *
 * @param {Array<Record<string, *>>} suppliers
 * @returns {*}
 */
const reportWithSuppliers = (suppliers) => ({
  recyclingActivity: {
    suppliers,
    totalTonnageReceived: suppliers.reduce(
      (total, { tonnageReceived }) => total + tonnageReceived,
      0
    )
  }
})

describe('extractReportedData — list entries that compare equal are merged', () => {
  // The aggregation groups rows on raw values, including ones the comparison
  // ignores, so editing one of several rows for the same supplier splits its
  // single entry in two. Merged again, the report presents the same data.
  const acme = { supplierName: 'Acme', supplierPhone: '0111' }

  it('treats a supplier split only by a contact detail as no reported-data change', () => {
    const before = reportWithSuppliers([{ ...acme, tonnageReceived: 300 }])
    const after = reportWithSuppliers([
      { ...acme, tonnageReceived: 100 },
      { ...acme, supplierPhone: '0222', tonnageReceived: 200 }
    ])

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a supplier split only by name casing as no reported-data change', () => {
    const before = reportWithSuppliers([{ ...acme, tonnageReceived: 300 }])
    const after = reportWithSuppliers([
      { ...acme, tonnageReceived: 100 },
      { ...acme, supplierName: 'ACME', tonnageReceived: 200 }
    ])

    expect(equivalent(before, after)).toBe(true)
  })

  it('sums merged tonnage exactly, without floating-point drift', () => {
    const before = reportWithSuppliers([{ ...acme, tonnageReceived: 0.3 }])
    const after = reportWithSuppliers([
      { ...acme, tonnageReceived: 0.1 },
      { ...acme, supplierPhone: '0222', tonnageReceived: 0.2 }
    ])
    // The real total is summed as a decimal; only the list merge is under test.
    after.recyclingActivity.totalTonnageReceived = 0.3

    expect(
      diffReportedData(extractReportedData(before), extractReportedData(after))
    ).toEqual([])
  })

  it('still treats a changed tonnage across the merged entries as a change', () => {
    const before = reportWithSuppliers([{ ...acme, tonnageReceived: 300 }])
    const after = reportWithSuppliers([
      { ...acme, tonnageReceived: 100 },
      { ...acme, supplierPhone: '0222', tonnageReceived: 150 }
    ])

    expect(equivalent(before, after)).toBe(false)
  })

  it('does not merge suppliers that differ in a compared field', () => {
    const before = reportWithSuppliers([{ ...acme, tonnageReceived: 300 }])
    const after = reportWithSuppliers([
      { ...acme, tonnageReceived: 100 },
      { ...acme, supplierAddress: '2 Mill Lane', tonnageReceived: 200 }
    ])

    expect(equivalent(before, after)).toBe(false)
  })

  it('merges final destinations the same way', () => {
    const before = reportWithFinalDestination({ tonnageSentOn: 7 })
    const after = reportWithFinalDestination({ tonnageSentOn: 3 })
    after.wasteSent.finalDestinations.push({
      recipientName: 'DEST A',
      facilityType: 'Reprocessor',
      address: '456 Road, XY9 8ZW',
      tonnageSentOn: 4
    })

    expect(equivalent(before, after)).toBe(true)
  })
})

describe('diffReportedData — which reported fields changed', () => {
  /** @param {*} a @param {*} b */
  const diff = (a, b) =>
    diffReportedData(extractReportedData(a), extractReportedData(b))

  it('reports no fields for reports whose reported data is equivalent', () => {
    const before = reportWithSupplier()
    const after = reportWithSupplier({ supplierPhone: '09876 543210' })

    expect(diff(before, after)).toEqual([])
  })

  it('reports a changed list at the list level, since its items have no stable identity', () => {
    const before = reportWithSupplier()
    const after = reportWithSupplier({ tonnageReceived: 14 })

    expect(diff(before, after)).toEqual(['recyclingActivity.suppliers'])
  })

  it('reports each changed field by path, sorted', () => {
    const before = reportWithFinalDestination()
    const after = reportWithFinalDestination({ recipientName: 'Dest B' })
    after.wasteSent.tonnageSentToReprocessor = 8

    expect(diff(before, after)).toEqual([
      'wasteSent.finalDestinations',
      'wasteSent.tonnageSentToReprocessor'
    ])
  })

  it('reports an activity block present on only one side at the block level', () => {
    expect(diff(reportWithSupplier(), {})).toEqual(['recyclingActivity'])
    expect(diff({}, reportWithSupplier())).toEqual(['recyclingActivity'])
  })
})

describe('extractReportedData — absent and null fields', () => {
  it('treats an absent optional field as equivalent to null', () => {
    const before = reportWithSupplier({ supplierAddress: null })
    const after = reportWithSupplier({ supplierAddress: undefined })

    expect(equivalent(before, after)).toBe(true)
  })

  it('treats a missing activity block as different from a present one', () => {
    const before = reportWithSupplier()
    const after = { recyclingActivity: undefined }

    expect(equivalent(before, after)).toBe(false)
  })
})
