import { describe, it, expect } from 'vitest'

import {
  buildAccreditation,
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'

import { diagnoseUnsplitGlass } from './diagnose-unsplit-glass.js'

/** @import { Accreditation } from '#domain/organisations/accreditation.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration } from '#domain/organisations/registration.js' */

/**
 * The repository derives each status from statusHistory, so an organisation
 * as built is as stored.
 *
 * @param {ReturnType<typeof buildOrganisation>} organisation
 * @returns {Organisation}
 */
const asStored = (organisation) => partialMock(organisation)

/**
 * Reads the organisations back through the repository, so the records the
 * diagnostic sees are mapped exactly as the pages that call resolveMaterial
 * see them.
 *
 * @param {ReturnType<typeof buildOrganisation>[]} organisations
 */
const readThroughRepository = async (organisations) =>
  createInMemoryOrganisationsRepository(organisations.map(asStored))().findAll()

const [TEST_ORGANISATION_ID] = TEST_ORGANISATION_IDS

/** @param {Partial<Registration>} [overrides] */
const unsplitRegistration = (overrides = {}) =>
  buildRegistration({
    material: 'glass',
    glassRecyclingProcess: ['glass_re_melt', 'glass_other'],
    ...overrides
  })

/** @param {Partial<Accreditation>} [overrides] */
const unsplitAccreditation = (overrides = {}) =>
  buildAccreditation({
    material: 'glass',
    glassRecyclingProcess: ['glass_re_melt', 'glass_other'],
    ...overrides
  })

describe('diagnoseUnsplitGlass', () => {
  it('reports a glass registration that carries both recycling processes', async () => {
    const registration = unsplitRegistration({
      registrationNumber: 'R25SR500010GL'
    })
    const organisation = buildOrganisation({
      registrations: [registration],
      accreditations: []
    })

    const { rows } = diagnoseUnsplitGlass(
      await readThroughRepository([organisation])
    )

    expect(rows).toEqual([
      {
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: false,
        recordKind: 'registration',
        recordId: registration.id,
        status: 'created',
        number: 'R25SR500010GL',
        glassRecyclingProcess: ['glass_re_melt', 'glass_other']
      }
    ])
  })

  it('reports a glass accreditation that carries both recycling processes', async () => {
    const accreditation = unsplitAccreditation({
      accreditationNumber: 'A25SR500010GL'
    })
    const organisation = buildOrganisation({
      registrations: [],
      accreditations: [accreditation]
    })

    const { rows } = diagnoseUnsplitGlass(
      await readThroughRepository([organisation])
    )

    expect(rows).toEqual([
      {
        organisationId: organisation.id,
        orgId: organisation.orgId,
        testOrganisation: false,
        recordKind: 'accreditation',
        recordId: accreditation.id,
        status: 'created',
        number: 'A25SR500010GL',
        glassRecyclingProcess: ['glass_re_melt', 'glass_other']
      }
    ])
  })

  it('reports a glass record with no recycling process, whatever its number', async () => {
    const withEmptyProcesses = unsplitRegistration({
      glassRecyclingProcess: [],
      registrationNumber: undefined
    })
    const withoutProcesses = unsplitAccreditation({ accreditationNumber: null })
    delete withoutProcesses.glassRecyclingProcess
    const organisation = buildOrganisation({
      registrations: [withEmptyProcesses],
      accreditations: [withoutProcesses]
    })

    const { rows } = diagnoseUnsplitGlass(
      await readThroughRepository([organisation])
    )

    expect(rows).toEqual([
      expect.objectContaining({
        recordId: withEmptyProcesses.id,
        number: null,
        glassRecyclingProcess: []
      }),
      expect.objectContaining({
        recordId: withoutProcesses.id,
        number: null,
        glassRecyclingProcess: null
      })
    ])
  })

  it('reports an unsplit record whatever its status', async () => {
    const approved = unsplitRegistration({
      statusHistory: [{ status: 'approved', updatedAt: new Date() }]
    })
    const rejected = unsplitRegistration({
      statusHistory: [{ status: 'rejected', updatedAt: new Date() }]
    })
    const organisation = buildOrganisation({
      registrations: [approved, rejected],
      accreditations: []
    })

    const { rows } = diagnoseUnsplitGlass(
      await readThroughRepository([organisation])
    )

    expect(rows.map((row) => row.status)).toEqual(['approved', 'rejected'])
  })

  it('passes over split glass records and records for other materials', async () => {
    const organisation = buildOrganisation({
      registrations: [
        buildRegistration({
          material: 'glass',
          glassRecyclingProcess: ['glass_re_melt']
        }),
        buildRegistration({ material: 'plastic' })
      ],
      accreditations: [
        buildAccreditation({
          material: 'glass',
          glassRecyclingProcess: ['glass_other']
        }),
        buildAccreditation({ material: 'paper' })
      ]
    })

    const { rows } = diagnoseUnsplitGlass(
      await readThroughRepository([organisation])
    )

    expect(rows).toEqual([])
  })

  it('reports an unsplit record in a test organisation and marks it as one', async () => {
    const registration = unsplitRegistration()
    const organisation = buildOrganisation({
      orgId: TEST_ORGANISATION_ID,
      registrations: [registration],
      accreditations: []
    })

    const { rows, summary } = diagnoseUnsplitGlass(
      await readThroughRepository([organisation])
    )

    expect(rows).toEqual([
      expect.objectContaining({
        recordId: registration.id,
        testOrganisation: true
      })
    ])
    expect(summary.unsplitInTestOrganisations).toBe(1)
  })

  it('totals what it scanned and what it found across every organisation', async () => {
    const first = buildOrganisation({
      orgId: TEST_ORGANISATION_ID,
      registrations: [unsplitRegistration(), buildRegistration()],
      accreditations: [unsplitAccreditation()]
    })
    const second = buildOrganisation({
      registrations: [unsplitRegistration()],
      accreditations: [buildAccreditation(), buildAccreditation()]
    })

    const { summary } = diagnoseUnsplitGlass(
      await readThroughRepository([first, second])
    )

    expect(summary).toEqual({
      scannedOrganisations: 2,
      scannedRegistrations: 3,
      scannedAccreditations: 3,
      unsplitRegistrations: 2,
      unsplitAccreditations: 1,
      unsplitInTestOrganisations: 2
    })
  })
})
