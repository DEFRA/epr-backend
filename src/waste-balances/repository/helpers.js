import { validateAccreditationId } from './validation.js'
import { performUpdateViaStream } from '../application/update-via-stream.js'
import { randomUUID } from 'node:crypto'
import {
  classifyRow,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'

/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */

/**
 * Determines if a record should be included based on schema validation.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord} record - The waste record
 * @returns {boolean} Whether the record passes validation
 */
const isRecordValid = (record) => {
  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )

  if (!schema) {
    return true
  }

  const { outcome } = classifyRow(record.data, schema)
  return outcome === ROW_OUTCOME.INCLUDED
}

/**
 * Create a new waste balance shell document. Amounts stay at zero on the
 * document; reads resolve them from the stream's closing balance.
 *
 * @param {string} accreditationId
 * @param {string} organisationId
 * @returns {import('../domain/model.js').WasteBalance}
 */
const createNewWasteBalance = (accreditationId, organisationId) => ({
  id: randomUUID(),
  accreditationId,
  organisationId,
  amount: 0,
  availableAmount: 0,
  version: 0,
  schemaVersion: 1
})

/**
 * Marks each waste record as excluded or included in the waste balance.
 * Excluded records are still passed downstream so that any existing credits
 * can be reversed.
 *
 * @param {import('#domain/waste-records/model.js').WasteRecord[]} wasteRecords
 * @returns {import('#domain/waste-records/model.js').WasteRecord[]}
 */
export const markExcludedRecords = (wasteRecords) => {
  return wasteRecords.map((record) => ({
    ...record,
    excludedFromWasteBalance: !isRecordValid(record)
  }))
}

const dispatchToStream = async ({
  annotatedRecords,
  accreditation,
  validatedAccreditationId,
  dependencies,
  user,
  overseasSites,
  summaryLogId
}) => {
  await performUpdateViaStream({
    wasteRecords: annotatedRecords,
    accreditation: { ...accreditation, id: validatedAccreditationId },
    streamRepository:
      /** @type {import('./stream-port.js').WasteBalanceStreamRepository} */ (
        dependencies.streamRepository
      ),
    dependencies: {
      systemLogsRepository: dependencies.systemLogsRepository
    },
    user: /** @type {import('#domain/summary-logs/worker/port.js').SubmitUser} */ (
      user
    ),
    overseasSites,
    summaryLogId: /** @type {string} */ (summaryLogId)
  })
}

/**
 * First write for a brand new accreditation: create a shell balance document
 * so findByAccreditationId returns something and resolveBalanceAmounts can read
 * registrationId to query the stream, then dispatch the credit events.
 */
const createBalanceAndDispatch = async ({
  annotatedRecords,
  accreditation,
  validatedAccreditationId,
  dependencies,
  saveBalance,
  user,
  overseasSites,
  summaryLogId
}) => {
  const newBalance = {
    ...createNewWasteBalance(
      validatedAccreditationId,
      annotatedRecords[0]?.organisationId
    ),
    registrationId: annotatedRecords[0]?.registrationId
  }
  await saveBalance(newBalance)
  await dispatchToStream({
    annotatedRecords,
    accreditation,
    validatedAccreditationId,
    dependencies,
    user,
    overseasSites,
    summaryLogId
  })
}

/**
 * Shared logic for crediting a waste balance from summary-log waste records.
 * The balance-affecting changes are appended to the event-sourced stream; an
 * accreditation with no balance document yet has its shell created first so the
 * stream read path can resolve it by partition.
 *
 * @param {Object} params
 * @param {import('#domain/waste-records/model.js').WasteRecord[] | any[]} params.wasteRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation} params.accreditation
 * @param {Object} params.dependencies
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} params.dependencies.streamRepository
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance) => Promise<void>} params.saveBalance
 * @param {import('#domain/summary-logs/worker/port.js').SubmitUser} [params.user]
 * @param {OverseasSitesContext} params.overseasSites - Resolved ORS lookup map or ORS_VALIDATION_DISABLED
 * @param {string} [params.summaryLogId]
 */
export const performUpdateWasteBalanceTransactions = async ({
  wasteRecords,
  accreditation,
  dependencies,
  findBalance,
  saveBalance,
  user,
  overseasSites,
  summaryLogId
}) => {
  const annotatedRecords = markExcludedRecords(wasteRecords)

  if (annotatedRecords.length === 0) {
    return
  }

  const validatedAccreditationId = validateAccreditationId(accreditation.id)

  const existingBalance = await findBalance(validatedAccreditationId)

  if (existingBalance) {
    await dispatchToStream({
      annotatedRecords,
      accreditation,
      validatedAccreditationId,
      dependencies,
      user,
      overseasSites,
      summaryLogId
    })
    return
  }

  await createBalanceAndDispatch({
    annotatedRecords,
    accreditation,
    validatedAccreditationId,
    dependencies,
    saveBalance,
    user,
    overseasSites,
    summaryLogId
  })
}
