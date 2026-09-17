import { describe, it, expect } from 'vitest'
import { ObjectId } from 'mongodb'

import { partialMock } from '#test/type-helpers.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'
import { buildSummaryLogRowStateEntry } from '#waste-records/repository/test-data.js'
import {
  buildRegistration,
  buildOrganisation,
  buildOrganisationWithRegistration
} from '#repositories/organisations/contract/test-data.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'

import {
  findReportDataCompletenessFindings,
  formatFinding,
  summariseByTemplate,
  formatTemplateBreakdown,
  summariseByMaterial,
  formatMaterialBreakdown,
  formatFieldBreakdown,
  formatTotals,
  formatUnresolved
} from './report-data-completeness-diagnostic.js'

// All five templates now carry a report-mandatory policy (exporter PAE-1420,
// reprocessor PAE-1280), so the breakdown lines list them all in
// PROCESSING_TYPES order. The "scanned but not flagged" control is therefore a
// COMPLETE exporter summary log, not a template that happens to lack a policy.
const ALL_TEMPLATES_ZERO =
  'REPROCESSOR_INPUT:0, REPROCESSOR_OUTPUT:0, EXPORTER:0, REPROCESSOR_REGISTERED_ONLY:0, EXPORTER_REGISTERED_ONLY:0'
const ALL_MATERIALS_ZERO =
  'aluminium:0, fibre:0, glass:0, paper:0, plastic:0, steel:0, wood:0'

/**
 * Builds one ledger's worth of estate fixture: an organisation carrying a single
 * registration (with a chosen material and template) plus the ledger id and the
 * summary-log id the diagnostic will scan.
 *
 * @param {{ material: string, processingType: string, summaryLogId: string, accredited: boolean, registrationNumber?: string }} spec
 */
const buildLedgerFixture = ({
  material,
  processingType,
  summaryLogId,
  accredited,
  registrationNumber = 'REG-000'
}) => {
  const wasteProcessingType =
    processingType === PROCESSING_TYPES.REPROCESSOR_INPUT
      ? 'reprocessor'
      : 'exporter'
  const accreditationId = accredited ? new ObjectId().toString() : undefined
  const registration = buildRegistration({
    wasteProcessingType,
    material,
    registrationNumber,
    ...(accredited ? { accreditationId } : {})
  })
  const org = accredited
    ? buildOrganisationWithRegistration(partialMock(registration), 'approved')
    : buildOrganisation({ registrations: [registration] })

  return {
    org,
    ledgerId: {
      organisationId: org.id,
      registrationId: registration.id,
      accreditationId: registration.accreditationId ?? null
    },
    summaryLogId,
    processingType
  }
}

/** A fully complete Exported row: present, so it is scanned but never flagged. */
const completeExportedRow = (rowId) =>
  buildSummaryLogRowStateEntry({
    rowId,
    wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
    processingType: PROCESSING_TYPES.EXPORTER,
    data: {
      DATE_OF_EXPORT: '2025-06-15',
      TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3,
      OSR_ID: 'ORS-0001'
    }
  })

/**
 * Seeds the three in-memory repositories from a list of {fixture, rows} pairs
 * and returns them ready to pass to findReportDataCompletenessFindings.
 *
 * @param {{ fixture: ReturnType<typeof buildLedgerFixture>, rows: any[] }[]} entries
 */
const seedRepositories = async (entries) => {
  const summaryLogRowStatesRepository =
    createInMemorySummaryLogRowStatesRepository()()
  for (const { fixture, rows } of entries) {
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      fixture.ledgerId,
      rows,
      fixture.summaryLogId
    )
  }

  const ledgerRepository = createInMemoryLedgerRepository(
    entries.map(({ fixture }) =>
      partialMock(
        buildLedgerEvent({
          organisationId: fixture.ledgerId.organisationId,
          registrationId: fixture.ledgerId.registrationId,
          accreditationId: fixture.ledgerId.accreditationId,
          payload: { summaryLogId: fixture.summaryLogId, creditTotal: 100 }
        })
      )
    )
  )()

  const organisationsRepository = createInMemoryOrganisationsRepository(
    entries.map(({ fixture }) => partialMock(fixture.org))
  )()

  return {
    ledgerRepository,
    summaryLogRowStatesRepository,
    organisationsRepository
  }
}

