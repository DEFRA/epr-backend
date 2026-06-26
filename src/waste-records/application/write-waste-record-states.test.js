import { describe, it, expect, beforeEach } from 'vitest'

import { writeWasteRecordStates } from './write-waste-record-states.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryFeatureFlags } from '#feature-flags/feature-flags.inmemory.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

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

const nullPartition = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: null
}

describe('writeWasteRecordStates', () => {
  let rowStateRepository

  beforeEach(() => {
    rowStateRepository = createInMemoryRowStateRepository()()
  })

  it('writes nothing when the feature flag is off', async () => {
    await writeWasteRecordStates({
      rowStateRepository,
      featureFlags: createInMemoryFeatureFlags({ wasteRecordStates: false }),
      wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
      accreditation: null,
      partition: nullPartition,
      overseasSites,
      summaryLogId: 'log-A'
    })

    expect(await rowStateRepository.findBySummaryLogId('log-A')).toHaveLength(0)
  })

  it('writes nothing when no feature flags are provided', async () => {
    await writeWasteRecordStates({
      rowStateRepository,
      featureFlags: undefined,
      wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
      accreditation: null,
      partition: nullPartition,
      overseasSites,
      summaryLogId: 'log-A'
    })

    expect(await rowStateRepository.findBySummaryLogId('log-A')).toHaveLength(0)
  })

  it('tolerates an absent repository when the feature flag is off', async () => {
    await expect(
      writeWasteRecordStates({
        rowStateRepository: /** @type {any} */ (undefined),
        featureFlags: createInMemoryFeatureFlags({ wasteRecordStates: false }),
        wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
        accreditation: null,
        partition: nullPartition,
        overseasSites,
        summaryLogId: 'log-A'
      })
    ).resolves.toBeUndefined()
  })

  it('writes a row state per record under the null partition when the flag is on', async () => {
    await writeWasteRecordStates({
      rowStateRepository,
      featureFlags: createInMemoryFeatureFlags({ wasteRecordStates: true }),
      wasteRecords: [
        buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 }),
        buildRegisteredOnlyRecord({ rowId: 2, tonnage: 20 })
      ],
      accreditation: null,
      partition: nullPartition,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const committed = await rowStateRepository.findBySummaryLogId('log-A')
    expect(committed.map((doc) => doc.rowId).sort()).toEqual(['1', '2'])
    expect(committed.find((doc) => doc.rowId === '1')).toMatchObject({
      organisationId: 'org-1',
      registrationId: 'reg-1',
      accreditationId: null,
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      classification: {
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [],
        transactionAmount: 0
      },
      summaryLogIds: ['log-A']
    })
  })

  it('stores report-facing tonnages coerced to two decimal places', async () => {
    await writeWasteRecordStates({
      rowStateRepository,
      featureFlags: createInMemoryFeatureFlags({ wasteRecordStates: true }),
      wasteRecords: [buildReceivedRecord({ rowId: 1, tonnage: 1.005 })],
      accreditation: null,
      partition: nullPartition,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const [committed] = await rowStateRepository.findBySummaryLogId('log-A')
    expect(committed.data.TONNAGE_RECEIVED_FOR_RECYCLING).toBe(1.01)
  })

  it('stores tonnages so round-each-then-sum no longer drifts from sum-then-round', async () => {
    await writeWasteRecordStates({
      rowStateRepository,
      featureFlags: createInMemoryFeatureFlags({ wasteRecordStates: true }),
      wasteRecords: [
        buildReceivedRecord({ rowId: 1, tonnage: 1.005 }),
        buildReceivedRecord({ rowId: 2, tonnage: 1.005 }),
        buildReceivedRecord({ rowId: 3, tonnage: 1.005 })
      ],
      accreditation: null,
      partition: nullPartition,
      overseasSites,
      summaryLogId: 'log-A'
    })

    const committed = await rowStateRepository.findBySummaryLogId('log-A')
    const storedTonnages = committed.map(
      (doc) => doc.data.TONNAGE_RECEIVED_FOR_RECYCLING
    )
    // Stored per-row values are already 2dp, so summing them yields the
    // round-each-then-sum total (3.03) however a consumer adds them — the
    // sum-then-round residual (3.015 → 3.02) can no longer arise.
    expect(storedTonnages).toEqual([1.01, 1.01, 1.01])
    expect(storedTonnages.reduce((sum, t) => sum + t, 0)).toBeCloseTo(3.03, 10)
  })

  it('carries the supplied accreditation id onto the partition', async () => {
    await writeWasteRecordStates({
      rowStateRepository,
      featureFlags: createInMemoryFeatureFlags({ wasteRecordStates: true }),
      wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
      accreditation: {
        id: 'acc-1',
        validFrom: '2023-01-01',
        validTo: '2030-12-31'
      },
      partition: {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        accreditationId: 'acc-1'
      },
      overseasSites,
      summaryLogId: 'log-A'
    })

    const [committed] = await rowStateRepository.findBySummaryLogId('log-A')
    expect(committed.accreditationId).toBe('acc-1')
  })

  it('is idempotent — re-running the same submission adds no duplicate', async () => {
    const submit = () =>
      writeWasteRecordStates({
        rowStateRepository,
        featureFlags: createInMemoryFeatureFlags({ wasteRecordStates: true }),
        wasteRecords: [buildRegisteredOnlyRecord({ rowId: 1, tonnage: 10 })],
        accreditation: null,
        partition: nullPartition,
        overseasSites,
        summaryLogId: 'log-A'
      })

    await submit()
    await submit()

    const committed = await rowStateRepository.findBySummaryLogId('log-A')
    expect(committed).toHaveLength(1)
    expect(committed[0].summaryLogIds).toEqual(['log-A'])
  })
})
