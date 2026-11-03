import { readModelAccreditedPeriod } from '#waste-balances/domain/classification-context.js'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { syncFromSummaryLog } from './sync-from-summary-log.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
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

/**
 * A summary log as upload stores it: its ids and the numbers they map to.
 * Without an accreditation id it is registered-only.
 *
 * @param {string} fileId
 * @param {string} [accreditationId]
 */
const summaryLogFor = (fileId, accreditationId) =>
  /** @type {any} */ ({
    file: { id: fileId, uri: `s3://test-bucket/${fileId}` },
    organisationId: 'org-1',
    registrationId: 'reg-1',
    accreditationId: accreditationId ?? null,
    organisationNumber: '500001',
    registrationNumber: 'REG-1',
    accreditationNumber: accreditationId ? 'ACC-1' : null
  })

const approvedTimeline = [
  { status: 'created', at: '2022-12-01T00:00:00.000Z' },
  { status: 'approved', at: '2023-01-01T00:00:00.000Z' }
]

const servedAccreditation = {
  accreditationNumber: 'ACC-1',
  status: { current: 'approved', timeline: approvedTimeline },
  overseasSites: {}
}

/**
 * The read model's answer for ACC-1 on REG-1: an approved 2023 accreditation.
 *
 * @param {{ registration?: object, accreditation?: object, year?: string }} [overrides]
 */
