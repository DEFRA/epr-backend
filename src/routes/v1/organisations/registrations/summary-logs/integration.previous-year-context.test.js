import { http, HttpResponse } from 'msw'

import { toYear } from '#common/helpers/dates/year.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import { SUMMARY_LOG_STATUS } from '#domain/summary-logs/status.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  createExporterRowValues,
  createRegisteredOnlyMeta,
  createReprocessorReceivedRowValues,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  exporter2027Loads,
  openNextYear,
  REPROCESSOR_RECEIVED_HEADERS,
  reprocessorReceivedLoads2027,
  setupWasteBalanceIntegrationEnvironment,
  submitAndWait,
  tableOf,
  uploadAndValidate,
  withTemplateYear
} from './integration-test-helpers.js'

const PREVIOUS_YEAR = toYear(2026)
const YEAR = toYear(2027)
const PREVIOUS_YEAR_ACCREDITATION_NUMBER = toAccreditationNumber('ACC-122')

const withAccreditationNumber = (meta, value) => ({
  ...meta,
  ACCREDITATION_NUMBER: { ...meta.ACCREDITATION_NUMBER, value }
})

const accreditedExporterLog = (year, exportTonnage = 100) =>
  year === PREVIOUS_YEAR
    ? {
        meta: withAccreditationNumber(
          createWasteBalanceMeta('EXPORTER'),
          PREVIOUS_YEAR_ACCREDITATION_NUMBER
        ),
        data: {
          RECEIVED_LOADS_FOR_EXPORT: {
            location: {
              sheet: 'Exported (sections 1, 2 and 3)',
              row: 7,
              column: 'A'
            },
            headers: EXPORTER_HEADERS,
            rows: [
              {
                rowNumber: 8,
                values: createExporterRowValues({ rowId: 1500, exportTonnage })
              }
            ]
          }
        }
      }
    : {
        meta: withTemplateYear(createWasteBalanceMeta('EXPORTER'), YEAR),
        data: exporter2027Loads([{ rowId: 1001 }])
      }

const registeredOnlyExportedRow = (year, tonnage) => ({
  ROW_ID: 2001,
  TONNAGE_OF_UK_PACKAGING_WASTE_EXPORTED: tonnage,
  DATE_OF_EXPORT: `${year}-01-20T00:00:00.000Z`,
  OSR_ID: 100,
  BASEL_EXPORT_CODE: 'B3020',
  WAS_THE_WASTE_REFUSED: 'No',
  WAS_THE_WASTE_STOPPED: 'No',
  DATE_THE_REFUSED_STOPPED_WASTE_REPATRIATED: null,
  OSR_NAME: 'Overseas Reprocessor A',
  OSR_COUNTRY: 'Vietnam-VN',
  CUSTOMS_CODES: '123456',
  CONTAINER_NUMBER: 'CONT123456'
})

const registeredOnlyExporterLog = (year, tonnage = 9.5) =>
  year === PREVIOUS_YEAR
    ? {
        meta: createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
        data: {
          LOADS_EXPORTED: tableOf('Exported', [
            registeredOnlyExportedRow(year, tonnage)
          ])
        }
      }
    : {
        meta: withTemplateYear(
          createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
          YEAR
        ),
        data: {
          LOADS_EXPORTED: tableOf('Exported', [
            {
              ...registeredOnlyExportedRow(year, tonnage),
              PREVIOUS_YEAR_ROW_ID: null,
              EXIT_PORT: null,
              DWT_EXPORT_ID: null
            }
          ])
        }
      }

const reprocessorLog = (year, tonnageReceived = 100) =>
  year === PREVIOUS_YEAR
    ? {
        meta: withAccreditationNumber(
          createWasteBalanceMeta('REPROCESSOR_INPUT'),
          PREVIOUS_YEAR_ACCREDITATION_NUMBER
        ),
        data: {
          RECEIVED_LOADS_FOR_REPROCESSING: {
            location: { sheet: 'Received', row: 7, column: 'A' },
            headers: REPROCESSOR_RECEIVED_HEADERS,
            rows: [
              {
                rowNumber: 8,
                values: createReprocessorReceivedRowValues({
                  rowId: 1001,
                  dateReceived: '2026-01-15T00:00:00.000Z',
                  tonnageReceived
                })
              }
            ]
          }
        }
      }
    : {
        meta: withTemplateYear(
          createWasteBalanceMeta('REPROCESSOR_INPUT'),
          YEAR
        ),
        data: reprocessorReceivedLoads2027([{ rowId: 1001, tonnageReceived }])
      }

const upload = async (env, year, summaryLogId, parsed) =>
  (
    await uploadAndValidate(
      env,
      { summaryLogId, fileId: `file-${summaryLogId}`, year },
      parsed
    )
  ).status

const submitted = async (env, year, summaryLogId, parsed) => {
  expect(await upload(env, year, summaryLogId, parsed)).toBe(
    SUMMARY_LOG_STATUS.VALIDATED
  )
  expect((await submitAndWait(env, summaryLogId)).status).toBe(
    SUMMARY_LOG_STATUS.SUBMITTED
  )
}

const expectSupersededAsContextChanged = ({ response, status }) => {
  expect(response.statusCode).toBe(409)
  expect(JSON.parse(response.payload).reason).toBe('context_changed')
  expect(status).toBe(SUMMARY_LOG_STATUS.SUPERSEDED)
}

/**
 * From now on the read model serves the registration's 2026 accreditation as
 * suspended from 1 November 2026.
 */
