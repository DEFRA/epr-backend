import { fetchJson } from '../../common/helpers/fetch-json.js'
import { config } from '../../config.js'

async function getOidcConfigs() {
  const getEntraIdOidcConfig = () =>
    fetchJson(config.get('oidc.entraId.oidcWellKnownConfigurationUrl'))

  const getDefraIdOidcConfig = () =>
    fetchJson(config.get('oidc.defraId.oidcWellKnownConfigurationUrl'))

  const [entraIdOidcConfig, defraIdOidcConfig] = await Promise.all([
    getEntraIdOidcConfig(),
    getDefraIdOidcConfig()
  ])

  return { entraIdOidcConfig, defraIdOidcConfig }
}

export { getOidcConfigs }
