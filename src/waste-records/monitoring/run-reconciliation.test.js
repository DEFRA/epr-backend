import { describe, it, expect, vi } from 'vitest'

import { REG_ACC_STATUS } from '#domain/organisations/model.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { createInMemoryRowStateRepository } from '#waste-records/repository/inmemory.js'
import { createInMemoryStreamRepository } from '#waste-balances/repository/stream-inmemory.js'
import { createInMemoryWasteRecordsRepository } from '#repositories/waste-records/inmemory.js'
import { buildRowStateEntry } from '#waste-records/repository/test-data.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'

import { runReconciliation } from './run-reconciliation.js'

const orgsRepository = (orgs) => ({ findAll: async () => orgs })
const sitesRepository = (sites) => ({ findAll: async () => sites })

const committedRecord = (organisationId, registrationId, rowId, head) => ({
  organisationId,
  registrationId,
  rowId,
  type: WASTE_RECORD_TYPE.RECEIVED,
  data: { ROW_ID: rowId },
  excludedFromWasteBalance: true,
  versions: [{ summaryLog: { id: head } }]
})

describe('runReconciliation', () => {
  it('walks every registration of every organisation and summarises the estate', async () => {
    const org = {
      id: 'org-1',
      registrations: [
        { id: 'reg-acc', accreditationId: 'acc-1', overseasSites: {} },
        { id: 'reg-only', overseasSites: {} }
      ],
      accreditations: [{ id: 'acc-1', status: REG_ACC_STATUS.APPROVED }]
    }

    const orgWithoutRegistrations = { id: 'org-empty' }

    const wasteRecordStateRepository = createInMemoryRowStateRepository()()
    await wasteRecordStateRepository.upsertRowStates(
      {
        organisationId: 'org-1',
        registrationId: 'reg-acc',
        accreditationId: 'acc-1'
      },
      [buildRowStateEntry({ rowId: 'row-1' })],
      'log-acc'
    )

    const streamRepository = createInMemoryStreamRepository([
      buildStreamEvent({
        registrationId: 'reg-acc',
        accreditationId: 'acc-1',
        payload: { summaryLogId: 'log-acc', creditTotal: 10 }
      }),
      buildStreamEvent({
        registrationId: 'reg-only',
        accreditationId: null,
        payload: { summaryLogId: 'log-only', creditTotal: 0 }
      })
    ])()

    const wasteRecordsRepository = createInMemoryWasteRecordsRepository([
      committedRecord('org-1', 'reg-acc', 'row-1', 'log-acc')
    ])()

    const { reconciliations, census } = await runReconciliation({
      organisationsRepository: orgsRepository([org, orgWithoutRegistrations]),
      streamRepository,
      wasteRecordStateSource: async () => wasteRecordStateRepository,
      wasteRecordsRepository,
      overseasSitesRepository: sitesRepository([
        { id: 'site-1', validFrom: new Date('2026-01-01') }
      ])
    })

    expect(reconciliations).toHaveLength(2)
    expect(census).toMatchObject({
      totalPartitions: 2,
      partitionsWithCommittedSubmission: 2,
      partitionsCovered: 1,
      partitionsMissingWasteRecordStateData: 1,
      isEstateClean: false
    })
  })

  it('resolves the waste record state source once per registration partition, in walk order', async () => {
    const org = {
      id: 'org-1',
      registrations: [
        { id: 'reg-a', accreditationId: 'acc-1', overseasSites: {} },
        { id: 'reg-b', overseasSites: {} }
      ],
      accreditations: [{ id: 'acc-1', status: REG_ACC_STATUS.APPROVED }]
    }

    const registrationsSeen = []
    const wasteRecordStateSource = vi.fn(async ({ registration }) => {
      registrationsSeen.push(registration.id)
      return createInMemoryRowStateRepository()()
    })

    await runReconciliation({
      organisationsRepository: orgsRepository([org]),
      streamRepository: createInMemoryStreamRepository()(),
      wasteRecordStateSource,
      wasteRecordsRepository: createInMemoryWasteRecordsRepository()(),
      overseasSitesRepository: sitesRepository([])
    })

    expect(wasteRecordStateSource).toHaveBeenCalledTimes(2)
    expect(registrationsSeen).toEqual(['reg-a', 'reg-b'])
  })
})
