import { onTestFinished } from 'vitest'
import { it } from '#vite/fixtures/organisation-read-mongo.js'

import { config } from '#root/config.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  findOrganisation,
  reprocessor
} from './contract/organisation-read-test-helpers.js'

const { buildOrganisation } = createOrganisationBuilders()

describe('status timeline', () => {
  /**
   * @param {object[]} statusHistory
   */
  const registrationWith = (statusHistory) => reprocessor({ statusHistory })

  /**
   * @param {object} overrides
   */
  const organisationAccredited = (overrides) => {
    const accredited = accreditation(overrides)
    return buildOrganisation({
      registrations: [reprocessor({ accreditationId: accredited.id })],
      accreditations: [accredited]
    })
  }

  it('keeps every status recorded on a day, each at its time', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = buildOrganisation({
      registrations: [
        registrationWith([
          { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
          { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
          { status: 'cancelled', updatedAt: '2026-03-01T09:00:00.000Z' },
          { status: 'approved', updatedAt: '2026-03-01T15:00:00.000Z' }
        ])
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(organisation.registrations[REPROCESSOR_NUMBER].status).toMatchObject(
      {
        lastUpdatedAt: '2026-03-01T15:00:00.000Z',
        timeline: [
          { status: 'approved', at: '2026-02-01T00:00:00.000Z' },
          { status: 'cancelled', at: '2026-03-01T09:00:00.000Z' },
          { status: 'approved', at: '2026-03-01T15:00:00.000Z' }
        ]
      }
    )
  })

  it('dates a registration’s approval at its validFrom and its other changes when they were recorded', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = buildOrganisation({
      registrations: [
        reprocessor({
          validFrom: '2026-02-01',
          statusHistory: [
            { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
            { status: 'approved', updatedAt: '2026-01-20T09:00:00.000Z' },
            { status: 'cancelled', updatedAt: '2026-04-01T09:00:00.000Z' }
          ]
        })
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(organisation.registrations[REPROCESSOR_NUMBER].status).toMatchObject(
      {
        lastUpdatedAt: '2026-04-01T09:00:00.000Z',
        timeline: [
          { status: 'approved', at: '2026-02-01T00:00:00.000Z' },
          { status: 'cancelled', at: '2026-04-01T09:00:00.000Z' }
        ]
      }
    )
  })

  it('dates an accreditation’s approval at its validFrom and its other changes when they were recorded', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = organisationAccredited({
      validFrom: '2026-07-01',
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
        { status: 'suspended', updatedAt: '2026-08-01T09:00:00.000Z' },
        { status: 'cancelled', updatedAt: '2026-09-01T09:00:00.000Z' }
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(
      organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026].status
    ).toMatchObject({
      lastUpdatedAt: '2026-09-01T09:00:00.000Z',
      timeline: [
        { status: 'approved', at: '2026-07-01T00:00:00.000Z' },
        { status: 'suspended', at: '2026-08-01T09:00:00.000Z' },
        { status: 'cancelled', at: '2026-09-01T09:00:00.000Z' }
      ]
    })
  })

  it('serves only the changes since the last re-creation, the approval from validFrom', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = organisationAccredited({
      validFrom: '2026-07-01',
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
        { status: 'created', updatedAt: '2026-03-01T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-04-01T09:00:00.000Z' }
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(
      organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026].status
    ).toMatchObject({
      lastUpdatedAt: '2026-04-01T09:00:00.000Z',
      timeline: [{ status: 'approved', at: '2026-07-01T00:00:00.000Z' }]
    })
  })

  it('leaves out a status the read model does not serve, in history that skipped the usual transitions', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = organisationAccredited({
      validFrom: '2026-07-01',
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
        { status: 'rejected', updatedAt: '2026-02-01T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-03-01T09:00:00.000Z' }
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(
      organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026].status
    ).toMatchObject({
      lastUpdatedAt: '2026-03-01T09:00:00.000Z',
      timeline: [{ status: 'approved', at: '2026-07-01T00:00:00.000Z' }]
    })
  })

  it('dates an approval recorded after its validFrom from validFrom', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = organisationAccredited({
      validFrom: '2026-01-01',
      statusHistory: [
        { status: 'created', updatedAt: '2026-10-14T14:30:47.171Z' },
        { status: 'approved', updatedAt: '2026-10-14T14:30:47.204Z' }
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(
      organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026].status
    ).toMatchObject({
      lastUpdatedAt: '2026-10-14T14:30:47.204Z',
      timeline: [{ status: 'approved', at: '2026-01-01T00:00:00.000Z' }]
    })
  })

  it('dates a reinstatement when it was recorded, not at validFrom', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = organisationAccredited({
      validFrom: '2026-01-01',
      statusHistory: [
        { status: 'approved', updatedAt: '2026-01-01T09:00:00.000Z' },
        { status: 'cancelled', updatedAt: '2026-03-10T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-03-30T09:00:00.000Z' }
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(
      organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026].status
    ).toMatchObject({
      lastUpdatedAt: '2026-03-30T09:00:00.000Z',
      timeline: [
        { status: 'approved', at: '2026-01-01T00:00:00.000Z' },
        { status: 'cancelled', at: '2026-03-10T09:00:00.000Z' },
        { status: 'approved', at: '2026-03-30T09:00:00.000Z' }
      ]
    })
  })

  it('serves an accreditation for next year approved today as approved from 1 January', async ({
    organisationReadRepositoryWith
  }) => {
    config.set('openNextYear', true)
    onTestFinished(() => config.reset('openNextYear'))
    const now = new Date()
    const nextYear = now.getUTCFullYear() + 1
    const stored = organisationAccredited({
      validFrom: `${nextYear}-01-01`,
      validTo: `${nextYear}-12-31`,
      statusHistory: [
        { status: 'created', updatedAt: now.toISOString() },
        { status: 'approved', updatedAt: now.toISOString() }
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(
      organisation.registrations[REPROCESSOR_NUMBER].accreditations[nextYear]
    ).toMatchObject({
      status: {
        current: 'approved',
        lastUpdatedAt: now.toISOString(),
        timeline: [
          { status: 'approved', at: `${nextYear}-01-01T00:00:00.000Z` }
        ]
      }
    })
  })

  it('serves the stored status even when a change to it is dated in the future', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = organisationAccredited({
      statusHistory: [
        { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
        { status: 'approved', updatedAt: '2026-02-01T09:00:00.000Z' },
        { status: 'suspended', updatedAt: '2999-01-01T09:00:00.000Z' }
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(
      organisation.registrations[REPROCESSOR_NUMBER].accreditations[2026]
    ).toMatchObject({
      status: {
        current: 'suspended',
        lastUpdatedAt: '2999-01-01T09:00:00.000Z',
        timeline: expect.arrayContaining([
          { status: 'suspended', at: '2999-01-01T09:00:00.000Z' }
        ])
      }
    })
  })

  it('dates an organisation’s approval when it was recorded', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = buildOrganisation({
      statusHistory: [
        { status: 'created', updatedAt: new Date('2026-01-01T09:00:00Z') },
        { status: 'approved', updatedAt: new Date('2026-02-01T09:00:00Z') }
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    expect(organisation).toMatchObject({
      status: {
        current: 'approved',
        lastUpdatedAt: '2026-02-01T09:00:00.000Z',
        timeline: [
          { status: 'created', at: '2026-01-01T09:00:00.000Z' },
          { status: 'approved', at: '2026-02-01T09:00:00.000Z' }
        ]
      }
    })
  })

  it('keeps every change recorded at the same instant at that instant, in the order they were recorded', async ({
    organisationReadRepositoryWith
  }) => {
    const instant = new Date('2026-01-01T09:00:00Z')
    const stored = buildOrganisation({
      statusHistory: [
        { status: 'created', updatedAt: instant },
        { status: 'approved', updatedAt: instant },
        { status: 'active', updatedAt: instant }
      ]
    })
    const repository = await organisationReadRepositoryWith({
      organisations: [stored]
    })

    const organisation = await findOrganisation(
      repository,
      stored.organisationNumber
    )

    const at = '2026-01-01T09:00:00.000Z'
    expect(organisation.status).toEqual({
      current: 'active',
      lastUpdatedAt: at,
      timeline: [
        { status: 'created', at },
        { status: 'approved', at },
        { status: 'active', at }
      ]
    })
  })

  it('finds no organisation that has no status yet', async ({
    organisationReadRepositoryWith
  }) => {
    const stored = buildOrganisation({
      statusHistory: [
        { status: 'created', updatedAt: new Date('2999-01-01T09:00:00Z') }
      ]
    })
    const logger = { warn: vi.fn() }
    const repository = await organisationReadRepositoryWith({
      organisations: [stored],
      logger
    })

    expect(
      await repository.findByOrganisationNumber(stored.organisationNumber)
    ).toBeNull()
    expect(logger.warn).toHaveBeenCalledWith({
      message: expect.stringContaining(
        `Organisation ${stored.organisationNumber} has status undefined`
      )
    })
  })
})
