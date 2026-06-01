import { validateAccreditationId } from './validation.js'
import { WASTE_BALANCE_CANONICAL_SOURCE } from '../domain/model.js'
import { performUpdateWasteBalanceTransactions } from './helpers.js'
import {
  performAppendPrnStreamEvent,
  performDeductAvailableBalanceForPrnCreation,
  performDeductTotalBalanceForPrnIssue,
  performCreditAvailableBalanceForPrnCancellation,
  performCreditFullBalanceForIssuedPrnCancellation
} from './helpers-prn.js'
import { resolveBalanceAmounts } from './marker-aware-read.js'
import { recordWasteBalanceGrowth } from '../application/growth-observability.js'

const WASTE_BALANCE_COLLECTION_NAME = 'waste-balances'

/**
 * Ensures the collection exists with required indexes.
 * Safe to call multiple times - MongoDB createIndex is idempotent.
 *
 * @param {import('mongodb').Db} db
 * @returns {Promise<import('mongodb').Collection>}
 */
async function ensureCollection(db) {
  const collection = db.collection(WASTE_BALANCE_COLLECTION_NAME)

  // Optimises waste balance lookups by accreditation ID
  // Each accreditation has at most one balance document
  await collection.createIndex({ accreditationId: 1 }, { unique: true })

  return collection
}

const performFindByAccreditationId =
  (db, streamRepository) => async (accreditationId) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)

    const doc = await db
      .collection(WASTE_BALANCE_COLLECTION_NAME)
      .findOne({ accreditationId: validatedAccreditationId })

    if (!doc) {
      return null
    }

    const { _id, ...domainFields } = doc
    return resolveBalanceAmounts(
      structuredClone({ id: _id.toString(), ...domainFields }),
      streamRepository
    )
  }

const performFindByAccreditationIds =
  (db, streamRepository) => async (accreditationIds) => {
    const docs = await db
      .collection(WASTE_BALANCE_COLLECTION_NAME)
      .find({ accreditationId: { $in: accreditationIds } })
      .toArray()

    return Promise.all(
      docs.map((doc) => {
        const { _id, ...domainFields } = doc
        return resolveBalanceAmounts(
          structuredClone({ id: _id.toString(), ...domainFields }),
          streamRepository
        )
      })
    )
  }

const performFlipCanonicalSourceToMigrating =
  (db) =>
  async ({ accreditationId, capturedVersion }) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)
    const collection = db.collection(WASTE_BALANCE_COLLECTION_NAME)
    const updated = await collection.findOneAndUpdate(
      {
        accreditationId: validatedAccreditationId,
        version: capturedVersion,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED
      },
      {
        $set: {
          canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING,
          migratingSince: new Date().toISOString()
        }
      },
      { returnDocument: 'after' }
    )
    if (updated) {
      return { canonicalSource: updated.canonicalSource }
    }
    const current = await collection.findOne(
      { accreditationId: validatedAccreditationId },
      { projection: { canonicalSource: 1 } }
    )
    if (!current) {
      return null
    }
    return { canonicalSource: current.canonicalSource }
  }

const performFlipCanonicalSourceToLedger =
  (db) =>
  async ({ accreditationId, registrationId, capturedVersion }) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)
    const collection = db.collection(WASTE_BALANCE_COLLECTION_NAME)
    const $set = {
      canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.LEDGER,
      ...(registrationId !== undefined && { registrationId })
    }
    const updated = await collection.findOneAndUpdate(
      {
        accreditationId: validatedAccreditationId,
        version: capturedVersion,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      },
      {
        $set,
        $unset: { migratingSince: '' }
      },
      { returnDocument: 'after' }
    )
    if (updated) {
      return { canonicalSource: updated.canonicalSource }
    }
    const current = await collection.findOne(
      { accreditationId: validatedAccreditationId },
      { projection: { canonicalSource: 1 } }
    )
    if (!current) {
      return null
    }
    return { canonicalSource: current.canonicalSource }
  }

const performGetPrnCatchupEvents =
  (db, streamRepository) =>
  async ({ registrationId, accreditationId, prnId, afterEventNumber }) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)
    const doc = await db
      .collection(WASTE_BALANCE_COLLECTION_NAME)
      .findOne(
        { accreditationId: validatedAccreditationId },
        { projection: { canonicalSource: 1 } }
      )
    if (doc?.canonicalSource !== WASTE_BALANCE_CANONICAL_SOURCE.LEDGER) {
      return []
    }
    return streamRepository.findEventsByPrnIdAfter(
      registrationId,
      validatedAccreditationId,
      prnId,
      afterEventNumber
    )
  }

const performResetCanonicalSourceToEmbedded =
  (db) =>
  async ({ accreditationId }) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)
    const collection = db.collection(WASTE_BALANCE_COLLECTION_NAME)
    const updated = await collection.findOneAndUpdate(
      {
        accreditationId: validatedAccreditationId,
        canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.MIGRATING
      },
      {
        $set: { canonicalSource: WASTE_BALANCE_CANONICAL_SOURCE.EMBEDDED },
        $unset: { migratingSince: '' }
      },
      { returnDocument: 'after' }
    )
    if (updated) {
      return { canonicalSource: updated.canonicalSource }
    }
    const current = await collection.findOne(
      { accreditationId: validatedAccreditationId },
      { projection: { canonicalSource: 1 } }
    )
    if (!current) {
      return null
    }
    return { canonicalSource: current.canonicalSource }
  }

