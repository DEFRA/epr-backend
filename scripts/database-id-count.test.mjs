import { describe, it, expect } from 'vitest'
import { isCounted, measure, comment, MEASURES } from './database-id-count.mjs'

const PATH = 'src/application/example.js'

/**
 * @param {string} source
 * @param {string} [path]
 */
const countsFor = (source, path = PATH) => measure([{ path, source }])

describe('isCounted', () => {
  it.each([
    'src/routes/v1/organisations/get-by-id.js',
    'src/repositories/organisations/port.js',
    'src/reports/repository/port.js',
    'src/waste-balances/repository/ledger-port.js',
    'src/domain/uploads/repository/port.js',
    'src/common/helpers/mongo-client.js',
    'src/common/helpers/plugins/mongo-db-plugin.js',
    'src/non-prod-data-reset/mongodb.js'
  ])('counts production code: %s', (path) => {
    expect(isCounted(path)).toBe(true)
  })

  it.each([
    'src/repositories/organisations/mongodb.js',
    'src/repositories/organisations/mongodb-find.js',
    'src/reports/repository/mongodb.js',
    'src/waste-balances/repository/ledger-mongodb.js',
    'src/packaging-recycling-notes/repository/drift-query.mongodb.js',
    'src/repositories/organisations/inmemory.js',
    'src/repositories/summary-logs/inmemory.js',
    'src/waste-balances/repository/ledger-inmemory.js',
    'src/repositories/organisations/helpers.js',
    'src/repositories/organisations/schema/validation.js',
    'src/repositories/summary-logs/schema.js',
    'src/organisation-read-model/repository/to-read-model.js',
    'src/adapters/repositories/uploads/cdp-uploader.js',
    'src/routes/v1/organisations/get-by-id.test.js',
    'src/repositories/organisations/contract/find.contract.js',
    'src/repositories/organisations/contract/test-data.js',
    'src/routes/v1/organisations/registrations/summary-logs/integration-test-helpers.js',
    'src/data/fixtures/organisation.json',
    'src/test/create-test-server.js',
    'scripts/database-id-count.mjs'
  ])('leaves out %s', (path) => {
    expect(isCounted(path)).toBe(false)
  })
})

describe('lines naming a database id', () => {
  it('counts each line that names one, in any case', () => {
    const source = [
      'const { organisationId } = request.params',
      'findByRegistrationId(id)',
      'const accreditationId = 1',
      'const orgId = organisationNumber'
    ].join('\n')

    expect(countsFor(source)[0]).toBe(3)
  })

  it('counts finding an organisation by id and reading id from a stored record', () => {
    const source = [
      'await organisationsRepository.findById(id)',
      'await this.organisationsRepository.findByIds(ids)',
      'await organisationRepo.findById(id)',
      'await organisationAdministrationRepository.findById(id)',
      'const key = registration.id',
      'accreditation.id === id',
      'organisation.idempotencyKey',
      'summaryLog.id'
    ].join('\n')

    expect(countsFor(source)[0]).toBe(6)
  })

  it('leaves out finding anything else by its own id', () => {
    const source = [
      'await packagingRecyclingNotesRepository.findById(id)',
      'await summaryLogsRepository.findById(summaryLogId)',
      'await overseasSitesRepository.findByIds(siteIds)'
    ].join('\n')

    expect(countsFor(source)[0]).toBe(0)
  })

  it('leaves out route path parameters', () => {
    expect(
      countsFor(
        "const path = '/v1/organisations/{organisationId}/registrations/{registrationId}'"
      )[0]
    ).toBe(0)
  })

  it('still counts a handler destructuring the parameter, however it is spaced', () => {
    expect(countsFor('const {organisationId} = request.params')[0]).toBe(1)
  })

  it('still counts an id interpolated into a template literal', () => {
    expect(countsFor('`organisations/${organisationId}`')[0]).toBe(1)
  })

  it('still counts a line that uses an id beside a route path parameter', () => {
    expect(countsFor("get('/{organisationId}', organisationId)")[0]).toBe(1)
  })
})

describe('lines reaching a collection directly', () => {
  it('counts each call to .collection(', () => {
    const source = [
      "db.collection('organisation')",
      '  .collection(COLLECTION_NAME)',
      'const collection = repository'
    ].join('\n')

    expect(countsFor(source)[1]).toBe(2)
  })
})

describe('lines naming _id', () => {
  it('counts _id as a word, not as part of a longer name', () => {
    const source = ['{ _id: id }', 'doc._id', 'const my_id = 1'].join('\n')

    expect(countsFor(source)[2]).toBe(2)
  })
})

describe('lines naming ObjectId', () => {
  it('counts ObjectId as a word', () => {
    const source = [
      "import { ObjectId } from 'mongodb'",
      'new ObjectId(id)',
      'const isObjectIdLike = true'
    ].join('\n')

    expect(countsFor(source)[3]).toBe(2)
  })
})

