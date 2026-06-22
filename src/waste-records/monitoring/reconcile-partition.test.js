import { describe, it, expect } from 'vitest'

import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import {
  buildRowStateEntry,
  DEFAULT_PARTITION
} from '#waste-records/repository/test-data.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'

import { reconcilePartition } from './reconcile-partition.js'

const { organisationId, registrationId, accreditationId } = DEFAULT_PARTITION

const legacyRecord = (rowId, head) => ({
  organisationId,
  registrationId,
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: { ROW_ID: rowId },
  excludedFromWasteBalance: true,
  versions: [{ summaryLog: { id: head } }]
})

const reconcile = (deps) =>
  reconcilePartition({
    ...deps,
    organisationId,
    registrationId,
    accreditationId,
    accreditation: null,
    overseasSites: ORS_VALIDATION_DISABLED
  })

describe('reconcilePartition', () => {
  it('reports a partition with no committed submission as uncovered and clean', async () => {
    const result = await reconcile({
      streamRepository: createInMemoryStreamRepository()(),
      rowStateRepository: createInMemoryRowStateRepository()(),
      wasteRecordsRepository: createInMemoryWasteRecordsRepository()()
    })

    expect(result).toMatchObject({
      registrationId,
      accreditationId,
      head: null,
      hasCommittedSubmission: false,
      isClean: true
    })
  })

  it('reads both collections and flags a committed row missing from the row-states', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [
        buildRowStateEntry({
          rowId: 'row-1',
          classification: {
            outcome: 'INCLUDED',
            reasons: [],
            transactionAmount: 10
          }
        })
      ],
      'log-1'
    )

    const streamRepository = createInMemoryStreamRepository([
      buildStreamEvent({ payload: { summaryLogId: 'log-1', creditTotal: 10 } })
    ])()

    const wasteRecordsRepository = createInMemoryWasteRecordsRepository([
      legacyRecord('row-1', 'log-1'),
      legacyRecord('row-2', 'log-1')
    ])()

    const result = await reconcile({
      streamRepository,
      rowStateRepository,
      wasteRecordsRepository
    })

    expect(result).toMatchObject({
      head: 'log-1',
      hasCommittedSubmission: true,
      hasRowStateData: true,
      rowStateCount: 1,
      committedRowCount: 2,
      creditTotal: { rowStates: 10, event: 10, drift: 0 },
      missingRows: [
        { rowId: 'row-2', wasteRecordType: WASTE_RECORD_TYPE.RECEIVED }
      ],
      isClean: false
    })
  })
})
