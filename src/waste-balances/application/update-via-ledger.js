import {
  abs,
  add,
  equals,
  greaterThan,
  subtract,
  toNumber
} from '#common/helpers/decimal-utils.js'
import {
  isPayloadSmallEnoughToAudit,
  safeAudit
} from '#root/auditing/helpers.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'
import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'

import {
  LEDGER_SOURCE_KIND,
  LEDGER_TRANSACTION_TYPE
} from '../repository/ledger-schema.js'
import { appendToLedger } from './append-to-ledger.js'

/**
 * Build the unique identifier we key ledger transactions by. The waste-records
 * collection identifies a row by `(organisationId, registrationId, type, rowId)`
 * and the ledger transactions are already scoped by accreditation, so combining
 * `type` and `rowId` is enough to dodge the PAE-1380 collision class without
 * exposing the underlying Mongo `_id`.
 *
 * @param {{ type: string, rowId: string | number }} record
 */
export const wasteRecordIdFor = (record) => `${record.type}:${record.rowId}`

const targetAmountFor = (record, accreditation, overseasSites) => {
  if (record.excludedFromWasteBalance) {
    return 0
  }

  const schema = findSchemaForProcessingType(
    record.data?.processingType,
    record.type
  )

  if (!schema?.classifyForWasteBalance) {
    return 0
  }

  const result = schema.classifyForWasteBalance(record.data, {
    accreditation,
    overseasSites
  })

  return result.outcome === ROW_OUTCOME.INCLUDED ? result.transactionAmount : 0
}

/**
 * @param {object} record
 * @param {object} accreditation
 * @param {*} overseasSites
 * @param {Map<string, number>} alreadyCreditedByWasteRecordId
 */
const builderFor = (
  record,
  accreditation,
  overseasSites,
  alreadyCreditedByWasteRecordId
) => {
  const targetAmount = targetAmountFor(record, accreditation, overseasSites)
  const wasteRecordId = wasteRecordIdFor(record)
  const alreadyCredited = /** @type {number} */ (
    alreadyCreditedByWasteRecordId.get(wasteRecordId)
  )

  const delta = subtract(targetAmount, alreadyCredited)
  if (equals(delta, 0)) {
    return null
  }

  const isCredit = greaterThan(delta, 0)
  const amount = toNumber(abs(delta))
  const latestVersion = record.versions[record.versions.length - 1]
  const createdBy = record.updatedBy
    ? { id: record.updatedBy.id, name: record.updatedBy.name }
    : undefined

  return (latest) => {
    const closingAmount = isCredit
      ? toNumber(add(latest.closingBalance.amount, amount))
      : toNumber(subtract(latest.closingBalance.amount, amount))
    const closingAvailableAmount = isCredit
      ? toNumber(add(latest.closingBalance.availableAmount, amount))
      : toNumber(subtract(latest.closingBalance.availableAmount, amount))

    return {
      type: isCredit
        ? LEDGER_TRANSACTION_TYPE.CREDIT
        : LEDGER_TRANSACTION_TYPE.DEBIT,
      amount,
      openingBalance: { ...latest.closingBalance },
      closingBalance: {
        amount: closingAmount,
        availableAmount: closingAvailableAmount
      },
      source: {
        kind: LEDGER_SOURCE_KIND.SUMMARY_LOG_ROW,
        summaryLogRow: {
          summaryLogId: latestVersion.summaryLog.id,
          rowId: String(record.rowId),
          rowType: record.type,
          wasteRecordId,
          wasteRecordVersionId: latestVersion.id
        }
      },
      createdAt: new Date(),
      createdBy
    }
  }
}

const recordLedgerAuditLogs = async ({
  systemLogsRepository,
  accreditationId,
  closingBalance,
  newTransactions,
  user
}) => {
  if (!user?.id && !user?.email) {
    return
  }

  const payload = {
    event: {
      category: 'waste-reporting',
      subCategory: 'waste-balance',
      action: 'update'
    },
    context: {
      accreditationId,
      amount: closingBalance.amount,
      availableAmount: closingBalance.availableAmount,
      newTransactions
    },
    user
  }

  const safeAuditingPayload = isPayloadSmallEnoughToAudit(payload)
    ? payload
    : {
        ...payload,
        context: {
          accreditationId,
          amount: closingBalance.amount,
          availableAmount: closingBalance.availableAmount,
          transactionCount: newTransactions.length
        }
      }

  safeAudit(safeAuditingPayload)

  if (systemLogsRepository) {
    await systemLogsRepository.insert({
      createdAt: new Date(),
      createdBy: user,
      event: payload.event,
      context: payload.context
    })
  }
}

/**
 * Migrate the summary-log row write path onto the ledger.
 *
 * Reads the running credited amount per `wasteRecordId` once for the whole
 * batch (idempotency invariant), computes deltas, and appends one
 * transaction per row whose delta is non-zero. A re-upload of identical data
 * appends nothing — the recovery path for partial prior submissions
 * (crashes mid-bulkWrite, summary log stuck in SUBMITTING, etc.) is the
 * operator hitting submit again.
 *
 * Audit emission is preserved: a successful append fires the equivalent of
 * the v1 path's `recordAuditLogs`, so the back-office system-logs view and
 * the CDP audit stream see the same lifecycle they did before the flag.
 *
 * @param {Object} params
 * @param {Array<import('#domain/waste-records/model.js').WasteRecord>} params.wasteRecords
 * @param {{ id: string, validFrom?: string, validTo?: string }} params.accreditation
 * @param {import('../repository/ledger-port.js').LedgerRepository} params.ledgerRepository
 * @param {Object} [params.dependencies]
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {Object} [params.user]
 * @param {*} params.overseasSites
 */
export const performUpdateViaLedger = async ({
  wasteRecords,
  accreditation,
  ledgerRepository,
  dependencies = {},
  user,
  overseasSites
}) => {
  if (wasteRecords.length === 0) {
    return
  }

  const wasteRecordIds = Array.from(new Set(wasteRecords.map(wasteRecordIdFor)))

  const alreadyCreditedByWasteRecordId =
    await ledgerRepository.findCreditedAmountsByWasteRecordIds(wasteRecordIds)

  const builders = []
  for (const record of wasteRecords) {
    const builder = builderFor(
      record,
      accreditation,
      overseasSites,
      alreadyCreditedByWasteRecordId
    )
    if (builder) {
      builders.push(builder)
    }
  }

  if (builders.length === 0) {
    return
  }

  const organisationId = wasteRecords[0]?.organisationId
  const registrationId = wasteRecords[0]?.registrationId

  const newTransactions = await appendToLedger(
    {
      repository: ledgerRepository,
      accreditationId: accreditation.id,
      organisationId,
      registrationId
    },
    builders
  )

  const last = newTransactions[newTransactions.length - 1]

  await recordLedgerAuditLogs({
    systemLogsRepository: dependencies.systemLogsRepository,
    accreditationId: accreditation.id,
    closingBalance: last.closingBalance,
    newTransactions,
    user
  })
}
