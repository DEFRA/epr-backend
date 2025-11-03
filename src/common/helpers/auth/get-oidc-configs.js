import { fetchJson } from '../fetch-json.js'
import { config } from '../../../config.js'

async function getOidcConfigs() {
  const getEntraIdOidcConfig = () =>
    fetchJson(config.get('oidc.entraId.oidcWellKnownConfigurationUrl'))

  const getDefraIdOidcConfig = () =>
    fetchJson(config.get('oidc.defraId.oidcWellKnownConfigurationUrl'))

  const [entraIdPayload, defraIdPayload] = await Promise.all([
    getEntraIdOidcConfig(),
    getDefraIdOidcConfig()
  ])

  return { entraIdPayload, defraIdPayload }
}

export { getOidcConfigs }