const suspendPreviousYearAccreditation = (env) => {
  const { organisationReadRepository, registrationNumber } = env
  const served = organisationReadRepository.findByOrganisationNumber
  vi.spyOn(
    organisationReadRepository,
    'findByOrganisationNumber'
  ).mockImplementation(async (...args) => {
    const organisation = await served(...args)
    const previousYearAccreditation =
      organisation.registrations[registrationNumber]?.accreditations[
        PREVIOUS_YEAR
      ]
    if (previousYearAccreditation) {
      const { status } = previousYearAccreditation
      status.current = 'suspended'
      status.timeline.push({
        status: 'suspended',
        at: '2026-11-01T00:00:00.000Z'
      })
    }
    return organisation
  })
}

describe('2027 summary logs and the previous year', () => {
  const { getServer } = setupAuthContext()

  beforeEach(() => {
    getServer().use(
      http.post(
        'http://localhost:3001/v1/organisations/:orgId/registrations/:regId/summary-logs/:summaryLogId/upload-completed',
        () => HttpResponse.json({ success: true }, { status: 200 })
      )
    )
  })

  describe('an accredited exporter accredited in both years', () => {
    const setup = () =>
      setupWasteBalanceIntegrationEnvironment({
        processingType: 'exporter',
        year: YEAR,
        previousYearAccreditationNumber: PREVIOUS_YEAR_ACCREDITATION_NUMBER
      })

    it('has the 2027 log uploaded again when 2026 is resubmitted between its upload and its submission', async () => {
      openNextYear()
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accreditedExporterLog(PREVIOUS_YEAR)
      )

      expect(
        await upload(env, YEAR, 'log-2027', accreditedExporterLog(YEAR))
      ).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026-b',
        accreditedExporterLog(PREVIOUS_YEAR, 90)
      )

      expectSupersededAsContextChanged(await submitAndWait(env, 'log-2027'))
    })

    it('has the 2027 log uploaded again when 2026 is first submitted between its upload and its submission', async () => {
      openNextYear()
      const env = await setup()

      expect(
        await upload(env, YEAR, 'log-2027', accreditedExporterLog(YEAR))
      ).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accreditedExporterLog(PREVIOUS_YEAR)
      )

      expectSupersededAsContextChanged(await submitAndWait(env, 'log-2027'))
    })

    it('has the 2027 log uploaded again when the 2026 accreditation changes between its upload and its submission', async () => {
      openNextYear()
      const env = await setup()

      expect(
        await upload(env, YEAR, 'log-2027', accreditedExporterLog(YEAR))
      ).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      suspendPreviousYearAccreditation(env)

      expectSupersededAsContextChanged(await submitAndWait(env, 'log-2027'))
    })

    it('submits the 2027 log when 2026 is unchanged since its upload', async () => {
      openNextYear()
      const env = await setup()
      await submitted(
        env,
        PREVIOUS_YEAR,
        'log-2026',
        accreditedExporterLog(PREVIOUS_YEAR)
      )

      expect(
        await upload(env, YEAR, 'log-2027', accreditedExporterLog(YEAR))
      ).toBe(SUMMARY_LOG_STATUS.VALIDATED)
      expect((await submitAndWait(env, 'log-2027')).status).toBe(
        SUMMARY_LOG_STATUS.SUBMITTED
      )
    })
  })

  it('submits an accredited exporter 2027 log whatever 2026 registered-only submissions happen meanwhile', async () => {
    openNextYear()
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      year: YEAR
    })

    expect(
      await upload(env, YEAR, 'log-2027', accreditedExporterLog(YEAR))
    ).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    await submitted(
      { ...env, accredited: false },
      PREVIOUS_YEAR,
      'log-2026-registered-only',
      registeredOnlyExporterLog(PREVIOUS_YEAR)
    )

    expect((await submitAndWait(env, 'log-2027')).status).toBe(
      SUMMARY_LOG_STATUS.SUBMITTED
    )
  })

  it('has a registered-only exporter upload 2027 again when 2026 is resubmitted between its upload and its submission', async () => {
    openNextYear()
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'exporter',
      accredited: false,
      year: YEAR
    })
    await submitted(
      env,
      PREVIOUS_YEAR,
      'log-2026',
      registeredOnlyExporterLog(PREVIOUS_YEAR)
    )

    expect(
      await upload(env, YEAR, 'log-2027', registeredOnlyExporterLog(YEAR))
    ).toBe(SUMMARY_LOG_STATUS.VALIDATED)
    await submitted(
      env,
      PREVIOUS_YEAR,
      'log-2026-b',
      registeredOnlyExporterLog(PREVIOUS_YEAR, 8.5)
    )

    expectSupersededAsContextChanged(await submitAndWait(env, 'log-2027'))
  })

  it('submits a 2027 log whose template does not link years after a 2026 resubmission', async () => {
    openNextYear()
    const env = await setupWasteBalanceIntegrationEnvironment({
      processingType: 'reprocessor',
      year: YEAR,
      previousYearAccreditationNumber: PREVIOUS_YEAR_ACCREDITATION_NUMBER
    })
    await submitted(
      env,
      PREVIOUS_YEAR,
      'log-2026',
      reprocessorLog(PREVIOUS_YEAR)
    )

    expect(await upload(env, YEAR, 'log-2027', reprocessorLog(YEAR))).toBe(
      SUMMARY_LOG_STATUS.VALIDATED
    )
    await submitted(
      env,
      PREVIOUS_YEAR,
      'log-2026-b',
      reprocessorLog(PREVIOUS_YEAR, 90)
    )

    expect((await submitAndWait(env, 'log-2027')).status).toBe(
      SUMMARY_LOG_STATUS.SUBMITTED
    )
  })
})
