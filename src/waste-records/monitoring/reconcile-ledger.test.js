import { describe, it, expect } from 'vitest'

import { ORS_VALIDATION_DISABLED } from '#domain/summary-logs/table-schemas/shared/classification-reason.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemorySummaryLogRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import {
  buildSummaryLogRowStateEntry,
  DEFAULT_LEDGER_ID
} from '#waste-records/repository/test-data.js'
import { buildLedgerEvent } from '#waste-balances/repository/ledger-test-data.js'

import { reconcileLedger } from './reconcile-ledger.js'

const { organisationId, registrationId, accreditationId } = DEFAULT_LEDGER_ID

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
  reconcileLedger({
    ...deps,
    organisationId,
    registrationId,
    accreditationId,
    accreditation: null,
    overseasSites: ORS_VALIDATION_DISABLED
  })

describe('reconcileLedger', () => {
  it('reports a ledger with no committed submission as uncovered and clean', async () => {
    const result = await reconcile({
      ledgerRepository: createInMemoryLedgerRepository()(),
      summaryLogRowStateRepository:
        createInMemorySummaryLogRowStateRepository()(),
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

  it('reads both collections and flags a committed row missing from the waste record states', async () => {
    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      DEFAULT_LEDGER_ID,
      [
        buildSummaryLogRowStateEntry({
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

    const ledgerRepository = createInMemoryLedgerRepository([
      buildLedgerEvent({ payload: { summaryLogId: 'log-1', creditTotal: 10 } })
    ])()

    const wasteRecordsRepository = createInMemoryWasteRecordsRepository([
      legacyRecord('row-1', 'log-1'),
      legacyRecord('row-2', 'log-1')
    ])()

    const result = await reconcile({
      ledgerRepository,
      summaryLogRowStateRepository,
      wasteRecordsRepository
    })

    expect(result).toMatchObject({
      head: 'log-1',
      hasCommittedSubmission: true,
      hasWasteRecordStateData: true,
      wasteRecordStateCount: 1,
      committedRowCount: 2,
      creditTotal: { wasteRecordStates: 10, event: 10, drift: 0 },
      missingRows: [
        { rowId: 'row-2', wasteRecordType: WASTE_RECORD_TYPE.RECEIVED }
      ],
      isClean: false
    })
  })

  it('reconciles a row committed at an earlier submission and restated unchanged at the head', async () => {
    const summaryLogRowStateRepository =
      createInMemorySummaryLogRowStateRepository()()
    await summaryLogRowStateRepository.upsertSummaryLogRowStates(
      DEFAULT_LEDGER_ID,
      [
        buildSummaryLogRowStateEntry({
          rowId: 'row-1',
          classification: {
            outcome: 'INCLUDED',
            reasons: [],
            transactionAmount: 10
          }
        })
      ],
      'log-2'
    )

    const ledgerRepository = createInMemoryLedgerRepository([
      buildLedgerEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 10 }
      }),
      buildLedgerEvent({
        number: 2,
        payload: { summaryLogId: 'log-2', creditTotal: 10 }
      })
    ])()

    const wasteRecordsRepository = createInMemoryWasteRecordsRepository([
      legacyRecord('row-1', 'log-1')
    ])()

    const result = await reconcile({
      ledgerRepository,
      summaryLogRowStateRepository,
      wasteRecordsRepository
    })

    expect(result).toMatchObject({
      head: 'log-2',
      committedRowCount: 1,
      missingRows: [],
      extraRows: [],
      creditTotal: { wasteRecordStates: 10, event: 10, drift: 0 },
      isClean: true
    })
  })
})
