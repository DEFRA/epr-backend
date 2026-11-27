import { describe, expect } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { buildExternalAccreditation } from '#organisation-read-model/domain/test-data.js'

/** @import { TestAPI } from 'vitest' */
/** @import { ExternalAccreditationsRepository } from './port.js' */

/**
 * `held` reads every accreditation the repository holds, ordered by
 * registration number and then year.
 *
 * @typedef {TestAPI<{
 *   externalAccreditationsRepository: ExternalAccreditationsRepository
 *   held: () => Promise<object[]>
 * }>} ExternalAccreditationsRepositoryContractIt
 */

const { registrationNumber, year, accreditationNumber } =
  buildExternalAccreditation()
const nextYear = toYear(year + 1)

/**
 * What every external accreditations repository does, whatever it stores in.
 *
 * @param {ExternalAccreditationsRepositoryContractIt} it
 */
export const testExternalAccreditationsRepositoryContract = (it) => {
  describe('external accreditations repository contract', () => {
    describe('upsert', () => {
      it('returns the stored accreditation', async ({
        externalAccreditationsRepository
      }) => {
        const accreditation = buildExternalAccreditation()

        const stored =
          await externalAccreditationsRepository.upsert(accreditation)

        expect(stored).toStrictEqual(accreditation)
      })

      it('replaces the accreditation the organisation holds for the same registration and year', async ({
        externalAccreditationsRepository,
        held
      }) => {
        await externalAccreditationsRepository.upsert(
          buildExternalAccreditation()
        )
        const replacement = buildExternalAccreditation({
          accreditationNumber: toAccreditationNumber('A27ER5000560000XX')
        })

        await externalAccreditationsRepository.upsert(replacement)

        expect(await held()).toStrictEqual([replacement])
      })

      it('keeps the accreditation another organisation holds for the same registration and year', async ({
        externalAccreditationsRepository,
        held
      }) => {
        const ours = buildExternalAccreditation()
        const theirs = buildExternalAccreditation({
          organisationNumber: toOrganisationNumber('999999')
        })

        await externalAccreditationsRepository.upsert(ours)
        await externalAccreditationsRepository.upsert(theirs)

        expect(await held()).toHaveLength(2)
        expect(await held()).toEqual(expect.arrayContaining([ours, theirs]))
      })

      it('keeps the accreditations held for other years', async ({
        externalAccreditationsRepository,
        held
      }) => {
        const thisYear = buildExternalAccreditation()
        const followingYear = buildExternalAccreditation({ year: nextYear })

        await externalAccreditationsRepository.upsert(thisYear)
        await externalAccreditationsRepository.upsert(followingYear)

        expect(await held()).toStrictEqual([thisYear, followingYear])
      })

      it('holds the registration number trimmed and upper-cased, as organisations hold it', async ({
        externalAccreditationsRepository,
        held
      }) => {
        await externalAccreditationsRepository.upsert(
          buildExternalAccreditation({
            registrationNumber: toRegistrationNumber(
              ` ${registrationNumber.toLowerCase()} `
            )
          })
        )

        expect(await held()).toStrictEqual([buildExternalAccreditation()])
      })

      it('holds the accreditation number trimmed and upper-cased, as organisations hold it', async ({
        externalAccreditationsRepository,
        held
      }) => {
        await externalAccreditationsRepository.upsert(
          buildExternalAccreditation({
            accreditationNumber: toAccreditationNumber(
              ` ${accreditationNumber.toLowerCase()} `
            )
          })
        )

        expect(await held()).toStrictEqual([buildExternalAccreditation()])
      })
    })

    describe('validation', () => {
      it.for([
        {
          description: 'a year the service holds no data for',
          accreditation: buildExternalAccreditation({ year: toYear(2023) })
        },
        {
          description: 'no organisation number',
          accreditation: buildExternalAccreditation({
            organisationNumber: /** @type {any} */ (undefined)
          })
        },
        {
          description: 'no accreditation number',
          accreditation: buildExternalAccreditation({
            accreditationNumber: toAccreditationNumber('')
          })
        },
        {
          description: 'an unknown status in its timeline',
          accreditation: buildExternalAccreditation({
            status: {
              current: 'approved',
              lastUpdatedAt: '2026-12-14T10:31:00.000Z',
              timeline: [
                {
                  status: /** @type {any} */ ('banana'),
                  at: '2027-01-01T00:00:00.000Z'
                }
              ]
            }
          })
        },
        {
          description: 'a status in its timeline the read model does not show',
          accreditation: buildExternalAccreditation({
            status: {
              current: 'approved',
              lastUpdatedAt: '2026-12-14T10:31:00.000Z',
              timeline: [
                {
                  status: /** @type {any} */ ('created'),
                  at: '2027-01-01T00:00:00.000Z'
                }
              ]
            }
          })
        },
        {
          description: 'no date its last change was recorded',
          accreditation: buildExternalAccreditation({
            status: /** @type {any} */ ({
              current: 'approved',
              timeline: [{ status: 'approved', at: '2027-01-01T00:00:00.000Z' }]
            })
          })
        },
        {
          description:
            'a change in its timeline that carries when it was recorded',
          accreditation: buildExternalAccreditation({
            status: {
              current: 'approved',
              lastUpdatedAt: '2026-12-14T10:31:00.000Z',
              timeline: [
                /** @type {any} */ ({
                  status: 'approved',
                  at: '2027-01-01T00:00:00.000Z',
                  updatedAt: '2026-12-14T10:31:00.000Z'
                })
              ]
            }
          })
        },
        {
          description: 'an unknown status',
          accreditation: buildExternalAccreditation({
            status: {
              current: /** @type {any} */ ('pending'),
              lastUpdatedAt: '2026-12-14T10:31:00.000Z',
              timeline: []
            }
          })
        },
        {
          description: 'an unknown tonnage band',
          accreditation: buildExternalAccreditation({
            prnIssuance: { tonnageBand: /** @type {any} */ ('lots') }
          })
        },
        {
          description: 'overseas sites, which are lifted from the registration',
          accreditation: /** @type {any} */ ({
            ...buildExternalAccreditation(),
            overseasSites: { '001': { status: 'pending' } }
          })
        }
      ])(
        'refuses to store an accreditation with $description',
        async (
          { accreditation },
          { externalAccreditationsRepository, held }
        ) => {
          await expect(
            externalAccreditationsRepository.upsert(accreditation)
          ).rejects.toHaveProperty('output.statusCode', 422)

          expect(await held()).toStrictEqual([])
        }
      )
    })
  })
}
