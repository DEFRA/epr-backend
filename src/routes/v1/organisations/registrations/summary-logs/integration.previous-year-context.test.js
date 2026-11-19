import { http, HttpResponse } from 'msw'
import { onTestFinished } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { toAccreditationNumber } from '#domain/organisations/numbers.js'
import {
  SUMMARY_LOG_STATUS,
  UPLOAD_STATUS
} from '#domain/summary-logs/status.js'
import { config } from '#root/config.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'

import {
  asOperator,
  buildGetUrl,
  buildPostUrl,
  buildSubmitUrl,
  createExporterRowValues,
  createRegisteredOnlyMeta,
  createReprocessorReceivedRowValues,
  createUploadPayload,
  createWasteBalanceMeta,
  EXPORTER_HEADERS,
  pollForValidation,
  pollWhileStatus,
  REPROCESSOR_RECEIVED_HEADERS,
  setupWasteBalanceIntegrationEnvironment,
  tableOf
} from './integration-test-helpers.js'

const PREVIOUS_YEAR = toYear(2026)
const YEAR = toYear(2027)
const PREVIOUS_YEAR_ACCREDITATION_NUMBER = toAccreditationNumber('ACC-122')

const openYear2027 = () => {
  config.set('openNextYear', true)
  onTestFinished(() => config.reset('openNextYear'))
}

const withTemplateVersion = (meta, value) => ({
  ...meta,
  TEMPLATE_VERSION: { ...meta.TEMPLATE_VERSION, value }
})

const withAccreditationNumber = (meta, value) => ({
  ...meta,
  ACCREDITATION_NUMBER: { ...meta.ACCREDITATION_NUMBER, value }
})

const exporterLoads2026 = (exportTonnage) => ({
  RECEIVED_LOADS_FOR_EXPORT: {
    location: { sheet: 'Exported (sections 1, 2 and 3)', row: 7, column: 'A' },
    headers: EXPORTER_HEADERS,
    rows: [
      {
        rowNumber: 8,
        values: createExporterRowValues({ rowId: 1500, exportTonnage })
      }
    ]
  }
})

const exporterLoads2027 = {
  RECEIVED_LOADS_FOR_EXPORT: {
    location: { sheet: 'Exported (sections 1, 2 and 3)', row: 7, column: 'A' },
    headers: [
      ...EXPORTER_HEADERS,
      'PREVIOUS_YEAR_ROW_ID',
      'EXIT_PORT',
      'DWT_EXPORT_ID',
      'DWT_SUPPLY_ID'
    ],
    rows: [
      {
        rowNumber: 8,
        values: [
          ...createExporterRowValues({
            rowId: 1001,
            dateReceived: '2027-01-15T00:00:00.000Z',
            dateReceivedByOsr: '2027-01-18T00:00:00.000Z',
            exportDate: '2027-01-20T00:00:00.000Z'
          }),
          null,
          null,
          null,
          null
        ]
      }
    ]
  }
}