describe('findReportDataCompletenessFindings', () => {
  it('surfaces the estate-wide report-data completeness blast radius', async () => {
    // Ledger A: accredited exporter, plastic. Two Exported rows with export
    // tonnage but a blank OSR_ID (violating) alongside one fully complete
    // Exported row, so two of the three rows are counted and OSR_ID is missing
    // twice.
    const ledgerA = buildLedgerFixture({
      material: 'plastic',
      processingType: PROCESSING_TYPES.EXPORTER,
      summaryLogId: 'sl-a',
      accredited: true,
      registrationNumber: 'REG-A-001'
    })
    const incompleteExportedRow = (rowId) =>
      buildSummaryLogRowStateEntry({
        rowId,
        wasteRecordType: WASTE_RECORD_TYPE.EXPORTED,
        processingType: PROCESSING_TYPES.EXPORTER,
        data: {
          DATE_OF_EXPORT: '2025-06-15',
          TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: 3
        }
      })
    const rowsA = [
      incompleteExportedRow('row-a-incomplete-1'),
      incompleteExportedRow('row-a-incomplete-2'),
      completeExportedRow('row-a-complete')
    ]

    // Ledger B: registered-only exporter, glass. One Received row with received
    // tonnage and no supplier details: several missing fields on a single row.
    const ledgerB = buildLedgerFixture({
      material: 'glass',
      processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
      summaryLogId: 'sl-b',
      accredited: false,
      registrationNumber: 'REG-B-002'
    })
    const rowsB = [
      buildSummaryLogRowStateEntry({
        rowId: 'row-b',
        wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
        processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
        data: { TONNAGE_RECEIVED_FOR_EXPORT: 5 }
      })
    ]

    // Ledger C: accredited exporter, steel, a single fully complete row -> it is
    // scanned but never flagged, so the diagnostic must count it in `scanned`
    // yet leave it out of every rollup.
    const ledgerC = buildLedgerFixture({
      material: 'steel',
      processingType: PROCESSING_TYPES.EXPORTER,
      summaryLogId: 'sl-c',
      accredited: true
    })
    const rowsC = [completeExportedRow('row-c-complete')]

    const repositories = await seedRepositories([
      { fixture: ledgerA, rows: rowsA },
      { fixture: ledgerB, rows: rowsB },
      { fixture: ledgerC, rows: rowsC }
    ])

    const { scanned, findings, unresolved, missingFieldCounts } =
      await findReportDataCompletenessFindings(repositories)

    expect(scanned).toBe(3)
    expect(unresolved).toEqual([])

    // (1) one line per violating summary log, with its counts and ids.
    const findingA = findings.find((f) => f.summaryLogId === 'sl-a')
    const lineA = formatFinding(partialMock({ ...findingA }))
    expect(lineA).toContain('template EXPORTER,')
    expect(lineA).toContain('material plastic')
    expect(lineA).toContain(ledgerA.ledgerId.organisationId)
    expect(lineA).toContain(
      `registration ${ledgerA.ledgerId.registrationId} (no. REG-A-001)`
    )
    expect(lineA).toContain(
      `accreditation ${ledgerA.ledgerId.accreditationId} (no. `
    )
    expect(lineA).toContain('2 incomplete row(s), 2 missing field(s)')

    const findingB = findings.find((f) => f.summaryLogId === 'sl-b')
    const lineB = formatFinding(partialMock({ ...findingB }))
    expect(lineB).toContain('template EXPORTER_REGISTERED_ONLY,')
    expect(lineB).toContain('material glass')
    expect(lineB).toContain(
      `registration ${ledgerB.ledgerId.registrationId} (no. REG-B-002)`
    )
    // Registered-only ledgers have no accreditation number.
    expect(lineB).toContain('accreditation registered-only')
    expect(lineB).toContain('1 incomplete row(s),')

    // The fully complete summary log is scanned but not flagged.
    expect(findings.find((f) => f.summaryLogId === 'sl-c')).toBeUndefined()

    // (2) one line covering every evaluated template, so absence of signal is
    // explicit. Only the two exporter templates carry a violation here.
    expect(formatTemplateBreakdown(summariseByTemplate(findings))).toBe(
      'Report-data diagnostic missing data by template: REPROCESSOR_INPUT:0, REPROCESSOR_OUTPUT:0, EXPORTER:1, REPROCESSOR_REGISTERED_ONLY:0, EXPORTER_REGISTERED_ONLY:1'
    )

    // (3) one line covering every material, including those with no violations.
    expect(formatMaterialBreakdown(summariseByMaterial(findings))).toBe(
      'Report-data diagnostic missing data by material: aluminium:0, fibre:0, glass:1, paper:0, plastic:1, steel:0, wood:0'
    )

    // (4) one line covering every missing field, most-missing first. OSR_ID is
    // missing on both of ledger A's violating rows, so it leads.
    expect(formatFieldBreakdown(missingFieldCounts)).toMatch(
      /^Report-data diagnostic missing data by field: OSR_ID:2, /
    )

    // (5) the estate-wide totals.
    const summary = formatTotals({ scanned, findings })
    expect(summary).toContain('scanned 3 summary log(s)')
    expect(summary).toContain('2 with incomplete data')
    expect(summary).toContain('2 organisation(s)')
    expect(summary).toContain('2 registration(s)')
    expect(summary).toContain('1 accreditation(s)')
    expect(summary).toContain(
      'Evaluated templates: REPROCESSOR_INPUT, REPROCESSOR_OUTPUT, EXPORTER, REPROCESSOR_REGISTERED_ONLY, EXPORTER_REGISTERED_ONLY'
    )
  })

  it('keeps scanning and reports unknown material when a registration cannot be resolved', async () => {
    // A violating summary log whose registration is absent from the org repo
    // (deleted or re-versioned away). The scan must degrade this one line, not
    // abort: the finding is still counted, its material reported as unknown.
    const ledgerId = {
      organisationId: new ObjectId().toString(),
      registrationId: new ObjectId().toString(),
      accreditationId: null
    }
    const summaryLogRowStatesRepository =
      createInMemorySummaryLogRowStatesRepository()()
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerId,
      [
        buildSummaryLogRowStateEntry({
          rowId: 'row-d',
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
          data: { TONNAGE_RECEIVED_FOR_EXPORT: 5 }
        })
      ],
      'sl-d'
    )
    const ledgerRepository = createInMemoryLedgerRepository([
      partialMock(
        buildLedgerEvent({
          organisationId: ledgerId.organisationId,
          registrationId: ledgerId.registrationId,
          accreditationId: null,
          payload: { summaryLogId: 'sl-d', creditTotal: 100 }
        })
      )
    ])()

    const { findings, unresolved, missingFieldCounts } =
      await findReportDataCompletenessFindings({
        ledgerRepository,
        summaryLogRowStatesRepository,
        organisationsRepository: createInMemoryOrganisationsRepository([])()
      })

    const findingD = findings.find((f) => f.summaryLogId === 'sl-d')
    const lineD = formatFinding(partialMock({ ...findingD }))
    expect(lineD).toContain('material unknown')
    // With no registration to read, the registration number is unknown too.
    expect(lineD).toContain(
      `registration ${ledgerId.registrationId} (no. unknown)`
    )
    expect(lineD).toContain('1 incomplete row(s),')

    // The finding still counts toward the totals and gets its own material
    // bucket appended after the known materials, so the rollup reconciles.
    expect(formatTotals({ scanned: 1, findings })).toContain(
      '1 with incomplete data'
    )
    expect(formatMaterialBreakdown(summariseByMaterial(findings))).toBe(
      `Report-data diagnostic missing data by material: ${ALL_MATERIALS_ZERO}, unknown:1`
    )
    // Field counts are still tallied for the unresolved finding.
    expect(missingFieldCounts.length).toBeGreaterThan(0)

    // A warning names the registration that could not be resolved.
    expect(unresolved).toHaveLength(1)
    const warning = formatUnresolved(unresolved[0])
    expect(warning).toContain(ledgerId.registrationId)
    expect(warning).toContain('material reported as unknown')
  })

  it('reports all-zero breakdowns when nothing would be blocked', async () => {
    // A single fully complete exporter summary log: scanned but never flagged.
    // The rollups still report, all zero, and the field line reads (none).
    const ledger = buildLedgerFixture({
      material: 'steel',
      processingType: PROCESSING_TYPES.EXPORTER,
      summaryLogId: 'sl-z',
      accredited: true
    })
    const repositories = await seedRepositories([
      { fixture: ledger, rows: [completeExportedRow('row-z-complete')] }
    ])

    const { scanned, findings, missingFieldCounts } =
      await findReportDataCompletenessFindings(repositories)

    expect(findings).toEqual([])
    expect(formatTemplateBreakdown(summariseByTemplate(findings))).toBe(
      `Report-data diagnostic missing data by template: ${ALL_TEMPLATES_ZERO}`
    )
    expect(formatMaterialBreakdown(summariseByMaterial(findings))).toBe(
      `Report-data diagnostic missing data by material: ${ALL_MATERIALS_ZERO}`
    )
    expect(formatFieldBreakdown(missingFieldCounts)).toBe(
      'Report-data diagnostic missing data by field: (none)'
    )
    expect(formatTotals({ scanned, findings })).toContain(
      'scanned 1 summary log(s), 0 with incomplete data (0 missing field(s))'
    )
  })

  it('reports the registration number as unknown when the registration carries none', async () => {
    // A summary log submitted against a registration that no longer carries a
    // registration number (a cancelled or rejected registration). The material
    // still resolves; only the number is unknown.
    const registration = buildRegistration({
      wasteProcessingType: 'exporter',
      material: 'plastic',
      registrationNumber: undefined
    })
    const org = buildOrganisation({ registrations: [registration] })
    const ledgerId = {
      organisationId: org.id,
      registrationId: registration.id,
      accreditationId: null
    }
    const summaryLogRowStatesRepository =
      createInMemorySummaryLogRowStatesRepository()()
    await summaryLogRowStatesRepository.upsertSummaryLogRowStates(
      ledgerId,
      [
        buildSummaryLogRowStateEntry({
          rowId: 'row-n',
          wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
          processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
          data: { TONNAGE_RECEIVED_FOR_EXPORT: 5 }
        })
      ],
      'sl-n'
    )
    const ledgerRepository = createInMemoryLedgerRepository([
      partialMock(
        buildLedgerEvent({
          organisationId: ledgerId.organisationId,
          registrationId: ledgerId.registrationId,
          accreditationId: null,
          payload: { summaryLogId: 'sl-n', creditTotal: 100 }
        })
      )
    ])()

    const { findings } = await findReportDataCompletenessFindings({
      ledgerRepository,
      summaryLogRowStatesRepository,
      organisationsRepository: createInMemoryOrganisationsRepository([
        partialMock(org)
      ])()
    })

    const lineN = formatFinding(
      partialMock({ ...findings.find((f) => f.summaryLogId === 'sl-n') })
    )
    expect(lineN).toContain(
      `registration ${ledgerId.registrationId} (no. unknown)`
    )
    expect(lineN).toContain('material plastic')
  })
})
