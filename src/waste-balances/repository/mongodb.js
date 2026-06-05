import { validateAccreditationId } from './validation.js'
import { performUpdateWasteBalanceTransactions } from './helpers.js'
import {
  performAppendPrnStreamEvent,
  performDeductAvailableBalanceForPrnCreation,
  performDeductTotalBalanceForPrnIssue,
  performCreditAvailableBalanceForPrnCancellation,
  performCreditFullBalanceForIssuedPrnCancellation
} from './helpers-prn.js'
import { resolveBalanceAmounts } from './resolve-balance-amounts.js'

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

const performGetPrnCatchupEvents =
  (db, streamRepository) =>
  async ({ registrationId, accreditationId, prnId, afterEventNumber }) => {
    const validatedAccreditationId = validateAccreditationId(accreditationId)
    const doc = await db
      .collection(WASTE_BALANCE_COLLECTION_NAME)
      .findOne(
        { accreditationId: validatedAccreditationId },
        { projection: { _id: 1 } }
      )
    if (!doc) {
      return []
    }
    return streamRepository.findEventsByPrnIdAfter(
      registrationId,
      validatedAccreditationId,
      prnId,
      afterEventNumber
    )
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
 * Save a waste balance shell document. Amounts and version are set on every
 * write; identity and registrationId are fixed on insert. Balance movements
 * live in the event-sourced stream, not on this document.
 *
 * @param {import('mongodb').Db} db
 * @returns {(balance: import('../domain/model.js').WasteBalance) => Promise<void>}
 */
export const saveBalance = (db) => async (balance) => {
  await db.collection(WASTE_BALANCE_COLLECTION_NAME).updateOne(
    { accreditationId: balance.accreditationId },
    {
      $set: {
        amount: balance.amount,
        availableAmount: balance.availableAmount,
        version: balance.version,
        schemaVersion: balance.schemaVersion
      },
      $setOnInsert: {
        _id: balance.id,
        organisationId: balance.organisationId,
        ...(balance.registrationId !== undefined && {
          registrationId: balance.registrationId
        })
      }
    },
    { upsert: true }
  )
}

/**
 * Creates a MongoDB-backed waste balances repository
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {Object} dependencies
 * @param {import('./stream-port.js').WasteBalanceStreamRepository} dependencies.streamRepository
 * @param {import('#repositories/system-logs/port.js').SystemLogsRepository} [dependencies.systemLogsRepository]
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
        dependencies
      })
    },
    deductTotalBalanceForPrnIssue: async (deductParams) => {
      return performDeductTotalBalanceForPrnIssue({
        deductParams,
        findBalance: findBalance(db),
        dependencies
      })
    },
    creditAvailableBalanceForPrnCancellation: async (creditParams) => {
      return performCreditAvailableBalanceForPrnCancellation({
        creditParams,
        findBalance: findBalance(db),
        dependencies
      })
    },
    creditFullBalanceForIssuedPrnCancellation: async (creditParams) => {
      return performCreditFullBalanceForIssuedPrnCancellation({
        creditParams,
        findBalance: findBalance(db),
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
    getPrnCatchupEvents: performGetPrnCatchupEvents(db, streamRepository)
  })
}
