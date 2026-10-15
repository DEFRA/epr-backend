import { logger } from '#common/helpers/logging/logger.js'
import { UNIQUE_NUMBER_FIELDS } from './helpers.js'

/** @import { Collection, Document, Filter } from 'mongodb' */
/** @import { UniqueNumberField } from './helpers.js' */

const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000
const BLANK_NUMBER = /^\s*$/
const NO_NUMBER = { $in: [null, BLANK_NUMBER] }
const NON_CANONICAL_NUMBER = /^\s|\s$|[a-z]/

/**
 * @param {unknown} number - as stored, absent when the item has none
 * @returns {'removed' | 'rewritten' | null}
 */
const cleanUpOf = (number) => {
  if (
    number === null ||
    (typeof number === 'string' && BLANK_NUMBER.test(number))
  ) {
    return 'removed'
  }
  if (typeof number === 'string' && NON_CANONICAL_NUMBER.test(number)) {
    return 'rewritten'
  }
  return null
}

/**
 * @param {Collection} collection
 * @param {UniqueNumberField} numberField
 * @param {{ removal: Filter<Document>, rewrite: Filter<Document> }} filters
 */
const logNumbersToClean = async (collection, { items, field }, filters) => {
  const organisations = await collection
    .find(
      { $or: [filters.removal, filters.rewrite] },
      { projection: { [`${items}.id`]: 1, [`${items}.${field}`]: 1 } }
    )
    .toArray()

  for (const organisation of organisations) {
    for (const item of organisation[items]) {
      const change = cleanUpOf(item[field])
      if (change) {
        logger.info({
          message: `Cleaning ${items}.${field} before building its unique index: organisationId=${organisation._id} itemId=${item.id} change=${change} numberBefore=${JSON.stringify(item[field])}`
        })
      }
    }
  }
}

/**
 * A sparse unique index still indexes a stored null or blank, so those are
 * removed first. The rest are stored as the schema writes them now, so two
 * spellings of one number collide.
 *
 * @param {Collection} collection
 * @param {UniqueNumberField} numberField
 */
const cleanNumbersForUniqueIndex = async (collection, numberField) => {
  const { items, field } = numberField
  const filters = {
    removal: { [items]: { $elemMatch: { [field]: NO_NUMBER } } },
    rewrite: { [`${items}.${field}`]: NON_CANONICAL_NUMBER }
  }
  await logNumbersToClean(collection, numberField, filters)

  await collection.updateMany(
    filters.removal,
    { $unset: { [`${items}.$[unnumbered].${field}`]: '' } },
    { arrayFilters: [{ [`unnumbered.${field}`]: NO_NUMBER }] }
  )
  await collection.updateMany(filters.rewrite, [
    {
      $set: {
        [items]: {
          $map: {
            input: `$${items}`,
            as: 'item',
            in: {
              $cond: [
                { $eq: [{ $type: `$$item.${field}` }, 'string'] },
                {
                  $mergeObjects: [
                    '$$item',
                    {
                      [field]: {
                        $toUpper: { $trim: { input: `$$item.${field}` } }
                      }
                    }
                  ]
                },
                '$$item'
              ]
            }
          }
        }
      }
    }
  ])
}

/**
 * A repeat across organisations fails the build. The service starts without
 * the index rather than not at all, and the duplicate-number diagnostic lists
 * every repeat.
 *
 * @param {Collection} collection
 * @param {UniqueNumberField} numberField
 */
const buildUniqueNumberIndex = async (collection, { items, field }) => {
  try {
    await collection.createIndex(
      { [`${items}.${field}`]: 1 },
      { unique: true, sparse: true }
    )
  } catch (error) {
    if (error.code !== MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throw error
    }
    logger.error({
      err: error,
      message: `Starting without the unique index on ${items}.${field}, because more than one organisation holds ${JSON.stringify(error.keyValue)}`
    })
  }
}

/** @param {Collection} collection */
export const ensureUniqueNumbers = (collection) =>
  Promise.all(
    UNIQUE_NUMBER_FIELDS.map(async (numberField) => {
      await cleanNumbersForUniqueIndex(collection, numberField)
      await buildUniqueNumberIndex(collection, numberField)
    })
  )
