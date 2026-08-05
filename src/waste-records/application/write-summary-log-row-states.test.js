import { describe, it, expect, beforeEach } from 'vitest'

import { writeSummaryLogRowStates } from './write-summary-log-row-states.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'
import { CLASSIFICATION_REASON } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'

const buildRegisteredOnlyRecord = ({ rowId, tonnage }) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  rowId: String(rowId),
  type: WASTE_RECORD_TYPE.RECEIVED,
  versions: [],
  data: {
    processingType: 'REPROCESSOR_REGISTERED_ONLY',
    NET_WEIGHT: tonnage
  }
})

const buildReceivedRecord = ({ rowId, tonnage }) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  rowId: String(rowId),
  type: WASTE_RECORD_TYPE.RECEIVED,
  versions: [],
  data: {
    processingType: 'REPROCESSOR_REGISTERED_ONLY',
    TONNAGE_RECEIVED_FOR_RECYCLING: tonnage
  }
})

const buildIncompleteReprocessorInputRecord = ({ rowId }) => ({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  rowId: String(rowId),
  type: WASTE_RECORD_TYPE.RECEIVED,
  versions: [],
  data: {
    processingType: 'REPROCESSOR_INPUT',
    ROW_ID: String(rowId),
    DATE_RECEIVED_FOR_REPROCESSING: '2026-02-01',
    EWC_CODE: '15 01 02',
    DESCRIPTION_WASTE: 'Plastic packaging',
    WERE_PRN_OR_PERN_ISSUED_ON_THIS_WASTE: 'No',
    GROSS_WEIGHT: 10,
    TARE_WEIGHT: 1,
    PALLET_WEIGHT: 0,
    NET_WEIGHT: 9,
    BAILING_WIRE_PROTOCOL: 'No',
    HOW_DID_YOU_CALCULATE_RECYCLABLE_PROPORTION: 'Sampling',
    WEIGHT_OF_NON_TARGET_MATERIALS: 0,
    RECYCLABLE_PROPORTION_PERCENTAGE: 100
    // TONNAGE_RECEIVED_FOR_RECYCLING deliberately absent
  }
})

const overseasSites = /** @type {any} */ (new Map())

const registeredOnlyLedgerId = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: null
}

const accreditedLedgerId = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

describe('writeSummaryLogRowStates', () => {
  let summaryLogRowStateRepository

  beforeEach(() => {
    summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
  })

  it('writes a row state per record under the registered-only ledger', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      wasteRecords: [
        buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 }),
        buildRegisteredOnlyRecord({ rowId: 2, tonnage: 20 })
      ],
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const committed =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        registeredOnlyLedgerId,
        'log-A'
      )
    expect(committed.map((doc) => doc.rowId).sort()).toEqual(['1', '2'])
    expect(committed.find((doc) => doc.rowId === '1')).toMatchObject({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: null,
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      classification: {
        outcome: WASTE_BALANCE_OUTCOME.NOT_APPLICABLE,
        reasons: [],
        transactionAmount: 0
      },
      summaryLogIds: ['log-A']
    })
  })

  it('stores tonnages coerced to two decimal places', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      wasteRecords: [buildReceivedRecord({ rowId: 1, tonnage: 1.005 })],
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const [committed] =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        registeredOnlyLedgerId,
        'log-A'
      )
    expect(committed.data.TONNAGE_RECEIVED_FOR_RECYCLING).toBe(1.01)
  })

  it('stores weight quantities coerced to two decimal places', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 7.536 })],
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const [committed] =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        registeredOnlyLedgerId,
        'log-A'
      )
    expect(committed.data.NET_WEIGHT).toBe(7.54)
  })

  it('stores tonnages so round-each-then-sum no longer drifts from sum-then-round', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      wasteRecords: [
        buildReceivedRecord({ rowId: 1, tonnage: 1.005 }),
        buildReceivedRecord({ rowId: 2, tonnage: 1.005 }),
        buildReceivedRecord({ rowId: 3, tonnage: 1.005 })
      ],
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const committed =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        registeredOnlyLedgerId,
        'log-A'
      )
    const storedTonnages = committed.map(
      (doc) => doc.data.TONNAGE_RECEIVED_FOR_RECYCLING
    )
    // Stored per-row values are already 2dp, so summing them yields the
    // round-each-then-sum total (3.03) however a consumer adds them — the
    // sum-then-round residual (3.015 → 3.02) can no longer arise.
    expect(storedTonnages).toEqual([1.01, 1.01, 1.01])
    expect(storedTonnages.reduce((sum, t) => sum + t, 0)).toBeCloseTo(3.03, 10)
  })

  it('carries the supplied accreditation id onto the ledger', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
      accreditation: {
        id: 'acc-1',
        validFrom: '2023-01-01',
        validTo: '2030-12-31'
      },
      ledgerId: accreditedLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const [committed] =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        accreditedLedgerId,
        'log-A'
      )
    expect(committed.accreditationId).toBe('acc-1')
  })

  it('stamps the missing field on a row excluded for incomplete data', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      wasteRecords: [buildIncompleteReprocessorInputRecord({ rowId: 1 })],
      accreditation: {
        id: 'acc-1',
        validFrom: '2023-01-01',
        validTo: '2030-12-31'
      },
      ledgerId: accreditedLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const [committed] =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        accreditedLedgerId,
        'log-A'
      )

    expect(committed.classification.outcome).toBe(
      WASTE_BALANCE_OUTCOME.EXCLUDED
    )
    expect(committed.classification.reasons).toContainEqual({
      code: CLASSIFICATION_REASON.MISSING_REQUIRED_FIELD,
      field: 'TONNAGE_RECEIVED_FOR_RECYCLING'
    })
  })

  it('is idempotent — re-running the same submission adds no duplicate', async () => {
    const submit = () =>
      writeSummaryLogRowStates({
        summaryLogRowStateRepository,
        wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
        accreditation: null,
        ledgerId: registeredOnlyLedgerId,
        overseasSites,
        summaryLogId: 'log-A'
      })

    await submit()
    await submit()

    const committed =
      await summaryLogRowStateRepository.findRowStatesForSummaryLog(
        registeredOnlyLedgerId,
        'log-A'
      )
    expect(committed).toHaveLength(1)
    expect(committed[0].summaryLogIds).toEqual(['log-A'])
  })
})