const servedBy = (overrides = {}) => ({
  organisation: {},
  registration: { overseasSites: {} },
  accreditation: servedAccreditation,
  year: '2023',
  ...overrides
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
  let organisationReadRepository
  let summaryLogRowStatesRepository
  let ledgerRepository

  beforeEach(() => {
    ledgerRepository = createInMemoryLedgerRepository()()
    summaryLogRowStatesRepository =
      createInMemorySummaryLogRowStatesRepository()()
    wasteBalanceService = {
      submitSummaryLog: vi.fn(),
      commitSummaryLogSubmittedEvent: vi.fn()
    }
    organisationReadRepository = {
      findAccreditationByNumber: vi.fn().mockResolvedValue(servedBy())
    }
  })

  const makeSync = (overrides = {}) =>
    /** @type {any} */ (syncFromSummaryLog)({
      wasteBalanceService,
      organisationReadRepository,
      summaryLogRowStatesRepository,
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
      await summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
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

  it('stores the organisation, registration and accreditation numbers on each row state', async () => {
    const fileId = 'file-numbers'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    await makeSync({ extractor })(summaryLogFor(fileId, 'acc-1'), TEST_USER)

    const [rowState] =
      await summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
        'org-1',
        'reg-1',
        fileId
      )
    expect(rowState).toMatchObject({
      organisationNumber: '500001',
      registrationNumber: 'REG-1',
      accreditationNumber: 'ACC-1'
    })
  })

  it('stores no accreditation number on a registered-only row state', async () => {
    const fileId = 'file-numbers-reg-only'
    const extractor = extractorFor(
      fileId,
      reprocessorInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    await makeSync({ extractor })(summaryLogFor(fileId), TEST_USER)

    const [rowState] =
      await summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
        'org-1',
        'reg-1',
        fileId
      )
    expect(rowState).toMatchObject({
      organisationNumber: '500001',
      registrationNumber: 'REG-1',
      accreditationNumber: null
    })
  })

  it('stores no row state for a summary log without its stored numbers', async () => {
    const fileId = 'file-numbers-missing'
    const extractor = extractorFor(
      fileId,
      reprocessorInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    await expect(
      makeSync({ extractor })(
        { ...summaryLogFor(fileId), registrationNumber: undefined },
        TEST_USER
      )
    ).rejects.toThrow(
      'Cannot use summary log for registration reg-1 without its numbers: registrationNumber'
    )
    expect(
      await summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
        'org-1',
        'reg-1',
        fileId
      )
    ).toEqual([])
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
      await summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
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
      await summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
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
      await summaryLogRowStatesRepository.findWasteRecordStatesForSummaryLog(
        LEDGER_ID,
        fileId
      )
    expect(rowStates.map((state) => state.rowId).sort()).toEqual([
      'row-123',
      'row-456'
    ])
  })

  it('looks the accreditation up in the read model by the summary log’s numbers', async () => {
    const fileId = 'file-lookup'
    const extractor = extractorFor(fileId, exporterInput([]))

    await makeSync({ extractor })(summaryLogFor(fileId, 'acc-1'), TEST_USER)

    expect(
      organisationReadRepository.findAccreditationByNumber
    ).toHaveBeenCalledWith('500001', 'REG-1', 'ACC-1')
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
        accreditation: { id: 'acc-1', year: '2023' },
        accreditedPeriod: readModelAccreditedPeriod(
          /** @type {any} */ (servedAccreditation),
          '2023'
        ),
        overseasSites: {},
        summaryLogId: fileId,
        numbers: {
          organisationNumber: '500001',
          registrationNumber: 'REG-1',
          accreditationNumber: 'ACC-1'
        }
      }
    )
  })

  it('classifies an exporter against the accreditation’s overseas sites from the read model', async () => {
    const fileId = 'file-ors'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )
    organisationReadRepository.findAccreditationByNumber.mockResolvedValue(
      servedBy({
        registration: {
          overseasSites: {
            '001': { name: 'Site A', address: { country: 'India' } }
          }
        },
        accreditation: {
          ...servedAccreditation,
          overseasSites: {
            '001': { status: 'approved', approvedOn: '2024-01-01' }
          }
        }
      })
    )

    await makeSync({ extractor })(summaryLogFor(fileId, 'acc-1'), TEST_USER)

    expect(wasteBalanceService.submitSummaryLog).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        overseasSites: {
          '001': {
            approvedFrom: new Date('2024-01-01'),
            name: 'Site A',
            country: 'India'
          }
        }
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
        accreditationId: null,
        organisationNumber: '500001',
        registrationNumber: 'REG-1',
        accreditationNumber: null
      },
      { summaryLogId: fileId, creditTotal: 0 },
      expect.objectContaining({ id: TEST_USER.id, email: TEST_USER.email })
    )
  })

  describe('crediting a valid row against the read model', () => {
    const validReceivedRow = {
      ROW_ID: 1001,
      DATE_RECEIVED_FOR_REPROCESSING: '2023-06-01',
      EWC_CODE: '03 03 08',
      DESCRIPTION_WASTE: 'Paper',
      WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
      GROSS_WEIGHT: 10,
      TARE_WEIGHT: 0,
      PALLET_WEIGHT: 0,
      NET_WEIGHT: 10,
      BAILING_WIRE_PROTOCOL: 'No',
      HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Actual weight (100%)',
      WEIGHT_OF_NON_TARGET_MATERIALS: 0,
      RECYCLABLE_PROPORTION_PERCENTAGE: 1,
      TONNAGE_RECEIVED_FOR_RECYCLING: 10
    }
    const extractorForValidRow = (fileId, date) =>
      extractorFor(fileId, {
        meta: { PROCESSING_TYPE: { value: 'REPROCESSOR_INPUT' } },
        data: {
          RECEIVED_LOADS_FOR_REPROCESSING: {
            location: { sheet: 'Sheet1', row: 1, column: 'A' },
            headers: Object.keys(validReceivedRow),
            rows: [
              {
                rowNumber: 2,
                values: Object.values({
                  ...validReceivedRow,
                  DATE_RECEIVED_FOR_REPROCESSING: date
                })
              }
            ]
          }
        }
      })
    const submit = (fileId, date = '2023-06-01') =>
      makeSync({
        extractor: extractorForValidRow(fileId, date),
        wasteBalanceService: createWasteBalanceService(ledgerRepository)
      })(summaryLogFor(fileId, 'acc-1'), TEST_USER)
    const accreditedLedgerId = { ...LEDGER_ID, accreditationId: 'acc-1' }

    it('credits the row while the read model serves the accreditation', async () => {
      await submit('file-served')

      const [event] = await ledgerRepository.findAllInLedger(accreditedLedgerId)
      expect(event.payload.creditTotal).toBe(10)
    })

    it('places December in the year the read model keys the accreditation by', async () => {
      const result = await submit('file-december', '2023-12-05')

      expect(result.decemberWasteRowCount).toBe(1)
      const [event] = await ledgerRepository.findAllInLedger(accreditedLedgerId)
      expect(event.payload.decemberCreditTotal).toBe(10)
    })

    // The read model leaves out accreditations that were never approved (and
    // malformed ones). Their rows are never credited: every row is outside the
    // accreditation period, matching what validation showed on the check page.
    it('credits nothing for an accreditation the read model does not serve: every row is outside the accreditation period', async () => {
      organisationReadRepository.findAccreditationByNumber.mockResolvedValue(
        null
      )

      await submit('file-unserved')

      const [rowState] =
        await summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
          'org-1',
          'reg-1',
          'file-unserved'
        )
      expect(rowState.classification).toEqual({
        outcome: 'IGNORED',
        reasons: [{ code: 'OUTSIDE_ACCREDITATION_PERIOD' }],
        transactionAmount: 0
      })
      const [event] = await ledgerRepository.findAllInLedger(accreditedLedgerId)
      expect(event.payload.creditTotal).toBe(0)
    })
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

      expect(result).toEqual({
        created: 2,
        updated: 0,
        decemberWasteRowCount: 0
      })
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

      expect(result).toEqual({
        created: 1,
        updated: 1,
        decemberWasteRowCount: 0
      })
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

      expect(result).toEqual({
        created: 0,
        updated: 0,
        decemberWasteRowCount: 0
      })
    })
  })
})