describe('files using the stored organisation shapes', () => {
  it.each([
    "/** @import {Organisation} from '#domain/organisations/model.js' */",
    "/** @import { AccreditationStatus, Organisation } from '#domain/organisations/model.js' */",
    "/** @import {Registration} from '#domain/organisations/registration.js' */",
    "/** @import { Accreditation as Acc } from '#domain/organisations/accreditation.js' */",
    " * @param {import('#domain/organisations/accreditation.js').Accreditation} accreditation",
    "/**\n * @import {\n *   Organisation\n * } from '#domain/organisations/model.js'\n */",
    "/**\n * @import { Organisation }\n * from '#domain/organisations/model.js'\n */",
    "/** @import {RegistrationOrAccreditation} from '#domain/organisations/model.js' */",
    "/** @import {RegistrationApproved} from '#domain/organisations/registration.js' */",
    " * @param {import('#domain/organisations/accreditation.js').AccreditationApproved} accreditation"
  ])('counts a file that imports a shape: %s', (source) => {
    expect(countsFor(source)[4]).toBe(1)
  })

  it.each([
    "/** @import {RegistrationStatus} from '#domain/organisations/model.js' */",
    "/** @import { Registration } from './model.js' */",
    " * @param {import('#domain/organisations/model.js').OrganisationStatus} status"
  ])('leaves out a file that imports no shape: %s', (source) => {
    expect(countsFor(source)[4]).toBe(0)
  })

  it('counts a file once however many shapes it imports', () => {
    const source = [
      "/** @import {Organisation} from '#domain/organisations/model.js' */",
      "/** @import {Registration} from '#domain/organisations/registration.js' */"
    ].join('\n')

    expect(countsFor(source)[4]).toBe(1)
  })

  it('leaves out the modules that define the shapes', () => {
    expect(
      countsFor(
        "/** @import {Registration} from '#domain/organisations/registration.js' */",
        'src/domain/organisations/model.js'
      )[4]
    ).toBe(0)
  })

  it.each([
    [
      'src/domain/organisations/registration-utils.js',
      "/** @import {Registration} from './registration.js' */"
    ],
    [
      'src/domain/summary-logs/example.js',
      "/** @import {Organisation} from '../organisations/model.js' */"
    ],
    [
      'src/domain/organisations/status.js',
      " * @param {import('./model.js').Organisation} organisation"
    ]
  ])('counts %s importing a shape by a relative path', (path, source) => {
    expect(countsFor(source, path)[4]).toBe(1)
  })
})

describe('files reading every organisation through the legacy repository', () => {
  it.each([
    'const organisations = await organisationsRepository.findAll()',
    'organisationRepo.findAll(),',
    'await this.organisationsRepository.findAll()',
    'await organisationAdministrationRepository.findAll()',
    'await organisationLinkingRepository.findAll()'
  ])('counts a file that reads every organisation: %s', (source) => {
    expect(countsFor(source)[5]).toBe(1)
  })

  it.each([
    'await organisationsRepository.findByOrganisationNumber(number)',
    'await organisationsRepository.insert(organisation)',
    'await organisationReadRepository.findAll()',
    'await overseasSitesRepository.findAll()'
  ])('leaves out a file that does not: %s', (source) => {
    expect(countsFor(source)[5]).toBe(0)
  })

  it('counts a file that builds the repository and reads every organisation under another name', () => {
    const source = [
      'const repository = (await createOrganisationsRepository(server.db))()',
      'const organisations = await repository.findAll()'
    ].join('\n')

    expect(countsFor(source)[5]).toBe(1)
  })

  it('leaves out a file that builds the repository without reading every organisation', () => {
    const source = [
      'const factory = await createOrganisationsRepository(db)',
      'await overseasSitesRepository.findByIds(ids)'
    ].join('\n')

    expect(countsFor(source)[5]).toBe(0)
  })

  it('counts a file once however many times it reads every organisation', () => {
    const source = [
      'await organisationsRepository.findAll()',
      'await organisationsRepository.findAll()'
    ].join('\n')

    expect(countsFor(source)[5]).toBe(1)
  })
})

describe('comment', () => {
  const main = MEASURES.map(() => 42)

  it('shows each count on both refs and the change against main', () => {
    const body = comment([40, 43, 42, 42, 42, 42], main, 'main')

    expect(body).toContain('| Lines naming a database id | 40 | 42 | down 2 |')
    expect(body).toContain(
      '| Lines reaching a collection directly | 43 | 42 | up 1 |'
    )
    expect(body).toContain('| Lines naming `_id` | 42 | 42 | no change |')
  })

  it('states the rule behind each count', () => {
    const body = comment(main, main, 'main')

    for (const { rule } of MEASURES) {
      expect(body).toContain(rule)
    }
  })
})
