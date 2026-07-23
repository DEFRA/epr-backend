import { describe, it, expect, beforeEach, vi } from 'vitest'
import { syncFromSummaryLog } from './sync-from-summary-log.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'

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
      findAccreditationById: vi.fn().mockResolvedValue({
        id: 'acc-default',
        validFrom: '2023-01-01',
        validTo: '2023-12-31'
      })
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

  it('updates waste balances when accreditationId is present', async () => {
    const fileId = 'file-wb'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    await makeSync({ extractor })(summaryLogFor(fileId, 'acc-1'), TEST_USER)

    expect(wasteBalanceService.submitSummaryLog).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rowId: 'row-123',
          type: WASTE_RECORD_TYPE.EXPORTED
        })
      ]),
      {
        user: TEST_USER,
        accreditation: {
          id: 'acc-default',
          validFrom: '2023-01-01',
          validTo: '2023-12-31'
        },
        overseasSites: {},
        summaryLogId: fileId
      }
    )
  })

  it('resolves overseas sites for exporter waste balance validation', async () => {
    const fileId = 'file-ors'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    const validFrom = new Date('2024-01-01')
    overseasSitesRepository = {
      findByIds: vi.fn().mockResolvedValue([{ id: 'site-aaa', validFrom }])
    }
    organisationsRepository.findRegistrationById = vi.fn().mockResolvedValue({
      overseasSites: { '001': { overseasSiteId: 'site-aaa' } }
    })

    await makeSync({ extractor })(summaryLogFor(fileId, 'acc-1'), TEST_USER)

    expect(wasteBalanceService.submitSummaryLog).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        overseasSites: { '001': { validFrom } }
      })
    )
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
})
