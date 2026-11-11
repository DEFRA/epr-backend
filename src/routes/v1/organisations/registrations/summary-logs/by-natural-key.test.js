import { currentUtcYear, toYear } from '#common/helpers/dates/year.js'
import { organisationReadRepositoryOf } from '#vite/helpers/organisation-read-model.js'
import { randomUUID } from 'node:crypto'

import { StatusCodes } from 'http-status-codes'

import { createInMemoryUploadsRepository } from '#adapters/repositories/uploads/inmemory.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import {
  NO_PRIOR_SUBMISSION,
  SUMMARY_LOG_STATUS,
  transitionStatus
} from '#domain/summary-logs/status.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import {
  summaryLogFactory,
  withoutAccreditationId
} from '#repositories/summary-logs/contract/test-data.js'
import { waitForVersion } from '#repositories/summary-logs/contract/test-helpers.js'
import { createInMemorySummaryLogsRepository } from '#repositories/summary-logs/inmemory.js'
import { auditSummaryLogDownload } from '#root/auditing/summary-logs.js'
import { config } from '#root/config.js'
import {
  ACCREDITATION_NUMBER,
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createTestServer } from '#test/create-test-server.js'
import { asOperator, asServiceMaintainer } from '#test/inject-auth.js'
import { createMockLogger } from '#test/mock-logger.js'
import { partialMock } from '#test/type-helpers.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { toSummaryLogId } from '#domain/summary-logs/ids.js'

const { buildOrganisation } = createOrganisationBuilders()

/** @import { SummaryLogsRepository } from '#repositories/summary-logs/port.js' */

vi.mock('#root/auditing/summary-logs.js', () => ({
  auditSummaryLogSubmit: vi.fn(),
  auditSummaryLogDownload: vi.fn()
}))

const REGISTERED_ONLY_NUMBER = 'R26ER5001180099PL'
const YEAR = toYear(2026)

const accredited = accreditation()
const registeredOnlyRegistration = reprocessor({
  registrationNumber: REGISTERED_ONLY_NUMBER
})
const accreditedRegistration = reprocessor({ accreditationId: accredited.id })
const organisation = buildOrganisation({
  registrations: [registeredOnlyRegistration, accreditedRegistration],
  accreditations: [accredited]
})

const { organisationNumber } = organisation
const registeredOnlyLog = {
  registrationId: registeredOnlyRegistration.id,
  accreditationId: null,
  organisationNumber,
  registrationNumber: toRegistrationNumber(REGISTERED_ONLY_NUMBER),
  accreditationNumber: null
}
const accreditedLog = {
  registrationId: accreditedRegistration.id,
  accreditationId: accredited.id,
  organisationNumber,
  registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
  accreditationNumber: toAccreditationNumber(ACCREDITATION_NUMBER)
}

const registrations = `/organisations/${organisationNumber}/registrations`
const summaryLogs = `${registrations}/${REPROCESSOR_NUMBER}/summary-logs`

const uploadAddresses = [
  {
    kind: 'registered-only',
    uploads: `${registrations}/${REGISTERED_ONLY_NUMBER}/summary-logs/${YEAR}`,
    registration: registeredOnlyRegistration,
    accreditationId: null
  },
  {
    kind: 'accredited',
    uploads: `${registrations}/${REPROCESSOR_NUMBER}/accreditations/${YEAR}/summary-log`,
    registration: accreditedRegistration,
    accreditationId: accredited.id
  }
]

const redirect = { redirectUrl: 'https://frontend.test/redirect' }

const uploadCompleted = {
  uploadStatus: 'ready',
  form: {
    summaryLogUpload: {
      fileId: 'file-uploaded',
      filename: 'summary-log.xlsx',
      fileStatus: 'complete',
      s3Bucket: 'test-bucket',
      s3Key: 'test-key'
    }
  },
  numberOfRejectedFiles: 0
}

