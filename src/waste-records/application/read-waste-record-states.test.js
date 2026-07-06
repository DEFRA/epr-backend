import { describe, it, expect } from 'vitest'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import {
  buildRowStateEntry,
  DEFAULT_PARTITION
} from '#waste-records/repository/test-data.js'
import { buildStreamEvent } from '#waste-balances/repository/ledger-test-data.js'
import { wasteRecordStatesForRegistration } from './read-waste-record-states.js'

const submissionEvent = (number, summaryLogId) =>
  buildStreamEvent({
    number,
    payload: { summaryLogId, creditTotal: number * 10 }
  })

const registration = {
  organisationId: DEFAULT_PARTITION.organisationId,
  registrationId: DEFAULT_PARTITION.registrationId,
  accreditationId: DEFAULT_PARTITION.accreditationId
}

describe('wasteRecordStatesForRegistration', () => {
  it('returns an empty array when the stream has no submission', async () => {
    const states = await wasteRecordStatesForRegistration({
      ledgerRepository: createInMemoryLedgerRepository()(),
      rowStateRepository: createInMemoryRowStateRepository()(),
      ...registration
    })

    expect(states).toEqual([])
  })

  it('returns the full committed snapshot at the head submission', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [
        buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } }),
        buildRowStateEntry({ rowId: 'row-2', data: { tonnage: 20 } })
      ],
      'log-1'
    )
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [
        buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 99 } }),
        buildRowStateEntry({ rowId: 'row-2', data: { tonnage: 20 } })
      ],
      'log-2'
    )

    const ledgerRepository = createInMemoryLedgerRepository([
      submissionEvent(1, 'log-1'),
      submissionEvent(2, 'log-2')
    ])()

    const states = await wasteRecordStatesForRegistration({
      ledgerRepository,
      rowStateRepository,
      ...registration
    })

    const dataByRowId = Object.fromEntries(
      states.map((state) => [state.rowId, state.data])
    )
    expect(dataByRowId).toEqual({
      'row-1': { tonnage: 99 },
      'row-2': { tonnage: 20 }
    })
  })

  it('projects to domain content, dropping storage id, membership and partition', async () => {
    const rowStateRepository = createInMemoryRowStateRepository()()
    await rowStateRepository.upsertRowStates(
      DEFAULT_PARTITION,
      [buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } })],
      'log-1'
    )
    const ledgerRepository = createInMemoryLedgerRepository([
      submissionEvent(1, 'log-1')
    ])()

    const [state] = await wasteRecordStatesForRegistration({
      ledgerRepository,
      rowStateRepository,
      ...registration
    })

    expect(state).toEqual({
      rowId: 'row-1',
      wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
      data: { tonnage: 10 },
      classification: {
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 10
      }
    })
  })
})
