import { fetchJson } from '#common/helpers/fetch-json.js'
import { config } from '../../config.js'

async function fetchWellKnown(endpoint) {
  const { payload } = await fetchJson(endpoint)
  console.log('fetching well known from: ', { endpoint, payload })
  return payload ?? {}
}

async function fetchDefraIdWellKnown() {
  return fetchWellKnown(config.get('oidc.defraId.wellKnownUrl'))
}

async function fetchEntraIdWellKnown() {
  return fetchWellKnown(config.get('oidc.entraId.wellKnownUrl'))
}

export { fetchDefraIdWellKnown, fetchEntraIdWellKnown }
