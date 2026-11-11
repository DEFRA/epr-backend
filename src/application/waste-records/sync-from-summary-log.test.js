import { describe, it, expect, beforeEach, vi } from 'vitest'
import { syncFromSummaryLog } from './sync-from-summary-log.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemorySummaryLogExtractor } from '#application/summary-logs/extractor-inmemory.js'
import { createInMemorySummaryLogRowStatesRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

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

// The numbers the mocked organisation record gives org-1/reg-1.
const LEDGER_ID = {
  organisationNumber: toOrganisationNumber('500001'),
  registrationNumber: toRegistrationNumber('REG-1'),
  accreditationNumber: null
}

const ORGANISATION_NUMBER = toOrganisationNumber('500001')
const REGISTRATION_NUMBER = toRegistrationNumber('REG-1')
const ACCREDITATION_NUMBER = toAccreditationNumber('ACC-1')

const ACCREDITATION = {
  id: 'acc-1',
  accreditationNumber: 'ACC-1',
  validFrom: '2023-01-01',
  validTo: '2023-12-31',
  statusHistory: []
}

/**
 * @param {{ registration?: object, accreditations?: object[] }} [options]
 */
const organisationWith = ({ registration = {}, accreditations } = {}) => ({
  id: 'org-1',
  orgId: 500001,
  registrations: [
    { id: 'reg-2', registrationNumber: 'REG-2', overseasSites: {} },
    {
      id: 'reg-1',
      registrationNumber: 'REG-1',
      overseasSites: {},
      ...registration
    }
  ],
  accreditations: accreditations ?? [
    { id: 'acc-2', accreditationNumber: 'ACC-2' },
    ACCREDITATION
  ]
})

/**
 * A summary log naming its registration and accreditation by number. A
 * registered-only one carries a `null` accreditation number.
 *
 * @param {string} fileId
 * @param {import('#domain/organisations/numbers.js').AccreditationNumber | null} [accreditationNumber]
 */
const summaryLogFor = (fileId, accreditationNumber = null) => ({
  file: { id: fileId, uri: `s3://test-bucket/${fileId}` },
  organisationNumber: ORGANISATION_NUMBER,
  registrationNumber: REGISTRATION_NUMBER,
  accreditationNumber
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
  let organisationAdministrationRepository
  let overseasSitesRepository
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
    organisationAdministrationRepository = {
      findByOrganisationNumber: vi.fn().mockResolvedValue(organisationWith())
    }
    overseasSitesRepository = {
      findByIds: vi.fn().mockResolvedValue([])
    }
  })

  const makeSync = (overrides = {}) =>
    /** @type {any} */ (syncFromSummaryLog)({
      wasteBalanceService,
      organisationAdministrationRepository,
      overseasSitesRepository,
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

    await makeSync({ extractor })(
      summaryLogFor(fileId, ACCREDITATION_NUMBER),
      TEST_USER
    )

    const [rowState] =
      await summaryLogRowStatesRepository.findRowStatesForSummaryLogFile(
        '500001',
        'REG-1',
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
        '500001',
        'REG-1',
        fileId
      )
    expect(rowState).toMatchObject({
      organisationNumber: '500001',
      registrationNumber: 'REG-1',
      accreditationNumber: null
    })
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

    await makeSync({ extractor })(
      summaryLogFor(fileId, ACCREDITATION_NUMBER),
      TEST_USER
    )

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

  it('updates waste balances when the summary log names an accreditation', async () => {
    const fileId = 'file-wb'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    await makeSync({ extractor })(
      summaryLogFor(fileId, ACCREDITATION_NUMBER),
      TEST_USER
    )

    expect(wasteBalanceService.submitSummaryLog).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          rowId: 'row-123',
          type: WASTE_RECORD_TYPE.EXPORTED
        })
      ]),
      {
        user: TEST_USER,
        accreditation: ACCREDITATION,
        overseasSites: {},
        summaryLogId: fileId,
        ledgerId: {
          organisationNumber: '500001',
          registrationNumber: 'REG-1',
          accreditationNumber: 'ACC-1'
        }
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
    organisationAdministrationRepository.findByOrganisationNumber.mockResolvedValue(
      organisationWith({
        registration: {
          overseasSites: { '001': { overseasSiteId: 'site-aaa' } }
        }
      })
    )

    await makeSync({ extractor })(
      summaryLogFor(fileId, ACCREDITATION_NUMBER),
      TEST_USER
    )

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
        organisationNumber: '500001',
        registrationNumber: 'REG-1',
        accreditationNumber: null
      },
      { summaryLogId: fileId, creditTotal: 0 },
      expect.objectContaining({ id: TEST_USER.id, email: TEST_USER.email })
    )
  })

  it('throws when no organisation holds the organisation number', async () => {
    const fileId = 'file-no-org'
    const extractor = extractorFor(fileId, reprocessorInput([]))
    organisationAdministrationRepository.findByOrganisationNumber.mockResolvedValue(
      null
    )

    await expect(
      makeSync({ extractor })(summaryLogFor(fileId), TEST_USER)
    ).rejects.toThrow('Organisation not found: 500001')
  })

  it('throws when the organisation holds no registration with the number', async () => {
    const fileId = 'file-no-reg'
    const extractor = extractorFor(fileId, reprocessorInput([]))

    await expect(
      makeSync({ extractor })(
        {
          ...summaryLogFor(fileId),
          registrationNumber: toRegistrationNumber('REG-MISSING')
        },
        TEST_USER
      )
    ).rejects.toThrow('Registration not found: REG-MISSING')
  })

  it('throws when the organisation holds no accreditation with the number', async () => {
    const fileId = 'file-no-accred'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    await expect(
      makeSync({ extractor })(
        summaryLogFor(fileId, toAccreditationNumber('ACC-MISSING')),
        TEST_USER
      )
    ).rejects.toThrow('Accreditation not found: ACC-MISSING')
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
