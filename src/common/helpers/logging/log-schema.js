import { buildJoiSchema, buildKeyTree } from './log-schema-build.js'
import sources from './parsed-sources.json' with { type: 'json' }

const keys = Object.keys(sources)

/** @type {Record<string, string>} */
const types = {}
for (const key of keys) {
  types[key.replace(/\//g, '.')] = sources[key]
}

export const logSchema = buildJoiSchema(buildKeyTree(keys, types))
