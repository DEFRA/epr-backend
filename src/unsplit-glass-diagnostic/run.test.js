import { describe, it, expect, vi, beforeEach } from 'vitest'

import { logger } from '#common/helpers/logging/logger.js'
import {
  buildOrganisation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { createOrganisationsRepository } from '#repositories/organisations/mongodb.js'

import { runUnsplitGlassDiagnostic } from './run.js'

/** @import { Lock } from 'mongo-locks' */
/** @import { StartedServer } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */

vi.mock('#common/helpers/logging/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))
vi.mock('#repositories/organisations/mongodb.js', () => ({
  createOrganisationsRepository: vi.fn()
}))

describe('runUnsplitGlassDiagnostic', () => {
  /** @type {StartedServer} */
  let server
  /** @type {Lock} */
  let lock

  /** @param {Organisation[]} organisations */
  const storeOrganisations = (organisations) =>
    vi
      .mocked(createOrganisationsRepository)
      .mockResolvedValue(createInMemoryOrganisationsRepository(organisations))

  beforeEach(() => {
    vi.clearAllMocks()

    lock = partialMock({ free: vi.fn().mockResolvedValue(true) })
    server = partialMock({
      db: partialMock({}),
      locker: partialMock({ lock: vi.fn().mockResolvedValue(lock) })
    })

    storeOrganisations([])
  })

  it('acquires a lock scoped to the diagnostic and releases it afterwards', async () => {
    await runUnsplitGlassDiagnostic(server)

    expect(server.locker.lock).toHaveBeenCalledWith('unsplit-glass-diagnostic')
    expect(lock.free).toHaveBeenCalled()
  })

  it('skips the run when the lock is held by another instance', async () => {
    vi.mocked(server.locker.lock).mockResolvedValue(null)

    await runUnsplitGlassDiagnostic(server)

    expect(createOrganisationsRepository).not.toHaveBeenCalled()
    expect(logger.info).toHaveBeenCalledWith({
      message: 'Unable to obtain lock, skipping unsplit glass diagnostic'
    })
  })

  it('logs one line per unsplit glass record plus the summary', async () => {
    const numbered = buildRegistration({
      material: 'glass',
      glassRecyclingProcess: ['glass_re_melt', 'glass_other'],
      registrationNumber: 'R25SR500010GL'
    })
    const unnumbered = buildRegistration({
      material: 'glass',
      glassRecyclingProcess: []
    })
    delete unnumbered.registrationNumber
    const organisation = buildOrganisation({
      registrations: [numbered, unnumbered],
      accreditations: []
    })
    storeOrganisations([partialMock(organisation)])

    await runUnsplitGlassDiagnostic(server)

    expect(logger.info).toHaveBeenCalledWith({
      message: `Unsplit glass record: organisationId=${organisation.id} orgId=${organisation.orgId} recordKind=registration recordId=${numbered.id} status=created number=R25SR500010GL glassRecyclingProcess=["glass_re_melt","glass_other"]`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message: `Unsplit glass record: organisationId=${organisation.id} orgId=${organisation.orgId} recordKind=registration recordId=${unnumbered.id} status=created number=none glassRecyclingProcess=[]`
    })
    expect(logger.info).toHaveBeenCalledWith({
      message:
        'Unsplit glass diagnostic: scannedOrganisations=1 scannedRegistrations=2 scannedAccreditations=0 unsplitRegistrations=2 unsplitAccreditations=0'
    })
  })

  it('releases the lock and logs an error when reading the organisations fails', async () => {
    const error = new Error('mongo unavailable')
    vi.mocked(createOrganisationsRepository).mockRejectedValue(error)

    await runUnsplitGlassDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run unsplit glass diagnostic'
    })
    expect(lock.free).toHaveBeenCalled()
  })

  it('tolerates the locker itself throwing', async () => {
    const error = new Error('locker unavailable')
    vi.mocked(server.locker.lock).mockRejectedValue(error)

    await runUnsplitGlassDiagnostic(server)

    expect(logger.error).toHaveBeenCalledWith({
      err: error,
      message: 'Failed to run unsplit glass diagnostic'
    })
  })
})
