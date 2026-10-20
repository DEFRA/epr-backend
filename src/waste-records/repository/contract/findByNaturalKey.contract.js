import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect } from 'vitest'

import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { buildSummaryLogRowStateEntry } from '../test-data.js'

/**
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { SummaryLogRowStatesRepository, SummaryLogRowStatesRepositoryFactory } from '../port.js'
 *
 * @typedef {{
 *   summaryLogRowStatesRepository: SummaryLogRowStatesRepositoryFactory,
 *   organisationsRepository: OrganisationsRepository
 * }} NaturalKeyFixtures
 */

/** @param {string} prefix */
const uniqueNumber = (prefix) =>
  `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`

/**
 * Stores an organisation holding one registration with a current and a
 * previous accreditation, and returns its numbers and stored ids.
 *
 * @param {OrganisationsRepository} organisationsRepository
 */
const storeRegistration = async (organisationsRepository) => {
  const current = buildAccreditation({
    accreditationNumber: uniqueNumber('ACC')
  })
  const previous = buildAccreditation({
    accreditationNumber: uniqueNumber('ACC')
  })
  const registration = buildRegistration({
    registrationNumber: uniqueNumber('REG'),
    accreditationId: current.id
  })
  const organisation = buildOrganisation({
    registrations: [registration],
    accreditations: [current, previous]
  })
  await organisationsRepository.insert(organisation)

  const ids = {
    organisationId: organisation.id,
    registrationId: registration.id
  }
  return {
    key: {
      organisationNumber: String(organisation.orgId),
      registrationNumber: registration.registrationNumber
    },
    unknownOrganisationNumber: String(organisation.orgId + 1),
    ledgers: {
      current: { ...ids, accreditationId: current.id },
      previous: { ...ids, accreditationId: previous.id },
      registeredOnly: { ...ids, accreditationId: null }
    },
    current,
    previous
  }
}

const STORED_IDS = ['id', 'organisationId', 'registrationId', 'accreditationId']

/** @param {object} found */
const storedIdsIn = (found) => STORED_IDS.filter((key) => key in found)

