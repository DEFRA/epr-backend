/** @import { Db } from 'mongodb' */

const NEUTRALISED_INDEX_METHODS = ['createIndex', 'createIndexes']

const FORBIDDEN_WRITE_METHODS = [
  'insertOne',
  'insertMany',
  'updateOne',
  'updateMany',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'findOneAndDelete',
  'bulkWrite',
  'drop',
  'rename'
]

const refuse = (method) => () => {
  throw new Error(`read-only: ${method} is not permitted`)
}

/**
 * Wrap a Mongo collection so it reads but never writes. Index assurance
 * (`createIndex`) — which the production repository factories run on
 * construction — is neutralised to a no-op so connecting issues no writes;
 * data-mutating methods throw. Every other method (find, aggregate, …)
 * delegates to the real collection via the prototype, so all production read
 * and mapping logic stays intact.
 *
 * @param {import('mongodb').Collection} collection
 */
const readOnlyCollection = (collection) =>
  Object.create(collection, {
    ...Object.fromEntries(
      NEUTRALISED_INDEX_METHODS.map((method) => [
        method,
        { value: async () => undefined }
      ])
    ),
    ...Object.fromEntries(
      FORBIDDEN_WRITE_METHODS.map((method) => [
        method,
        { value: refuse(method) }
      ])
    )
  })

/**
 * Wrap a Mongo `Db` so the repositories built on it can only read. Lets the
 * report reuse the production repository factories — whose reads and document
 * mapping are already battle-tested — against a live environment with no risk
 * of mutating the collections it audits.
 *
 * @param {Db} db
 * @returns {Db}
 */
export const createReadOnlyDb = (db) =>
  Object.create(db, {
    collection: {
      value: (name, options) => readOnlyCollection(db.collection(name, options))
    },
    createCollection: {
      value: async (name) => readOnlyCollection(db.collection(name))
    }
  })
