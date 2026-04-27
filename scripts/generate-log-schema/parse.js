/**
 * @typedef {Record<string, { __type?: string } & Record<string, unknown>>} KeyTree
 */

/**
 * Extracts the quoted strings inside the `default = [...]` block of the
 * `variable "include_keys"` declaration in CDP's opensearch_ingestion vars.tf.
 *
 * @param {string} varsTf
 * @returns {string[]}
 */
export const parseIncludeKeys = (varsTf) => {
  const block = varsTf.match(
    /variable\s+"include_keys"\s*\{[\s\S]*?default\s*=\s*\[([\s\S]*?)\]/
  )
  if (!block) {
    throw new Error('include_keys variable not found in vars.tf')
  }
  const keys = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  return keys
}

/**
 * Walks an OpenSearch index template's mappings to a flat dotted-path → type map.
 *
 * @param {{ template?: { mappings?: { properties?: Record<string, unknown> } } }} indexTemplate
 * @returns {Record<string, string>}
 */
export const parseFieldTypes = (indexTemplate) => {
  const mappings = indexTemplate?.template?.mappings ?? {}
  /** @type {Record<string, string>} */
  const out = {}
  walk(mappings, '', out)
  return out
}

const walk = (node, path, out) => {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string' && !node.properties) {
    out[path] = node.type
  }
  if (node.properties && typeof node.properties === 'object') {
    for (const [key, child] of Object.entries(node.properties)) {
      walk(child, path ? `${path}.${key}` : key, out)
    }
  }
}

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
      const isLeaf = i === segments.length - 1
      if (isLeaf) {
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

const TYPE_MAP = {
  keyword: 'Joi.string()',
  text: 'Joi.string()',
  ip: 'Joi.string()',
  long: 'Joi.number().integer()',
  date: 'Joi.string().isoDate()',
  boolean: 'Joi.boolean()',
  float: 'Joi.number()',
  double: 'Joi.number()'
}

/**
 * @param {string} osType
 * @returns {string}
 */
export const joiTypeFor = (osType) => TYPE_MAP[osType] ?? 'Joi.string()'
