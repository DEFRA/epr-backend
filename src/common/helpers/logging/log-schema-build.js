import Joi from 'joi'

/**
 * @typedef {Record<string, { __type?: string } & Record<string, unknown>>} KeyTree
 */

/**
 * Builds a nested tree from a flat list of keys (slash- or dot-paths). Each
 * leaf carries `__type` resolved from the type map, falling back to `keyword`.
 *
 * @param {string[]} keys
 * @param {Record<string, string>} types
 * @returns {KeyTree}
 */
export const buildKeyTree = (keys, types) => {
  /** @type {KeyTree} */
  const tree = {}
  for (const raw of keys) {
    const path = raw.replace(/\//g, '.')
    const segments = path.split('.')
    let cursor = tree
    segments.forEach((segment, i) => {
      const isLeafSegment = i === segments.length - 1
      if (isLeafSegment) {
        cursor[segment] = cursor[segment] ?? {}
        cursor[segment].__type = types[path] ?? 'keyword'
      } else {
        cursor[segment] = cursor[segment] ?? {}
        cursor = /** @type {KeyTree} */ (cursor[segment])
      }
    })
  }
  return tree
}

/**
 * @param {string} osType
 * @returns {Joi.Schema}
 */
export const joiTypeFor = (osType) => {
  switch (osType) {
    case 'long':
      return Joi.number().integer()
    case 'float':
    case 'double':
      return Joi.number()
    case 'date':
      return Joi.string().isoDate()
    case 'boolean':
      return Joi.boolean()
    default:
      return Joi.string()
  }
}

/**
 * Walks a key tree and produces a nested Joi.ObjectSchema where each leaf
 * field is typed and every object level has `unknown(false)`.
 *
 * @param {KeyTree} tree
 * @returns {Joi.ObjectSchema}
 */
export const buildJoiSchema = (tree) => {
  /** @type {Record<string, Joi.Schema>} */
  const properties = {}
  for (const [key, node] of Object.entries(tree)) {
    properties[key] = isLeaf(node)
      ? joiTypeFor(/** @type {string} */ (node.__type))
      : buildJoiSchema(/** @type {KeyTree} */ (node))
  }
  return Joi.object(properties).unknown(false)
}

const isLeaf = (node) =>
  typeof node === 'object' &&
  node !== null &&
  typeof node.__type === 'string' &&
  Object.keys(node).every((k) => k === '__type')
