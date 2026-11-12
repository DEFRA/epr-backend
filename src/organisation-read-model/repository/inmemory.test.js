import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { createInMemoryOrganisationReadRepository } from './inmemory.js'
import {
  buildReadAccreditation,
  buildReadOrganisation,
  buildReadReprocessorRegistration,
  nextReadOrganisationNumber
} from './read-model-test-data.js'

/** @import { Organisation } from '#organisation-read-model/domain/model.js' */

/** @param {Organisation[]} organisations */
const repositoryOf = (organisations) =>
  createInMemoryOrganisationReadRepository(organisations)()

/** @param {string} name */
const named = (name) => buildReadOrganisation({ name })

describe('in-memory organisation read repository', () => {
  describe('findByOrganisationNumber', () => {
    it('returns null for an unknown organisation number', async () => {
      const repository = repositoryOf([buildReadOrganisation()])

      expect(
        await repository.findByOrganisationNumber(nextReadOrganisationNumber())
      ).toBeNull()
    })

    it('returns the organisation it holds with that number', async () => {
      const held = buildReadOrganisation({
        registrations: {
          R26ER5001180041PL: buildReadReprocessorRegistration()
        }
      })
      const repository = repositoryOf([buildReadOrganisation(), held])

      expect(
        await repository.findByOrganisationNumber(held.organisationNumber)
      ).toStrictEqual(held)
    })

    it('returns a copy, so changing it changes nothing held', async () => {
      const held = buildReadOrganisation()
      const repository = repositoryOf([held])

      const first = /** @type {Organisation} */ (
        await repository.findByOrganisationNumber(held.organisationNumber)
      )
      first.name = 'Changed'

      expect(
        await repository.findByOrganisationNumber(held.organisationNumber)
      ).toHaveProperty('name', 'ACME ltd')
    })

    it('is not changed by changes to the organisations it was given', async () => {
      const held = buildReadOrganisation()
      const repository = repositoryOf([held])

      held.name = 'Changed'

      expect(
        await repository.findByOrganisationNumber(held.organisationNumber)
      ).toHaveProperty('name', 'ACME ltd')
    })
  })

  describe('findByOrganisationNumber for a year', () => {
    it('serves the organisation as it holds it, which is already as it stood in that year', async () => {
      const held = buildReadOrganisation({
        registrations: {
          R26ER5001180041PL: buildReadReprocessorRegistration({
            accreditations: { 2026: buildReadAccreditation() }
          })
        }
      })
      const repository = repositoryOf([held])

      expect(
        await repository.findByOrganisationNumber(held.organisationNumber, {
          year: toYear(2027)
        })
      ).toStrictEqual(held)
    })
  })

  describe('find', () => {
    it('returns the organisations matching the search a page at a time, sorted by name', async () => {
      const repository = repositoryOf([
        named('Zeta Recycling'),
        named('Acme Recycling'),
        named('Beta Recycling'),
        named('Unrelated Ltd')
      ])

      const page = await repository.find({
        search: 'recycling',
        page: 1,
        pageSize: 2
      })

      expect(page).toMatchObject({
        page: 1,
        pageSize: 2,
        totalItems: 3,
        totalPages: 2
      })
      expect(page.items.map(({ name }) => name)).toEqual([
        'Acme Recycling',
        'Beta Recycling'
      ])
    })

    it('finds an organisation by its organisation number', async () => {
      const wanted = named('Beta Recycling')
      const repository = repositoryOf([named('Acme Recycling'), wanted])

      const { items } = await repository.find({
        organisationNumber: wanted.organisationNumber,
        page: 1,
        pageSize: 10
      })

      expect(items).toStrictEqual([wanted])
    })

    it('finds an organisation by the whole of one of its registration numbers, ignoring case', async () => {
      const repository = repositoryOf([
        named('Acme Recycling'),
        buildReadOrganisation({
          name: 'Beta Recycling',
          registrations: {
            R26ER777PL: buildReadReprocessorRegistration()
          }
        })
      ])

      const whole = await repository.find({
        registrationNumber: 'r26er777pl',
        page: 1,
        pageSize: 10
      })
      const part = await repository.find({
        registrationNumber: 'R26ER777',
        page: 1,
        pageSize: 10
      })

      expect(whole.items.map(({ name }) => name)).toEqual(['Beta Recycling'])
      expect(part.items).toEqual([])
    })

    it('finds an organisation by the whole of one of its accreditation numbers, ignoring case', async () => {
      const repository = repositoryOf([
        named('Acme Recycling'),
        buildReadOrganisation({
          name: 'Beta Recycling',
          registrations: {
            R26ER5001180041PL: buildReadReprocessorRegistration({
              accreditations: {
                2026: buildReadAccreditation({
                  accreditationNumber: toAccreditationNumber('A26ER5001180114PL')
                })
              }
            })
          }
        })
      ])

      const { items } = await repository.find({
        accreditationNumber: 'a26er5001180114pl',
        page: 1,
        pageSize: 10
      })

      expect(items.map(({ name }) => name)).toEqual(['Beta Recycling'])
    })
  })

  describe('findAll', () => {
    it('returns every organisation it holds', async () => {
      const held = [named('Zeta Recycling'), named('Acme Recycling')]
      const repository = repositoryOf(held)

      expect(await repository.findAll()).toStrictEqual(held)
    })
  })
})
