import { validateAccreditationId } from './validation.js'
import { calculateWasteBalanceUpdates } from '../application/calculator.js'
import { recordWasteBalanceUpdateAudit } from '../application/audit.js'
import { performUpdateViaStream } from '../application/update-via-stream.js'
import { randomUUID } from 'node:crypto'
import {
  classifyRow,
  ROW_OUTCOME
} from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { findSchemaForProcessingType } from '#domain/summary-logs/table-schemas/index.js'

/** @import {OverseasSitesContext} from '#domain/summary-logs/table-schemas/validation-pipeline.js' */
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'

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
 * Create a new waste balance object.
 *
 * @param {string} accreditationId
 * @param {string} organisationId
 * @returns {import('../domain/model.js').WasteBalance}
 */
export const createNewWasteBalance = (accreditationId, organisationId) => ({
  id: randomUUID(),
  accreditationId,
  organisationId,
  amount: 0,
  availableAmount: 0,
  transactions: [],
  version: 0,
  schemaVersion: 1,
  canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
})

/**
 * Find an existing waste balance or create a new one if allowed.
 *
 * @param {Object} params
 * @param {(id: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {string} params.accreditationId
 * @param {string} [params.organisationId]
 * @param {boolean} params.shouldCreate
 * @returns {Promise<import('../domain/model.js').WasteBalance | null>}
 */
export const findOrCreateWasteBalance = async ({
  findBalance,
  accreditationId,
  organisationId,
  shouldCreate
}) => {
  const wasteBalance = await findBalance(accreditationId)

  if (wasteBalance) {
    return wasteBalance
  }

  if (!shouldCreate || !organisationId) {
    return null
  }

  return createNewWasteBalance(accreditationId, organisationId)
}

/**
 * Marks each waste record as excluded or included in the waste balance.
 * Excluded records are still passed to the calculator so that any existing
 * credits can be reversed via the delta mechanism.
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

const calculateAndApplyUpdates = async (
  validRecords,
  validatedAccreditationId,
  accreditation,
  findBalance,
  user,
  overseasSites
) => {
  const wasteBalance = await findOrCreateWasteBalance({
    findBalance,
    accreditationId: validatedAccreditationId,
    organisationId: validRecords[0]?.organisationId,
    shouldCreate: true
  })

  if (!wasteBalance) {
    return null
  }

  const { newTransactions, newAmount, newAvailableAmount } =
    calculateWasteBalanceUpdates({
      currentBalance: wasteBalance,
      wasteRecords: validRecords,
      accreditation,
      user,
      overseasSites
    })

  if (newTransactions.length === 0) {
    return null
  }

  return {
    updatedBalance: {
      ...wasteBalance,
      amount: newAmount,
      availableAmount: newAvailableAmount,
      transactions: [...(wasteBalance.transactions || []), ...newTransactions],
      version: (wasteBalance.version || 0) + 1
    },
    newTransactions
  }
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
  return performUpdateViaStream({
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
 * Shared logic for updating waste balance transactions.
 *
 * Dispatches on the per-accreditation `canonicalSource` marker, gated by
 * `streamRepository` presence (matching the PRN write paths in helpers-prn):
 * - marker `'ledger'` and streamRepository available — event stream path
 * - marker `'embedded'`, `'migrating'`, no balance yet, or no streamRepository
 *   — embedded `transactions[]` array
 *
 * `'migrating'` deliberately routes to the embedded path: a per-accreditation
 * rebuild that flipped the marker via `flipCanonicalSourceToMigrating` keeps
 * the embedded write path live for PRN operations during the replay window.
 *
 * The marker drives per-accreditation rollout: a freshly enabled environment
 * keeps every accreditation on the embedded array until a rebuild replays
 * authoritative history into the stream and flips the marker. Both paths
 * preserve audit emission.
 *
 * @param {Object} params
 * @param {import('#domain/waste-records/model.js').WasteRecord[] | any[]} params.wasteRecords
 * @param {import('#domain/organisations/accreditation.js').Accreditation} params.accreditation
 * @param {Object} params.dependencies
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [params.dependencies.systemLogsRepository]
 * @param {import('../repository/stream-port.js').WasteBalanceStreamRepository} [params.dependencies.streamRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [params.dependencies.featureFlags]
 * @param {(accreditationId: string) => Promise<import('../domain/model.js').WasteBalance | null>} params.findBalance
 * @param {(balance: import('../domain/model.js').WasteBalance, newTransactions: any[], user?: any) => Promise<void>} params.saveBalance
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

  if (dependencies.streamRepository) {
    const existingBalance = await findBalance(validatedAccreditationId)
    if (
      existingBalance?.canonicalSource === WASTE_BALANCE_CANONICAL_SOURCE.LEDGER
    ) {
      const closingBalance = await dispatchToStream({
        annotatedRecords,
        accreditation,
        validatedAccreditationId,
        dependencies,
        user,
        overseasSites,
        summaryLogId
      })
      if (closingBalance) {
        await saveBalance(
          {
            ...existingBalance,
            amount: closingBalance.amount,
            availableAmount: closingBalance.availableAmount,
            version: (existingBalance.version || 0) + 1
          },
          []
        )
      }
      return
    }

    // Brand new accreditation with ledger flag on: dispatch to stream first,
    // then create the balance doc with the closing balance from the event.
    // Without this, the first write would create an embedded doc that
    // marker-aware-read would never consult (it reads from the stream for
    // ledger docs), silently losing the first submission's data.
    if (
      !existingBalance &&
      dependencies.featureFlags?.isWasteBalanceLedgerEnabled()
    ) {
      const closingBalance = await dispatchToStream({
        annotatedRecords,
        accreditation,
        validatedAccreditationId,
        dependencies,
        user,
        overseasSites,
        summaryLogId
      })
      const newBalance = {
        ...createNewWasteBalance(
          validatedAccreditationId,
          annotatedRecords[0]?.organisationId
        ),
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
        registrationId: annotatedRecords[0]?.registrationId,
        ...(closingBalance && {
          amount: closingBalance.amount,
          availableAmount: closingBalance.availableAmount
        })
      }
      await saveBalance(newBalance, [])
      return
    }
  }

  const result = await calculateAndApplyUpdates(
    annotatedRecords,
    validatedAccreditationId,
    accreditation,
    findBalance,
    user,
    overseasSites
  )

  if (!result) {
    return
  }

  const { updatedBalance, newTransactions } = result

  await saveBalance(updatedBalance, newTransactions)

  await recordWasteBalanceUpdateAudit({
    systemLogsRepository: dependencies.systemLogsRepository,
    accreditationId: updatedBalance.accreditationId,
    amount: updatedBalance.amount,
    availableAmount: updatedBalance.availableAmount,
    newTransactions,
    user: /** @type {import('#domain/summary-logs/worker/port.js').SubmitUser} */ (
      user
    )
  })
}
