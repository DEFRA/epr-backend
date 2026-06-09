import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { VERSION_STATUS } from '#domain/waste-records/model.js'

/** @import {ValidatedWasteRecord} from '#application/waste-records/transform-from-summary-log.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */

export const SUMMARY_LOG_ID = 'sl-1'

export const accreditedRegistration = /** @type {Registration} */ (
  /** @type {unknown} */ ({ accreditation: { status: 'approved' } })
)

export const registeredOnlyRegistration = /** @type {Registration} */ (
  /** @type {unknown} */ ({})
)

/**
 * @param {object} [overrides]
 * @returns {ValidatedWasteRecord}
 */
export const buildWasteRecord = ({
  rowId = '1000',
  data = { DATE_RECEIVED_FOR_REPROCESSING: '2026-01-15' },
  outcome = ROW_OUTCOME.INCLUDED,
  change = 'CREATED',
  summaryLogId = SUMMARY_LOG_ID,
  tableName = 'RECEIVED_LOADS_FOR_REPROCESSING',
  wasteRecordType = 'received'
} = {}) =>
  /** @type {ValidatedWasteRecord} */ (
    /** @type {unknown} */ ({
      record: {
        organisationId: 'org-1',
        registrationId: 'reg-1',
        rowId,
        type: wasteRecordType,
        data,
        versions: [
          {
            summaryLog: { id: summaryLogId, uri: 's3://bucket/key' },
            status:
              change === 'CREATED'
                ? VERSION_STATUS.CREATED
                : VERSION_STATUS.UPDATED
          }
        ]
      },
      issues: [],
      outcome,
      change,
      tableName,
      wasteRecordType
    })
  )