/** @param {import('vitest').TestAPI<NaturalKeyFixtures>} it */
export const testFindByNaturalKeyBehaviour = (it) => {
  describe('finding by natural key', () => {
    /** @type {SummaryLogRowStatesRepository} */
    let repository
    /** @type {Awaited<ReturnType<typeof storeRegistration>>} */
    let stored

    beforeEach(
      async (
        /** @type {NaturalKeyFixtures} */ {
          summaryLogRowStatesRepository,
          organisationsRepository
        }
      ) => {
        repository = summaryLogRowStatesRepository()
        stored = await storeRegistration(organisationsRepository)
      }
    )

    /**
     * @param {keyof typeof stored.ledgers} ledger
     * @param {string} rowId
     * @param {string} summaryLogId
     */
    const commit = (ledger, rowId, summaryLogId) =>
      repository.upsertSummaryLogRowStates(
        stored.ledgers[ledger],
        [buildSummaryLogRowStateEntry({ rowId })],
        summaryLogId
      )

    describe('findWasteRecordStates', () => {
      it('returns an empty list when no organisation has the number', async () => {
        await commit('current', 'row-1', 'log-1')

        const states = await repository.findWasteRecordStates(
          {
            ...stored.key,
            organisationNumber: stored.unknownOrganisationNumber,
            accreditationNumber: stored.current.accreditationNumber
          },
          'log-1'
        )

        expect(states).toEqual([])
      })

      it('returns an empty list when the organisation holds no registration with the number', async () => {
        await commit('current', 'row-1', 'log-1')

        const states = await repository.findWasteRecordStates(
          {
            ...stored.key,
            registrationNumber: uniqueNumber('REG'),
            accreditationNumber: stored.current.accreditationNumber
          },
          'log-1'
        )

        expect(states).toEqual([])
      })

      it('returns an empty list when the organisation holds no accreditation with the number', async () => {
        await commit('current', 'row-1', 'log-1')

        const states = await repository.findWasteRecordStates(
          { ...stored.key, accreditationNumber: uniqueNumber('ACC') },
          'log-1'
        )

        expect(states).toEqual([])
      })

      it('returns the waste record states the ledger finds by its stored ids', async () => {
        await commit('current', 'row-1', 'log-1')
        await commit('current', 'row-2', 'log-1')

        const states = await repository.findWasteRecordStates(
          {
            ...stored.key,
            accreditationNumber: stored.current.accreditationNumber
          },
          'log-1'
        )

        expect(states).toEqual(
          await repository.findWasteRecordStatesForSummaryLog(
            stored.ledgers.current,
            'log-1'
          )
        )
        expect(states.map((state) => state.rowId).sort()).toEqual([
          'row-1',
          'row-2'
        ])
      })

      it('finds only the accreditation the key names', async () => {
        await commit('current', 'row-current', 'log-1')
        await commit('previous', 'row-previous', 'log-1')

        const states = await repository.findWasteRecordStates(
          {
            ...stored.key,
            accreditationNumber: stored.previous.accreditationNumber
          },
          'log-1'
        )

        expect(states.map((state) => state.rowId)).toEqual(['row-previous'])
      })

      it('finds only registered-only rows when the accreditation number is null', async () => {
        await commit('current', 'row-current', 'log-1')
        await commit('registeredOnly', 'row-registered', 'log-1')

        const states = await repository.findWasteRecordStates(
          { ...stored.key, accreditationNumber: null },
          'log-1'
        )

        expect(states.map((state) => state.rowId)).toEqual(['row-registered'])
      })
    })

    describe('findRowStatesForFile', () => {
      it('returns an empty list when no organisation has the number', async () => {
        await commit('current', 'row-1', 'file-1')

        const rowStates = await repository.findRowStatesForFile(
          {
            ...stored.key,
            organisationNumber: stored.unknownOrganisationNumber
          },
          'file-1'
        )

        expect(rowStates).toEqual([])
      })

      it('returns an empty list when the organisation holds no registration with the number', async () => {
        await commit('current', 'row-1', 'file-1')

        const rowStates = await repository.findRowStatesForFile(
          { ...stored.key, registrationNumber: uniqueNumber('REG') },
          'file-1'
        )

        expect(rowStates).toEqual([])
      })

      it('returns each row of the file, named by its numbers in place of its ids', async () => {
        await commit('current', 'row-1', 'file-1')

        const [rowState] = await repository.findRowStatesForFile(
          stored.key,
          'file-1'
        )

        expect(rowState).toEqual({
          ...buildSummaryLogRowStateEntry({ rowId: 'row-1' }),
          organisationNumber: stored.key.organisationNumber,
          registrationNumber: stored.key.registrationNumber,
          accreditationNumber: stored.current.accreditationNumber
        })
        expect(storedIdsIn(rowState)).toEqual([])
      })

      it('returns the rows of every accreditation, each with the number it was committed under', async () => {
        await commit('current', 'row-current', 'file-1')
        await commit('previous', 'row-previous', 'file-1')
        await commit('registeredOnly', 'row-registered', 'file-1')

        const rowStates = await repository.findRowStatesForFile(
          stored.key,
          'file-1'
        )

        expect(
          Object.fromEntries(
            rowStates.map(({ rowId, accreditationNumber }) => [
              rowId,
              accreditationNumber
            ])
          )
        ).toEqual({
          'row-current': stored.current.accreditationNumber,
          'row-previous': stored.previous.accreditationNumber,
          'row-registered': null
        })
      })

      it('returns only the rows of the file asked for', async () => {
        await commit('current', 'row-1', 'file-1')
        await commit('current', 'row-2', 'file-2')

        const rowStates = await repository.findRowStatesForFile(
          stored.key,
          'file-2'
        )

        expect(rowStates.map((rowState) => rowState.rowId)).toEqual(['row-2'])
      })
    })
  })
}
