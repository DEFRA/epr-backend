import { describe, it, expect, beforeEach } from 'vitest'

import { writeSummaryLogRowStates } from './write-summary-log-row-states.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { WASTE_BALANCE_OUTCOME } from '#waste-balances/domain/waste-balance-classification.js'

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

const overseasSites = /** @type {any} */ (new Map())

const registeredOnlyLedgerId = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: null
}

describe('writeSummaryLogRowStates', () => {
  let summaryLogRowStateRepository

  beforeEach(() => {
    summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
  })

  it('writes nothing when the feature flag is off', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      featureFlags: createInMemoryFeatureFlags({ summaryLogRowStates: false }),
      wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    expect(
      await summaryLogRowStateRepository.findBySummaryLogId('log-A')
    ).toHaveLength(0)
  })

  it('writes nothing when no feature flags are provided', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      featureFlags: undefined,
      wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    expect(
      await summaryLogRowStateRepository.findBySummaryLogId('log-A')
    ).toHaveLength(0)
  })

  it('tolerates an absent repository when the feature flag is off', async () => {
    await expect(
      writeSummaryLogRowStates({
        summaryLogRowStateRepository: /** @type {any} */ (undefined),
        featureFlags: createInMemoryFeatureFlags({
          summaryLogRowStates: false
        }),
        wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
        accreditation: null,
        ledgerId: registeredOnlyLedgerId,
        overseasSites,
        summaryLogId: 'log-A'
      })
    ).resolves.toBeUndefined()
  })

  it('writes a row state per record under the registered-only ledger when the flag is on', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      featureFlags: createInMemoryFeatureFlags({ summaryLogRowStates: true }),
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
      await summaryLogRowStateRepository.findBySummaryLogId('log-A')
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
      featureFlags: createInMemoryFeatureFlags({ summaryLogRowStates: true }),
      wasteRecords: [buildReceivedRecord({ rowId: 1, tonnage: 1.005 })],
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const [committed] =
      await summaryLogRowStateRepository.findBySummaryLogId('log-A')
    expect(committed.data.TONNAGE_RECEIVED_FOR_RECYCLING).toBe(1.01)
  })

  it('stores weight quantities coerced to two decimal places', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      featureFlags: createInMemoryFeatureFlags({ summaryLogRowStates: true }),
      wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 7.536 })],
      accreditation: null,
      ledgerId: registeredOnlyLedgerId,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const [committed] =
      await summaryLogRowStateRepository.findBySummaryLogId('log-A')
    expect(committed.data.NET_WEIGHT).toBe(7.54)
  })

  it('stores tonnages so round-each-then-sum no longer drifts from sum-then-round', async () => {
    await writeSummaryLogRowStates({
      summaryLogRowStateRepository,
      featureFlags: createInMemoryFeatureFlags({ summaryLogRowStates: true }),
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
      await summaryLogRowStateRepository.findBySummaryLogId('log-A')
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
      featureFlags: createInMemoryFeatureFlags({ summaryLogRowStates: true }),
      wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
      accreditation: {
        id: 'acc-1',
        validFrom: '2023-01-01',
        validTo: '2030-12-31'
      },
      ledgerId: {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      },
      overseasSites,
      summaryLogId: 'log-A'
    })

    const [committed] =
      await summaryLogRowStateRepository.findBySummaryLogId('log-A')
    expect(committed.accreditationId).toBe('acc-1')
  })

  it('is idempotent — re-running the same submission adds no duplicate', async () => {
    const submit = () =>
      writeSummaryLogRowStates({
        summaryLogRowStateRepository,
        featureFlags: createInMemoryFeatureFlags({ summaryLogRowStates: true }),
        wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
        accreditation: null,
        ledgerId: registeredOnlyLedgerId,
        overseasSites,
        summaryLogId: 'log-A'
      })

    await submit()
    await submit()

    const committed =
      await summaryLogRowStateRepository.findBySummaryLogId('log-A')
    expect(committed).toHaveLength(1)
    expect(committed[0].summaryLogIds).toEqual(['log-A'])
  })
})
