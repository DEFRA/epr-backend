/**
 * Build-time parsers for CDP upstream sources. Used by parse-upstream.js
 * to derive the allowlist + types vendored as parsed-sources.json.
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
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
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