const accreditedExporterLog = (year, exportTonnage = 100) =>
  year === PREVIOUS_YEAR
    ? {
        meta: withAccreditationNumber(
          createWasteBalanceMeta('EXPORTER'),
          PREVIOUS_YEAR_ACCREDITATION_NUMBER
        ),
        data: exporterLoads2026(exportTonnage)
      }
    : {
        meta: withTemplateVersion(createWasteBalanceMeta('EXPORTER'), 2027.01),
        data: exporterLoads2027
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
        meta: withTemplateVersion(
          createRegisteredOnlyMeta('EXPORTER_REGISTERED_ONLY'),
          2027.01
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

const reprocessorLog = (year, tonnageReceived = 100) => ({
  meta:
    year === PREVIOUS_YEAR
      ? withAccreditationNumber(
          createWasteBalanceMeta('REPROCESSOR_INPUT'),
          PREVIOUS_YEAR_ACCREDITATION_NUMBER
        )
      : withTemplateVersion(
          createWasteBalanceMeta('REPROCESSOR_INPUT'),
          2027.01
        ),
  data: {
    RECEIVED_LOADS_FOR_REPROCESSING: {
      location: { sheet: 'Received', row: 7, column: 'A' },
      headers:
        year === PREVIOUS_YEAR
          ? REPROCESSOR_RECEIVED_HEADERS
          : [...REPROCESSOR_RECEIVED_HEADERS, 'DWT_SUPPLY_ID'],
      rows: [
        {
          rowNumber: 8,
          values: [
            ...createReprocessorReceivedRowValues({
              rowId: 1001,
              dateReceived: `${year}-01-15T00:00:00.000Z`,
              tonnageReceived
            }),
            ...(year === PREVIOUS_YEAR ? [] : [null])
          ]
        }
      ]
    }
  }
})

const upload = async (env, year, summaryLogId, parsed) => {
  const fileId = `file-${summaryLogId}`
  env.fileDataMap[fileId] = parsed
  await env.server.inject({
    method: 'POST',
    url: buildPostUrl(summaryLogId, { accredited: env.accredited, year }),
    payload: createUploadPayload(
      env.organisationId,
      env.registrationId,
      UPLOAD_STATUS.COMPLETE,
      fileId,
      `${fileId}.xlsx`
    )
  })
  await pollForValidation(env.server, summaryLogId)
  const response = await env.server.inject({
    method: 'GET',
    url: buildGetUrl(summaryLogId),
    ...asOperator()
  })
  return JSON.parse(response.payload).status
}

const submit = async (env, summaryLogId) => {
  const response = await env.server.inject({
    method: 'POST',
    url: buildSubmitUrl(summaryLogId),
    ...asOperator()
  })
  const status = await pollWhileStatus(env.server, summaryLogId, {
    waitWhile: SUMMARY_LOG_STATUS.SUBMITTING
  })
  return { response, status }
}

const submitted = async (env, year, summaryLogId, parsed) => {
  expect(await upload(env, year, summaryLogId, parsed)).toBe(
    SUMMARY_LOG_STATUS.VALIDATED
  )
  expect((await submit(env, summaryLogId)).status).toBe(
    SUMMARY_LOG_STATUS.SUBMITTED
  )
}

const expectSupersededAsContextChanged = ({ response, status }) => {
  expect(response.statusCode).toBe(409)
  expect(JSON.parse(response.payload).reason).toBe('context_changed')
  expect(status).toBe(SUMMARY_LOG_STATUS.SUPERSEDED)
}

describe('2027 summary logs and the previous year position', () => {
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
      openYear2027()
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

      expectSupersededAsContextChanged(await submit(env, 'log-2027'))
    })

    it('has the 2027 log uploaded again when 2026 is first submitted between its upload and its submission', async () => {
      openYear2027()
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

      expectSupersededAsContextChanged(await submit(env, 'log-2027'))
    })

    it('submits the 2027 log when 2026 is unchanged since its upload', async () => {
      openYear2027()
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
      expect((await submit(env, 'log-2027')).status).toBe(
        SUMMARY_LOG_STATUS.SUBMITTED
      )
    })
  })

  it('submits an accredited exporter 2027 log whatever 2026 registered-only submissions happen meanwhile', async () => {
    openYear2027()
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

    expect((await submit(env, 'log-2027')).status).toBe(
      SUMMARY_LOG_STATUS.SUBMITTED
    )
  })

  it('has a registered-only exporter upload 2027 again when 2026 is resubmitted between its upload and its submission', async () => {
    openYear2027()
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

    expectSupersededAsContextChanged(await submit(env, 'log-2027'))
  })

  it('submits a 2027 log whose template does not link years after a 2026 resubmission', async () => {
    openYear2027()
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

    expect((await submit(env, 'log-2027')).status).toBe(
      SUMMARY_LOG_STATUS.SUBMITTED
    )
  })
})
