import { describe, it, expect, beforeEach, vi } from 'vitest'
import { syncFromSummaryLog } from './sync-from-summary-log.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { getTargetAmount } from '#waste-balances/application/target-amount.js'
import { LEDGER_EVENT_KIND } from '#waste-balances/repository/ledger-schema.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { CLASSIFICATION_REASON } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'

const TEST_DATE_2025_01_15 = '2025-01-15'
const FIELD_GROSS_WEIGHT = 'GROSS_WEIGHT'
const TEST_WEIGHT_100_5 = 100.5
const TEST_WEIGHT_200_75 = 200.75
const TEST_WEIGHT_250_5 = 250.5

const RECEIVED_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_REPROCESSING',
  FIELD_GROSS_WEIGHT
]

const TEST_USER = {
  id: 'test-user',
  email: 'test@example.com',
  scope: ['some-scope']
}

const LEDGER_ID = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: null
}

const summaryLogFor = (fileId, accreditationId) => ({
  file: { id: fileId, uri: `s3://test-bucket/${fileId}` },
  organisationId: 'org-1',
  registrationId: 'reg-1',
  ...(accreditationId && { accreditationId })
})

const reprocessorInput = (rows) =>
  /** @type {any} */ ({
    meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' } },
    data: {
      RECEIVED_LOADS_FOR_REPROCESSING: {
        location: { sheet: 'Sheet1', row: 1, column: 'A' },
        headers: RECEIVED_HEADERS,
        rows
      }
    }
  })

const exporterInput = (rows) =>
  /** @type {any} */ ({
    meta: { PROCESSING_TYPE: { value: 'EXPORTER' } },
    data: {
      RECEIVED_LOADS_FOR_EXPORT: {
        location: { sheet: 'Sheet1', row: 1, column: 'A' },
        headers: RECEIVED_HEADERS,
        rows
      }
    }
  })

const extractorFor = (fileId, parsed) =>
  createInMemorySummaryLogExtractor({ [fileId]: /** @type {any} */ (parsed) })

const receivedRow = (rowNumber, rowId, date, weight) => ({
  rowNumber,
  values: [rowId, date, weight]
})

const BALANCE_BEARING_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_REPROCESSING',
  'EWC_CODE',
  'DESCRIPTION_WASTE',
  'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  FIELD_GROSS_WEIGHT,
  'TARE_WEIGHT',
  'PALLET_WEIGHT',
  'NET_WEIGHT',
  'BAILING_WIRE_PROTOCOL',
  'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
  'WEIGHT_OF_NON_TARGET_MATERIALS',
  'RECYCLABLE_PROPORTION_PERCENTAGE',
  'TONNAGE_RECEIVED_FOR_RECYCLING'
]

const ACCREDITED_DATE = '2026-02-01'

/**
 * A row carrying every field the reprocessor-input balance classifier needs, so
 * it classifies INCLUDED and contributes its tonnage.
 */
const balanceBearingRow = (rowNumber, rowId, tonnage, prnIssued = 'No') => ({
  rowNumber,
  values: [
    rowId,
    ACCREDITED_DATE,
    '15 01 02',
    'Plastic packaging',
    prnIssued,
    10,
    1,
    0,
    9,
    'No',
    'Sampling',
    0,
    100,
    tonnage
  ]
})

const balanceBearingInput = (rows) =>
  /** @type {any} */ ({
    meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' } },
    data: {
      RECEIVED_LOADS_FOR_REPROCESSING: {
        location: { sheet: 'Sheet1', row: 1, column: 'A' },
        headers: BALANCE_BEARING_HEADERS,
        rows
      }
    }
  })

const EXPORTED_LOAD_HEADERS = [
  'ROW_ID',
  'DATE_RECEIVED_FOR_EXPORT',
  'EWC_CODE',
  'DESCRIPTION_WASTE',
  'WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE',
  FIELD_GROSS_WEIGHT,
  'TARE_WEIGHT',
  'PALLET_WEIGHT',
  'NET_WEIGHT',
  'BAILING_WIRE_PROTOCOL',
  'HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION',
  'WEIGHT_OF_NON_TARGET_MATERIALS',
  'RECYCLABLE_PROPORTION_PERCENTAGE',
  'TONNAGE_RECEIVED_FOR_EXPORT',
  'TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED',
  'DATE_OF_EXPORT',
  'BASEL_EXPORT_CODE',
  'CUSTOMS_CODES',
  'CONTAINER_NUMBER',
  'DATE_RECEIVED_BY_OSR',
  'OSR_ID',
  'DID_WASTE_PASS_THROUGH_AN_INTERIM_SITE'
]

