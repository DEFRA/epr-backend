import { describe, it, expect, beforeEach, vi } from 'vitest'
import { toYear } from '#common/helpers/dates/year.js'
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

const YEAR = toYear(2026)

// The numbers the mocked organisation record gives org-1/reg-1.
const LEDGER_ID = {
  organisationNumber: toOrganisationNumber('500001'),
  registrationNumber: toRegistrationNumber('REG-1'),
  accreditationNumber: null,
  year: YEAR
}

const ORGANISATION_NUMBER = toOrganisationNumber('500001')
const REGISTRATION_NUMBER = toRegistrationNumber('REG-1')
const ACCREDITATION_NUMBER = toAccreditationNumber('ACC-1')

const APPROVED_FROM = '2023-01-01T00:00:00.000Z'

/** @import { AccreditationValidity } from '#domain/organisations/accreditation.js' */
/** @import { AccreditationNumber } from '#domain/organisations/numbers.js' */
/** @import { AccreditationCommon, ExporterRegistration, ReprocessorRegistration } from '#organisation-read-model/domain/model.js' */

/**
 * @param {AccreditationNumber} accreditationNumber
 * @returns {AccreditationCommon}
 */
const accreditationNumbered = (accreditationNumber) => ({
  accreditationNumber,
  prnIssuance: { tonnageBand: 'up_to_500' },
  status: {
    current: 'approved',
    timeline: [
      { status: 'approved', at: APPROVED_FROM, updatedAt: APPROVED_FROM }
    ]
  }
})

/**
 * The validity the waste balance reads for ACC-1, held for 2023.
 *
 * @type {AccreditationValidity}
 */
const ACCREDITATION_VALIDITY = {
  statusHistory: [{ status: 'approved', updatedAt: APPROVED_FROM }],
  validFrom: '2023-01-01',
  validTo: '2023-12-31'
}

/**
 * An organisation as the read model serves it, holding REG-1 and REG-2. REG-1
 * holds ACC-1 for 2023 unless `registration` replaces its accreditations.
 *
 * @param {{ registration?: Partial<ReprocessorRegistration | ExporterRegistration> }} [options]
 */
const organisationWith = ({ registration = {} } = {}) => ({
  organisationNumber: ORGANISATION_NUMBER,
  registrations: {
    'REG-2': {
      wasteProcessingType: 'reprocessor',
      accreditations: {
        2022: accreditationNumbered(toAccreditationNumber('ACC-2'))
      }
    },
    'REG-1': {
      wasteProcessingType: 'reprocessor',
      accreditations: { 2023: accreditationNumbered(ACCREDITATION_NUMBER) },
      ...registration
    }
  }
})

/**
 * A summary log naming its registration and accreditation by number. A
 * registered-only one carries a `null` accreditation number.
 *
 * @param {string} fileId
 * @param {import('#domain/organisations/numbers.js').AccreditationNumber | null} [accreditationNumber]
 */
const summaryLogFor = (fileId, accreditationNumber = null, year = YEAR) => ({
  file: { id: fileId, uri: `s3://test-bucket/${fileId}` },
  organisationNumber: ORGANISATION_NUMBER,
  registrationNumber: REGISTRATION_NUMBER,
  accreditationNumber,
  year
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
      findByOrganisationNumber: vi.fn().mockResolvedValue(organisationWith())
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

  it('stores the organisation, registration and accreditation numbers and the year on each row state', async () => {
    const fileId = 'file-numbers'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    await makeSync({ extractor })(
      summaryLogFor(fileId, ACCREDITATION_NUMBER, toYear(2027)),
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
      accreditationNumber: 'ACC-1',
      year: 2027
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
        accreditation: ACCREDITATION_VALIDITY,
        overseasSites: {},
        summaryLogId: fileId,
        ledgerId: {
          organisationNumber: '500001',
          registrationNumber: 'REG-1',
          accreditationNumber: 'ACC-1',
          year: YEAR
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

    organisationReadRepository.findByOrganisationNumber.mockResolvedValue(
      organisationWith({
        registration: {
          wasteProcessingType: 'exporter',
          accreditations: {
            2023: {
              ...accreditationNumbered(ACCREDITATION_NUMBER),
              overseasSites: {
                '001': { status: 'approved', approvedOn: '2024-01-01' },
                '002': { status: 'pending' }
              }
            }
          }
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
        overseasSites: {
          '001': { validFrom: new Date('2024-01-01') },
          '002': { validFrom: null }
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
        organisationNumber: '500001',
        registrationNumber: 'REG-1',
        accreditationNumber: null,
        year: YEAR
      },
      { summaryLogId: fileId, creditTotal: 0 },
      expect.objectContaining({ id: TEST_USER.id, email: TEST_USER.email })
    )
  })

  it('throws when no organisation holds the organisation number', async () => {
    const fileId = 'file-no-org'
    const extractor = extractorFor(fileId, reprocessorInput([]))
    organisationReadRepository.findByOrganisationNumber.mockResolvedValue(null)

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

  it('throws when the accreditation belongs to another of the organisation’s registrations', async () => {
    const fileId = 'file-other-registration'
    const extractor = extractorFor(
      fileId,
      exporterInput([
        receivedRow(2, 'row-123', TEST_DATE_2025_01_15, TEST_WEIGHT_100_5)
      ])
    )

    await expect(
      makeSync({ extractor })(
        summaryLogFor(fileId, toAccreditationNumber('ACC-2')),
        TEST_USER
      )
    ).rejects.toThrow('Accreditation not found: ACC-2')
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
