import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { accreditationForYear } from '#organisation-read-model/index.js'
import {
  accreditationsByYear,
  approvedStatusFrom,
  buildReadAccreditation,
  buildReadExporterAccreditation,
  buildReadExporterRegistration,
  buildReadReprocessorRegistration
} from '#organisation-read-model/test-support.js'
import { validityOf } from '#waste-balances/application/read-model-accreditations.js'
import { createInMemoryLedgerRepository } from '#waste-balances/repository/ledger-inmemory.js'
import {
  buildLedgerEvent,
  buildLedgerId,
  buildPrnCreatedEvent
} from '#waste-balances/repository/ledger-test-data.js'
import { partialMock } from '#test/type-helpers.js'

/** @import { LedgerEvent } from '#waste-balances/repository/ledger-schema.js' */

import { hashClassificationContext } from './classification-context-hash.js'
import { summaryLogContextOf } from './classification-context.js'

const PREVIOUS_YEAR = toYear(2026)
const YEAR = toYear(2027)
const PREVIOUS_YEAR_ACCREDITATION_NUMBER = toAccreditationNumber('ACC-2026')
const ACCREDITATION_NUMBER = toAccreditationNumber('ACC-2027')
const ledgerId = buildLedgerId()
const organisationNumber = toOrganisationNumber(ledgerId.organisationNumber)
const registrationNumber = toRegistrationNumber(ledgerId.registrationNumber)

/**
 * @param {import('#domain/organisations/numbers.js').AccreditationNumber} accreditationNumber
 * @param {import('#common/helpers/dates/year.js').Year} year
 */
const exporterAccreditation = (accreditationNumber, year) =>
  buildReadExporterAccreditation({
    accreditationNumber,
    year,
    status: approvedStatusFrom(`${year}-01-01`),
    overseasSites: {
      100: { status: 'approved', approvedOn: '2026-01-01' },
      200: { status: 'approved', approvedOn: '2026-06-01' }
    }
  })

const ACCREDITATION_2026 = exporterAccreditation(
  PREVIOUS_YEAR_ACCREDITATION_NUMBER,
  PREVIOUS_YEAR
)
const ACCREDITATION_2027 = exporterAccreditation(ACCREDITATION_NUMBER, YEAR)

/**
 * @param {{
 *   year: import('#common/helpers/dates/year.js').Year,
 *   processingType: import('#domain/summary-logs/meta-fields.js').ProcessingType,
 *   registration: ReturnType<typeof buildReadExporterRegistration> | ReturnType<typeof buildReadReprocessorRegistration>,
 *   accredited?: boolean,
 *   events?: ReturnType<typeof buildLedgerEvent>[]
 * }} params
 */
const contextFor = ({
  year,
  processingType,
  registration,
  accredited = true,
  events = []
}) => {
  const accreditation = accredited
    ? (accreditationForYear(registration, year) ?? null)
    : null
  return summaryLogContextOf({
    ledgerRepository: createInMemoryLedgerRepository(
      /** @type {LedgerEvent[]} */ (events.map((event) => partialMock(event)))
    )(),
    summaryLog: {
      organisationNumber,
      registrationNumber,
      accreditationNumber: accreditation?.accreditationNumber ?? null,
      year
    },
    registration: { registrationNumber, registration, accreditation },
    processingType
  })
}

/** @param {...ReturnType<typeof exporterAccreditation>} accreditations */
const exporterRegistration = (...accreditations) =>
  buildReadExporterRegistration({
    accreditations: accreditationsByYear(...accreditations)
  })

/** @param {Record<string, unknown>} overrides */
const previousYearEvent = (overrides) =>
  buildLedgerEvent({
    accreditationNumber: PREVIOUS_YEAR_ACCREDITATION_NUMBER,
    year: PREVIOUS_YEAR,
    ...overrides
  })

describe('summaryLogContextOf', () => {
  it('hashes a 2026 accredited exporter context as it did before the previous year was added', async () => {
    const { context } = await contextFor({
      year: PREVIOUS_YEAR,
      processingType: PROCESSING_TYPES.EXPORTER,
      registration: exporterRegistration(ACCREDITATION_2026)
    })

    expect(hashClassificationContext(context)).toBe(
      '1026bf230e28907fb685d39bc3ccc2fa55e202116c5dbfc77b80c4af94a6659c'
    )
  })

  it("gives a 2027 accredited exporter the 2026 accreditation and the 2026 stream's latest submission", async () => {
    const { context, previousYearSubmission } = await contextFor({
      year: YEAR,
      processingType: PROCESSING_TYPES.EXPORTER,
      registration: exporterRegistration(
        ACCREDITATION_2026,
        ACCREDITATION_2027
      ),
      events: [
        previousYearEvent({ number: 1 }),
        previousYearEvent({
          number: 2,
          payload: { summaryLogId: 'log-2026-b', creditTotal: 90 }
        }),
        buildPrnCreatedEvent({
          accreditationNumber: PREVIOUS_YEAR_ACCREDITATION_NUMBER,
          year: PREVIOUS_YEAR,
          number: 3
        })
      ]
    })

    expect(context).toMatchObject({
      previousYearAccreditation: validityOf(ACCREDITATION_2026),
      previousYearPosition: 2
    })
    expect(previousYearSubmission).toEqual({
      number: 2,
      summaryLogId: 'log-2026-b',
      ledgerId: {
        organisationNumber,
        registrationNumber,
        accreditationNumber: PREVIOUS_YEAR_ACCREDITATION_NUMBER,
        year: PREVIOUS_YEAR
      }
    })
  })

  it('gives a 2027 accredited exporter with no 2026 accreditation neither a 2026 accreditation nor a position', async () => {
    const { context, previousYearSubmission } = await contextFor({
      year: YEAR,
      processingType: PROCESSING_TYPES.EXPORTER,
      registration: exporterRegistration(ACCREDITATION_2027),
      events: [
        buildLedgerEvent({ accreditationNumber: null, year: PREVIOUS_YEAR })
      ]
    })

    expect(context).toMatchObject({
      previousYearAccreditation: null,
      previousYearPosition: null
    })
    expect(previousYearSubmission).toBeNull()
  })

  it('gives a 2027 registered-only exporter the 2026 registered-only position and no 2026 accreditation', async () => {
    const { context } = await contextFor({
      year: YEAR,
      processingType: PROCESSING_TYPES.EXPORTER_REGISTERED_ONLY,
      registration: exporterRegistration(ACCREDITATION_2026),
      accredited: false,
      events: [
        previousYearEvent({ number: 1 }),
        buildLedgerEvent({
          accreditationNumber: null,
          year: PREVIOUS_YEAR,
          number: 4
        })
      ]
    })

    expect(context.previousYearPosition).toBe(4)
    expect(context).not.toHaveProperty('previousYearAccreditation')
  })

  it('leaves the previous year out for a 2027 template that does not link years', async () => {
    const { context, previousYearSubmission } = await contextFor({
      year: YEAR,
      processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
      registration: buildReadReprocessorRegistration({
        accreditations: accreditationsByYear(
          buildReadAccreditation({
            accreditationNumber: PREVIOUS_YEAR_ACCREDITATION_NUMBER,
            year: PREVIOUS_YEAR
          }),
          buildReadAccreditation({
            accreditationNumber: ACCREDITATION_NUMBER,
            year: YEAR
          })
        )
      }),
      events: [previousYearEvent({ number: 1 })]
    })

    expect(context).not.toHaveProperty('previousYearPosition')
    expect(context).not.toHaveProperty('previousYearAccreditation')
    expect(previousYearSubmission).toBeNull()
  })
})