/**
 * An exported load carrying every field the exporter balance classifier needs,
 * so only its overseas-site reference decides whether it is included.
 */
const exportedLoadRow = (rowNumber, rowId, tonnage, { osrId }) => ({
  rowNumber,
  values: [
    rowId,
    ACCREDITED_DATE,
    '15 01 02',
    'Plastic packaging',
    'No',
    10,
    1,
    0,
    9,
    'No',
    'Sampling',
    0,
    100,
    tonnage,
    tonnage,
    ACCREDITED_DATE,
    'B3011',
    '3915',
    'CONT-1',
    ACCREDITED_DATE,
    osrId,
    'No'
  ]
})

const exportedLoadsInput = (rows) =>
  /** @type {any} */ ({
    meta: { PROCESSING_TYPE: { value: 'EXPORTER' } },
    data: {
      RECEIVED_LOADS_FOR_EXPORT: {
        location: { sheet: 'Sheet1', row: 1, column: 'A' },
        headers: EXPORTED_LOAD_HEADERS,
        rows
      }
    }
  })

describe('syncFromSummaryLog', () => {
  let wasteBalanceService
  let organisationsRepository
  let overseasSitesRepository
  let summaryLogRowStateRepository
  let ledgerRepository

  beforeEach(() => {
    ledgerRepository = createInMemoryLedgerRepository()()
    summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    wasteBalanceService = {
      submitSummaryLog: vi.fn(),
      commitSummaryLogSubmittedEvent: vi.fn()
    }
    organisationsRepository = {
      findRegistrationById: vi.fn().mockResolvedValue({ overseasSites: {} }),
      // Both organisations repositories find the accreditation by matching its
      // own id, so the one returned always carries the id that was asked for.
      findAccreditationById: vi
        .fn()
        .mockImplementation(async (_organisationId, accreditationId) => ({
          id: accreditationId,
          validFrom: '2023-01-01',
          validTo: '2023-12-31'
        }))
    }
    overseasSitesRepository = {
      findByIds: vi.fn().mockResolvedValue([])
    }
  })

  const makeSync = (overrides = {}) =>
    /** @type {any} */ (syncFromSummaryLog)({
      wasteBalanceService,
      organisationsRepository,
      overseasSitesRepository,
      summaryLogRowStateRepository,
      ledgerRepository,
      ...overrides
    })

  it('commits the submission rows as row states', async () => {
    const fileId = 'file-commit'
    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: reprocessorInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5),
        receivedRow(3, 'row-456', '2025-01-16', TEST_WEIGHT_200_75)
      ])
    })

    await makeSync({ extractor })(summaryLogFor(fileId), TEST_USER)

    const rowStates =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        LEDGER_ID,
        fileId
      )
    expect(rowStates.map((state) => state.rowId).sort()).toEqual([
      'row-123',
      'row-456'
    ])
    expect(
      rowStates.every(
        (state) => state.wasteRecordType === WASTE_RECORD_TYPE.RECEIVED
      )
    ).toBe(true)
  })

  it('passes through tables that have no schema', async () => {
    const fileId = 'file-no-schema'
    const extractor = extractorFor(fileId, {
      meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' } },
      data: {
        UNKNOWN_TABLE: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: ['SOMETHING'],
          rows: [{ rowNumber: 2, values: ['ignored'] }]
        }
      }
    })

    await makeSync({ extractor })(summaryLogFor(fileId), TEST_USER)

    const rowStates =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        LEDGER_ID,
        fileId
      )
    expect(rowStates).toEqual([])
  })

  it('excludes null and EPR-marker headers when building row data', async () => {
    const fileId = 'file-marker-headers'
    const extractor = extractorFor(fileId, {
      meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' } },
      data: {
        RECEIVED_LOADS_FOR_REPROCESSING: {
          location: { sheet: 'Sheet1', row: 1, column: 'A' },
          headers: [
            'ROW_ID',
            '__EPR_META_MARKER',
            null,
            'DATE_RECEIVED_FOR_REPROCESSING',
            FIELD_GROSS_WEIGHT
          ],
          rows: [
            {
              rowNumber: 2,
              values: [
                'row-123',
                'marker-value',
                'null-column-value',
                TEST_DATE_2025_01_15,
                TEST_WEIGHT_100_5
              ]
            }
          ]
        }
      }
    })

    await makeSync({ extractor })(summaryLogFor(fileId), TEST_USER)

    const rowStates =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        LEDGER_ID,
        fileId
      )
    expect(rowStates).toHaveLength(1)
    expect(Object.keys(rowStates[0].data)).toEqual(
      expect.arrayContaining([
        'DATE_RECEIVED_FOR_REPROCESSING',
        FIELD_GROSS_WEIGHT
      ])
    )
    expect(rowStates[0].data).not.toHaveProperty('__EPR_META_MARKER')
  })

  it('skips the waste balance calculation for an accredited non-balance processing type', async () => {
    const fileId = 'file-accredited-non-balance'
    const extractor = extractorFor(fileId, {
      meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_REGISTERED_ONLY' } },
      data: {}
    })

    await makeSync({ extractor })(summaryLogFor(fileId, 'acc-1'), TEST_USER)

    expect(wasteBalanceService.submitSummaryLog).not.toHaveBeenCalled()
    expect(
      wasteBalanceService.commitSummaryLogSubmittedEvent
    ).not.toHaveBeenCalled()
  })

  it('carries the user name into a registered-only submitted event', async () => {
    const fileId = 'file-reg-only-named'
    const extractor = extractorFor(fileId, {
      meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_REGISTERED_ONLY' } },
      data: {}
    })
    const namedUser = { ...TEST_USER, name: 'Jane Reprocessor' }

    await makeSync({ extractor })(summaryLogFor(fileId), namedUser)

    expect(
      wasteBalanceService.commitSummaryLogSubmittedEvent
    ).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({
        id: namedUser.id,
        name: 'Jane Reprocessor',
        email: namedUser.email
      })
    )
  })

  it('does not depend on the legacy waste-records repository', () => {
    expect(() => makeSync({ extractor: { extract: vi.fn() } })).not.toThrow()
    expect(makeSync({ extractor: { extract: vi.fn() } })).toBeInstanceOf(
      Function
    )
  })

  it('filters template rows with null or header-text ROW_ID', async () => {
    const fileId = 'file-template'
    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: reprocessorInput([
        receivedRow(
          2,
          'Row ID (auto-generated)',
          'Date description',
          'Weight description'
        ),
        receivedRow(3, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5),
        receivedRow(4, null, null, null),
        receivedRow(5, 'row-456', '2025-01-16', TEST_WEIGHT_200_75)
      ])
    })

    await makeSync({ extractor })(summaryLogFor(fileId), TEST_USER)

    const rowStates =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        LEDGER_ID,
        fileId
      )
    expect(rowStates.map((state) => state.rowId).sort()).toEqual([
      'row-123',
      'row-456'
    ])
  })

  it('credits the accredited ledger with the submission total', async () => {
    const fileId = 'file-wb'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    await makeSync({ extractor })(summaryLogFor(fileId, 'acc-1'), TEST_USER)

    expect(wasteBalanceService.submitSummaryLog).toHaveBeenCalledWith({
      ledgerId: {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      },
      creditTotal: 0,
      summaryLogId: fileId,
      user: TEST_USER
    })
  })

  it("classifies exporter rows against the registration's resolved overseas sites", async () => {
    const fileId = 'file-ors'
    const extractor = extractorFor(
      fileId,
      exportedLoadsInput([
        exportedLoadRow(2, 'row-2001', 12.5, { osrId: '001' }),
        exportedLoadRow(3, 'row-2002', 40, { osrId: '002' })
      ])
    )

    overseasSitesRepository = {
      findByIds: vi
        .fn()
        .mockResolvedValue([
          { id: 'site-aaa', validFrom: new Date('2024-01-01') }
        ])
    }
    organisationsRepository.findRegistrationById = vi.fn().mockResolvedValue({
      overseasSites: { '001': { overseasSiteId: 'site-aaa' } }
    })
    organisationsRepository.findAccreditationById.mockResolvedValue({
      id: 'acc-1',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      statusHistory: []
    })

    await makeSync({ extractor })(summaryLogFor(fileId, 'acc-1'), TEST_USER)

    const rowStates =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        { ...LEDGER_ID, accreditationId: 'acc-1' },
        fileId
      )
    const byRowId = new Map(rowStates.map((state) => [state.rowId, state]))
    expect(byRowId.get('row-2001').classification).toEqual({
      outcome: WASTE_BALANCE_OUTCOME.INCLUDED,
      reasons: [],
      transactionAmount: 12.5
    })
    expect(byRowId.get('row-2002').classification.reasons).toEqual([
      { code: CLASSIFICATION_REASON.ORS_NOT_FOUND }
    ])
  })

  it('commits a zero-delta event for registered-only submissions', async () => {
    const fileId = 'file-reg-only'
    const extractor = extractorFor(fileId, {
      meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_REGISTERED_ONLY' } },
      data: {}
    })

    await makeSync({ extractor })(summaryLogFor(fileId), TEST_USER)

    expect(wasteBalanceService.submitSummaryLog).not.toHaveBeenCalled()
    expect(
      wasteBalanceService.commitSummaryLogSubmittedEvent
    ).toHaveBeenCalledWith(
      {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: null
      },
      { summaryLogId: fileId, creditTotal: 0 },
      expect.objectContaining({ id: TEST_USER.id, email: TEST_USER.email })
    )
  })

  it('throws when accreditationId exists but accreditation is not found', async () => {
    const fileId = 'file-no-accred'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )
    organisationsRepository.findAccreditationById.mockResolvedValue(null)

    await expect(
      makeSync({ extractor })(summaryLogFor(fileId, 'acc-missing'), TEST_USER)
    ).rejects.toThrow('Accreditation not found: acc-missing')
  })

  it('resolves accreditationId from the registration when absent on the summary log', async () => {
    const fileId = 'file-resolve-accred'
    const extractor = createInMemorySummaryLogExtractor({
      [fileId]: reprocessorInput([])
    })

    await makeSync({ extractor })(summaryLogFor(fileId), TEST_USER)

    expect(organisationsRepository.findRegistrationById).toHaveBeenCalled()
  })

  describe('return value (created/updated counts against the committed head)', () => {
    const realBalanceSync = (extractor) =>
      makeSync({
        extractor,
        wasteBalanceService: createWasteBalanceService(ledgerRepository)
      })

    it('counts every row as created on a first submission', async () => {
      const fileId = 'file-first'
      const extractor = createInMemorySummaryLogExtractor({
        [fileId]: reprocessorInput([
          receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5),
          receivedRow(3, 'row-456', '2025-01-16', TEST_WEIGHT_200_75)
        ])
      })

      const result = await realBalanceSync(extractor)(
        summaryLogFor(fileId),
        TEST_USER
      )

      expect(result).toEqual({ created: 2, updated: 0 })
    })

    it('counts a changed row as updated and a fresh row as created', async () => {
      const firstFile = 'file-initial'
      const secondFile = 'file-mixed'
      const extractor = createInMemorySummaryLogExtractor({
        [firstFile]: reprocessorInput([
          receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
        ]),
        [secondFile]: reprocessorInput([
          receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_200_75),
          receivedRow(3, 'row-456', '2025-01-16', TEST_WEIGHT_250_5)
        ])
      })

      await realBalanceSync(extractor)(summaryLogFor(firstFile), TEST_USER)
      const result = await realBalanceSync(extractor)(
        summaryLogFor(secondFile),
        TEST_USER
      )

      expect(result).toEqual({ created: 1, updated: 1 })
    })

    it('does not count unchanged rows', async () => {
      const firstFile = 'file-initial-unchanged'
      const secondFile = 'file-unchanged'
      const rows = [
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ]
      const extractor = createInMemorySummaryLogExtractor({
        [firstFile]: reprocessorInput(rows),
        [secondFile]: reprocessorInput(rows)
      })

      await realBalanceSync(extractor)(summaryLogFor(firstFile), TEST_USER)
      const result = await realBalanceSync(extractor)(
        summaryLogFor(secondFile),
        TEST_USER
      )

      expect(result).toEqual({ created: 0, updated: 0 })
    })
  })

  describe('the committed submission, against a real ledger', () => {
    const ACCREDITATION = {
      id: 'acc-1',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      statusHistory: []
    }
    const ACCREDITED_LEDGER_ID = {
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: 'acc-1'
    }

    const realBalanceSync = (extractor) =>
      makeSync({
        extractor,
        wasteBalanceService: createWasteBalanceService(ledgerRepository)
      })

    const submittedEvents = async (ledgerId) =>
      (await ledgerRepository.findAllInLedger(ledgerId)).filter(
        (event) => event.kind === LEDGER_EVENT_KIND.SUMMARY_LOG_SUBMITTED
      )

    beforeEach(() => {
      organisationsRepository.findAccreditationById.mockResolvedValue(
        ACCREDITATION
      )
    })

    it('credits the ledger with the total carried by the row states it committed', async () => {
      const fileId = 'file-credit'
      const extractor = createInMemorySummaryLogExtractor({
        [fileId]: balanceBearingInput([
          balanceBearingRow(2, 'row-1001', 1.005),
          balanceBearingRow(3, 'row-1002', 2.5),
          balanceBearingRow(4, 'row-1003', 4, 'Yes')
        ])
      })

      await realBalanceSync(extractor)(
        summaryLogFor(fileId, 'acc-1'),
        TEST_USER
      )

      const rowStates =
        await summaryLogRowStateRepository.findRowStatesForSummaryLog(
          ACCREDITED_LEDGER_ID,
          fileId
        )
      const creditFromStates = rowStates.reduce(
        (total, state) => total + getTargetAmount(state.classification),
        0
      )

      const [event] = await submittedEvents(ACCREDITED_LEDGER_ID)
      expect(event.payload).toEqual({ summaryLogId: fileId, creditTotal: 3.51 })
      expect(creditFromStates).toBeCloseTo(3.51, 10)
    })

    it('commits no event when an accredited balance-bearing submission has no rows', async () => {
      const fileId = 'file-accredited-empty'
      const extractor = createInMemorySummaryLogExtractor({
        [fileId]: balanceBearingInput([])
      })

      await realBalanceSync(extractor)(
        summaryLogFor(fileId, 'acc-1'),
        TEST_USER
      )

      expect(
        await ledgerRepository.findAllInLedger(ACCREDITED_LEDGER_ID)
      ).toEqual([])
    })

    it('commits no event for an accredited registered-only submission', async () => {
      const fileId = 'file-accredited-reg-only'
      const extractor = extractorFor(fileId, {
        meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_REGISTERED_ONLY' } },
        data: {}
      })

      await realBalanceSync(extractor)(
        summaryLogFor(fileId, 'acc-1'),
        TEST_USER
      )

      expect(
        await ledgerRepository.findAllInLedger(ACCREDITED_LEDGER_ID)
      ).toEqual([])
    })

    it('commits a zero-credit event with no accreditation, even with no rows', async () => {
      const fileId = 'file-unaccredited-empty'
      const extractor = extractorFor(fileId, {
        meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' } },
        data: {}
      })
      organisationsRepository.findRegistrationById.mockResolvedValue({
        overseasSites: {}
      })

      await realBalanceSync(extractor)(summaryLogFor(fileId), TEST_USER)

      const [event] = await submittedEvents(LEDGER_ID)
      expect(event.payload).toEqual({ summaryLogId: fileId, creditTotal: 0 })
    })

    it('commits the row states whether or not the submission bears a balance', async () => {
      const fileId = 'file-states-always'
      const extractor = createInMemorySummaryLogExtractor({
        [fileId]: balanceBearingInput([balanceBearingRow(2, 'row-1001', 3.25)])
      })

      await realBalanceSync(extractor)(
        summaryLogFor(fileId, 'acc-1'),
        TEST_USER
      )

      const rowStates =
        await summaryLogRowStateRepository.findRowStatesForSummaryLog(
          ACCREDITED_LEDGER_ID,
          fileId
        )
      expect(rowStates.map((state) => state.rowId)).toEqual(['row-1001'])
      expect(rowStates[0].classification.transactionAmount).toBe(3.25)
    })
  })
})