/**
 * Find a waste balance by accreditation ID.
 *
 * @param {import('mongodb').Db} db
 * @returns {(id: string) => Promise<import('../domain/model.js').WasteBalance | null>}
 */
export const findBalance = (db) => async (id) => {
  const doc = await db
    .collection(WASTE_BALANCE_COLLECTION_NAME)
    .findOne({ accreditationId: id })

  if (!doc) {
    return null
  }

  const { _id, ...domainFields } = doc
  return /** @type {import('../domain/model.js').WasteBalance} */ (
    structuredClone({ id: _id.toString(), ...domainFields })
  )
}

/**
 * Save a waste balance.
 *
 * The persisted `canonicalSource` is set only on insert via `$setOnInsert` and
 * never on update. The marker is mutated solely by the dedicated lifecycle
 * primitives — `flipCanonicalSourceToMigrating`, `flipCanonicalSourceToLedger`,
 * and `resetCanonicalSourceToEmbedded` — which also own `migratingSince`. Every
 * other write path is `canonicalSource`-blind and never touches
 * `migratingSince`.
 *
 * @param {import('mongodb').Db} db
 * @returns {(updatedBalance: import('../domain/model.js').WasteBalance, newTransactions: any[]) => Promise<void>}
 */
export const saveBalance = (db) => async (updatedBalance, newTransactions) => {
  await db.collection(WASTE_BALANCE_COLLECTION_NAME).updateOne(
    { accreditationId: updatedBalance.accreditationId },
    /** @type {*} */ ({
      $set: {
        amount: updatedBalance.amount,
        availableAmount: updatedBalance.availableAmount,
        version: updatedBalance.version,
        schemaVersion: updatedBalance.schemaVersion
      },
      $push: {
        transactions: { $each: newTransactions }
      },
      $setOnInsert: {
        _id: updatedBalance.id,
        organisationId: updatedBalance.organisationId,
        canonicalSource: updatedBalance.canonicalSource,
        ...(updatedBalance.registrationId !== undefined && {
          registrationId: updatedBalance.registrationId
        })
      }
    }),
    { upsert: true }
  )

  recordWasteBalanceGrowth(updatedBalance, newTransactions)
}

/**
 * Creates a MongoDB-backed waste balances repository
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {Object} dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} dependencies.streamRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [dependencies.systemLogsRepository]
 * @param {import('#feature-flags/feature-flags.port.js').FeatureFlags} [dependencies.featureFlags]
 * @returns {Promise<import('./port.js').WasteBalancesRepositoryFactory>}
 */
export const createWasteBalancesRepository = async (db, dependencies) => {
  await ensureCollection(db)

  const { streamRepository } = dependencies

  return () => ({
    findByAccreditationId: performFindByAccreditationId(db, streamRepository),
    findByAccreditationIds: performFindByAccreditationIds(db, streamRepository),
    updateWasteBalanceTransactions: async (
      wasteRecords,
      { user, accreditation, overseasSites, summaryLogId }
    ) => {
      return performUpdateWasteBalanceTransactions({
        wasteRecords,
        accreditation,
        dependencies,
        findBalance: findBalance(db),
        saveBalance: saveBalance(db),
        user,
        overseasSites,
        summaryLogId
      })
    },
    deductAvailableBalanceForPrnCreation: async (deductParams) => {
      return performDeductAvailableBalanceForPrnCreation({
        deductParams,
        findBalance: findBalance(db),
        saveBalance: saveBalance(db),
        dependencies
      })
    },
    deductTotalBalanceForPrnIssue: async (deductParams) => {
      return performDeductTotalBalanceForPrnIssue({
        deductParams,
        findBalance: findBalance(db),
        saveBalance: saveBalance(db),
        dependencies
      })
    },
    creditAvailableBalanceForPrnCancellation: async (creditParams) => {
      return performCreditAvailableBalanceForPrnCancellation({
        creditParams,
        findBalance: findBalance(db),
        saveBalance: saveBalance(db),
        dependencies
      })
    },
    creditFullBalanceForIssuedPrnCancellation: async (creditParams) => {
      return performCreditFullBalanceForIssuedPrnCancellation({
        creditParams,
        findBalance: findBalance(db),
        saveBalance: saveBalance(db),
        dependencies
      })
    },
    appendStreamEvent: async (appendParams) => {
      return performAppendPrnStreamEvent({
        appendParams,
        findBalance: findBalance(db),
        dependencies
      })
    },
    flipCanonicalSourceToMigrating: performFlipCanonicalSourceToMigrating(db),
    flipCanonicalSourceToLedger: performFlipCanonicalSourceToLedger(db),
    resetCanonicalSourceToEmbedded: performResetCanonicalSourceToEmbedded(db),
    getPrnCatchupEvents: performGetPrnCatchupEvents(db, streamRepository)
  })
}
