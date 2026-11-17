import { afterEach, beforeEach, describe, expect, vi } from 'vitest'
import { it } from '#vite/fixtures/organisation-read-mongo.js'

import { toYear } from '#common/helpers/dates/year.js'
import { toYearMonth } from '#common/helpers/dates/year-month.js'
import { MATERIAL, WASTE_PROCESSING_TYPE } from '#domain/organisations/model.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { buildExternalAccreditationFor } from '#organisation-read-model/repository/contract/test-data.js'
import {
  REPROCESSOR_NUMBER,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryReportsRepository } from '#reports/repository/inmemory.js'
import { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
import { assertPresent, partialMock } from '#test/type-helpers.js'
import { buildReprocessorExporterTable } from './reprocessor-exporter-table.js'

const { buildOrganisation } = createOrganisationBuilders()

const JANUARY_2027 = toYearMonth('2027-01')
const ACCREDITATION_NUMBER_2027 = toAccreditationNumber('A27ER5001180114PL')

describe('buildReprocessorExporterTable with an accreditation held outside epr-backend', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-10') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('counts its operator as accredited, owing and submitting', async ({
    organisationReadRepositoryWith
  }) => {
    const organisation = buildOrganisation({
      registrations: [reprocessor({ material: MATERIAL.PLASTIC })],
      accreditations: []
    })
    const organisationReadRepository = await organisationReadRepositoryWith({
      organisations: [organisation],
      externalAccreditations: [
        buildExternalAccreditationFor(organisation, {
          registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
          accreditationNumber: ACCREDITATION_NUMBER_2027
        })
      ]
    })
    const reportsRepository = createInMemoryReportsRepository()()
    await buildSubmittedReport(reportsRepository, {
      organisationNumber: organisation.organisationNumber,
      registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
      accreditationNumber: ACCREDITATION_NUMBER_2027,
      year: toYear(2027),
      period: 1
    })

    const table = await buildReprocessorExporterTable({
      organisationReadRepository,
      reportsRepository,
      logger: partialMock({ info: vi.fn(), warn: vi.fn() }),
      year: toYear(2027),
      months: [JANUARY_2027],
      now: new Date()
    })

    const january = table.data.months[JANUARY_2027]
    assertPresent(january)
    expect(january.reports).toStrictEqual({ expected: 1, submitted: 1 })
    expect(
      january.figures[MATERIAL.PLASTIC][WASTE_PROCESSING_TYPE.REPROCESSOR]
    ).toMatchObject({ operatorCount: 1, submittingOperatorCount: 1 })
  })
})
