const IGNORABLE_DROP_INDEX_ERRORS = new Set([
  'IndexNotFound',
  'NamespaceNotFound'
])

/**
 * Drops a retired index by name, doing nothing if it or its collection is
 * already gone.
 *
 * @template {import('mongodb').Document} T
 * @param {import('mongodb').Collection<T>} collection
 * @param {string} name
 */
export async function dropIndexIfPresent(collection, name) {
  try {
    await collection.dropIndex(name)
  } catch (error) {
    if (!IGNORABLE_DROP_INDEX_ERRORS.has(error.codeName)) {
      throw error
    }
  }
}