describe('summary-log routes by natural key', () => {
  setupAuthContext()

  /** @type {Awaited<ReturnType<typeof createTestServer>>} */
  let server
  /** @type {ReturnType<typeof createInMemoryUploadsRepository>} */
  let uploadsRepository
  /** @type {SummaryLogsRepository} */
  let summaryLogsRepository

  beforeEach(async () => {
    uploadsRepository = createInMemoryUploadsRepository()
    summaryLogsRepository =
      createInMemorySummaryLogsRepository()(createMockLogger())

    server = await createTestServer({
      repositories: {
        organisationAdministrationRepository:
          createInMemoryOrganisationsRepository([partialMock(organisation)]),
        organisationReadRepository: await organisationReadRepositoryOf([
          partialMock(organisation)
        ]),
        summaryLogsRepository: () => summaryLogsRepository,
        uploadsRepository
      },
      workers: {
        summaryLogsWorker: {
          validate: vi.fn(),
          submit: vi.fn().mockResolvedValue(undefined)
        }
      }
    })
  })

  afterEach(async () => {
    await server.stop()
  })

  /**
   * @typedef {(typeof registeredOnlyLog | typeof accreditedLog) & {
   *   [field: string]: unknown
   * }} SeedOverrides
   */

  /**
   * Stores a summary log under its ids and the numbers an upload stores
   * beside them.
   *
   * @param {SeedOverrides} overrides
   * @param {(overrides: object) => object} build
   */
  const seed = async (overrides, build) => {
    const summaryLogId = toSummaryLogId(randomUUID())
    await summaryLogsRepository.insert(
      summaryLogId,
      partialMock(
        build({ organisationId: organisation.id, year: YEAR, ...overrides })
      )
    )
    return {
      summaryLogId,
      ...(await waitForVersion(summaryLogsRepository, summaryLogId, 1))
    }
  }

  /**
   * A summary log ready to submit: validated against no prior submission.
   *
   * @param {SeedOverrides} overrides
   */
  const seedValidated = async (overrides) => {
    const { summaryLogId, version, summaryLog } = await seed(
      overrides,
      summaryLogFactory.validating
    )
    await summaryLogsRepository.update(summaryLogId, version, {
      ...transitionStatus(summaryLog, SUMMARY_LOG_STATUS.VALIDATED),
      meta: { PROCESSING_TYPE: PROCESSING_TYPES.REPROCESSOR_INPUT }
    })
    await waitForVersion(summaryLogsRepository, summaryLogId, version + 1)
    return summaryLogId
  }

  describe.each(uploadAddresses)(
    'uploading a $kind summary log',
    ({ uploads, registration, accreditationId }) => {
      it('starts the upload with its callback under the same address', async () => {
        const response = await server.inject({
          method: 'POST',
          url: uploads,
          payload: redirect,
          ...asOperator()
        })

        expect(response.statusCode).toBe(StatusCodes.CREATED)
        const { summaryLogId } = JSON.parse(response.payload)
        expect(uploadsRepository.initiateCalls.at(-1)).toMatchObject({
          organisationId: organisation.id,
          registrationId: registration.id,
          callbackUrl: `${config.get('appBaseUrl')}${uploads}/${summaryLogId}/upload-completed`
        })
      })

      it('stores the summary log for the registration, year and accreditation when the upload completes', async () => {
        const summaryLogId = toSummaryLogId(randomUUID())

        const response = await server.inject({
          method: 'POST',
          url: `${uploads}/${summaryLogId}/upload-completed`,
          payload: uploadCompleted
        })

        expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
        const stored = await waitForVersion(
          summaryLogsRepository,
          summaryLogId,
          1
        )
        expect(stored.summaryLog).toMatchObject({
          organisationId: organisation.id,
          registrationId: registration.id,
          year: YEAR,
          accreditationId
        })
      })
    }
  )

  describe.each([
    {
      kind: 'registered-only',
      log: {
        ...accreditedLog,
        accreditationId: null,
        accreditationNumber: null
      },
      ledgerAccreditation: { kind: 'registeredOnly' }
    },
    {
      kind: 'accredited',
      log: accreditedLog,
      ledgerAccreditation: {
        kind: 'accredited',
        accreditationNumber: ACCREDITATION_NUMBER
      }
    }
  ])('a $kind summary log', ({ log, ledgerAccreditation }) => {
    it('is read with the ledger accreditation it was uploaded to, apart from its cover sheet', async () => {
      const { summaryLogId } = await seed(
        {
          ...log,
          meta: {
            PROCESSING_TYPE: PROCESSING_TYPES.REPROCESSOR_INPUT,
            ACCREDITATION_NUMBER: 'COVER-SHEET-NUMBER'
          }
        },
        summaryLogFactory.validated
      )

      const response = await server.inject({
        method: 'GET',
        url: `${summaryLogs}/${summaryLogId}`,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.ledgerAccreditation).toEqual(ledgerAccreditation)
      expect(body.accreditationNumber).toBe('COVER-SHEET-NUMBER')
    })
  })

  it('reads a summary log that holds no accreditation id without a ledger accreditation', async () => {
    const summaryLogId = toSummaryLogId(randomUUID())
    await summaryLogsRepository.insert(
      summaryLogId,
      partialMock(
        withoutAccreditationId(
          summaryLogFactory.validated({
            organisationId: organisation.id,
            ...accreditedLog,
            year: YEAR,
            meta: { PROCESSING_TYPE: PROCESSING_TYPES.REPROCESSOR_INPUT }
          })
        )
      )
    )
    await waitForVersion(summaryLogsRepository, summaryLogId, 1)

    const response = await server.inject({
      method: 'GET',
      url: `${summaryLogs}/${summaryLogId}`,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).not.toHaveProperty(
      'ledgerAccreditation'
    )
  })

  it('stores a registered-only upload as registered-only when the registration is accredited', async () => {
    const summaryLogId = toSummaryLogId(randomUUID())

    const response = await server.inject({
      method: 'POST',
      url: `${summaryLogs}/${YEAR}/${summaryLogId}/upload-completed`,
      payload: uploadCompleted
    })

    expect(response.statusCode).toBe(StatusCodes.ACCEPTED)
    const stored = await waitForVersion(summaryLogsRepository, summaryLogId, 1)
    expect(stored.summaryLog).toMatchObject({
      registrationId: accreditedRegistration.id,
      accreditationId: null
    })
  })

  it('validates a registered-only upload against the prior registered-only submission, not the accredited one', async () => {
    await seed(accreditedLog, summaryLogFactory.submitted)
    const summaryLogId = toSummaryLogId(randomUUID())

    await server.inject({
      method: 'POST',
      url: `${summaryLogs}/${YEAR}/${summaryLogId}/upload-completed`,
      payload: uploadCompleted
    })

    const stored = await waitForVersion(summaryLogsRepository, summaryLogId, 1)
    expect(stored.summaryLog.validatedAgainstSummaryLogId).toBe(
      NO_PRIOR_SUBMISSION
    )
  })

  describe('a summary log', () => {
    /** @param {object} [overrides] */
    const seedOwn = (overrides = {}) =>
      seedValidated({ ...accreditedLog, ...overrides })

    it('is read under its registration, whatever its year', async () => {
      const summaryLogId = toSummaryLogId(
        await seedOwn({ year: toYear(YEAR - 1) })
      )

      const response = await server.inject({
        method: 'GET',
        url: `${summaryLogs}/${summaryLogId}`,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body.status).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      expect(body).not.toHaveProperty('accreditationId')
    })

    it('reads as the default status while its upload is in progress', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${summaryLogs}/${randomUUID()}`,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(JSON.parse(response.payload).status).toBe(
        SUMMARY_LOG_STATUS.PREPROCESSING
      )
    })

    it('is submitted, answering with its own address', async () => {
      const summaryLogId = toSummaryLogId(await seedOwn())

      const response = await server.inject({
        method: 'POST',
        url: `${summaryLogs}/${summaryLogId}/submit`,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(response.headers.location).toBe(`${summaryLogs}/${summaryLogId}`)
    })

    it('has its file downloaded', async () => {
      const summaryLogId = toSummaryLogId(await seedOwn())

      const response = await server.inject({
        method: 'GET',
        url: `${summaryLogs}/${summaryLogId}/file`,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY)
    })

    it('has its document read', async () => {
      const summaryLogId = toSummaryLogId(await seedOwn())

      const response = await server.inject({
        method: 'GET',
        url: `${summaryLogs}/${summaryLogId}/document`,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      const body = JSON.parse(response.payload)
      expect(body).toMatchObject({ year: YEAR, status: 'validated' })
      expect(body).not.toHaveProperty('organisationId')
      expect(body).not.toHaveProperty('registrationId')
      expect(body).not.toHaveProperty('accreditationId')
    })

    it.each([
      ['another organisation', { organisationId: 'another-organisation' }],
      [
        'another registration',
        {
          registrationId: registeredOnlyLog.registrationId,
          registrationNumber: registeredOnlyLog.registrationNumber
        }
      ]
    ])('is not found when it belongs to %s', async (_, overrides) => {
      const summaryLogId = toSummaryLogId(await seedOwn(overrides))

      const responses = await Promise.all(
        [
          { method: 'GET', suffix: '', auth: asOperator() },
          { method: 'POST', suffix: '/submit', auth: asOperator() },
          { method: 'GET', suffix: '/file', auth: asServiceMaintainer() },
          { method: 'GET', suffix: '/document', auth: asServiceMaintainer() }
        ].map(({ method, suffix, auth }) =>
          server.inject({
            method,
            url: `${summaryLogs}/${summaryLogId}${suffix}`,
            ...auth
          })
        )
      )

      expect(responses.map(({ statusCode }) => statusCode)).toEqual(
        Array(4).fill(StatusCodes.NOT_FOUND)
      )
    })
  })

  it.each([
    [
      'creating under a registration with no accreditation',
      'POST',
      `${registrations}/${REGISTERED_ONLY_NUMBER}/accreditations/${YEAR}/summary-log`,
      redirect
    ],
    [
      'creating for a year the registration has no accreditation for',
      'POST',
      `${registrations}/${REPROCESSOR_NUMBER}/accreditations/2025/summary-log`,
      redirect
    ],
    [
      'creating under an unknown registration',
      'POST',
      `${registrations}/R26XX0000000000PL/summary-logs/${YEAR}`,
      redirect
    ],
    [
      'completing an upload under a registration with no accreditation',
      'POST',
      `${registrations}/${REGISTERED_ONLY_NUMBER}/accreditations/${YEAR}/summary-log/${randomUUID()}/upload-completed`,
      uploadCompleted
    ],
    [
      'reading under an unknown registration',
      'GET',
      `${registrations}/R26XX0000000000PL/summary-logs/${randomUUID()}`,
      undefined
    ]
  ])('returns 404 for %s', async (_, method, url, payload) => {
    const response = await server.inject({
      method,
      url,
      payload,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 422 when creating for a future year', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `${registrations}/${REGISTERED_ONLY_NUMBER}/summary-logs/2099`,
      payload: redirect,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  describe('creating for next year', () => {
    const nextYearUploads = `${registrations}/${REGISTERED_ONLY_NUMBER}/summary-logs/${currentUtcYear() + 1}`

    afterEach(() => {
      config.reset('openNextYear')
    })

    it('starts the upload while next year is open', async () => {
      config.set('openNextYear', true)

      const response = await server.inject({
        method: 'POST',
        url: nextYearUploads,
        payload: redirect,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.CREATED)
    })

    it('returns 422 while next year is closed', async () => {
      const response = await server.inject({
        method: 'POST',
        url: nextYearUploads,
        payload: redirect,
        ...asOperator()
      })

      expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
    })
  })

  describe("a registration's summary-log files", () => {
    const files = `${registrations}/${REGISTERED_ONLY_NUMBER}/summary-logs/files`
    const fileId = 'file-submitted'

    beforeEach(async () => {
      await seed(
        {
          ...registeredOnlyLog,
          file: { id: fileId },
          meta: { REGISTRATION_NUMBER: REGISTERED_ONLY_NUMBER }
        },
        summaryLogFactory.submitted
      )
    })

    it('downloads a file by its id', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${files}/${fileId}`,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.MOVED_TEMPORARILY)
    })

    it('audits the download of a file by its id', async () => {
      vi.mocked(auditSummaryLogDownload).mockClear()

      await server.inject({
        method: 'GET',
        url: `${files}/${fileId}`,
        ...asServiceMaintainer()
      })

      expect(auditSummaryLogDownload).toHaveBeenCalledWith(expect.anything(), {
        summaryLogId: fileId,
        organisationId: organisation.id,
        registrationId: registeredOnlyRegistration.id
      })
    })

    it('does not find a file no summary log holds', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${files}/file-unknown`,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })

    it.each([
      ['refuses an unauthenticated caller', {}, StatusCodes.UNAUTHORIZED],
      [
        'refuses a caller holding neither scope',
        asServiceMaintainer({ scope: ['standardUser'] }),
        StatusCodes.FORBIDDEN
      ]
    ])('%s a file by its id', async (_, auth, statusCode) => {
      const response = await server.inject({
        method: 'GET',
        url: `${files}/${fileId}`,
        ...auth
      })

      expect(response.statusCode).toBe(statusCode)
    })

    it("downloads a file's records as CSV", async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${files}/${fileId}/records.csv`,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.OK)
      expect(response.headers['content-type']).toContain('text/csv')
    })

    it('does not find a file under an unknown registration', async () => {
      const response = await server.inject({
        method: 'GET',
        url: `${registrations}/R26XX0000000000PL/summary-logs/files/${fileId}`,
        ...asServiceMaintainer()
      })

      expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
    })
  })
})
