import { fetchJson } from '#common/helpers/fetch-json.js'
import { config } from '../../../config.js'

async function getOidcConfigs() {
  const getDefraIdOidcConfig = () =>
    fetchJson(config.get('oidc.defraId.wellKnownUrl'))

  const getEntraIdOidcConfig = () =>
    fetchJson(config.get('oidc.entraId.oidcWellKnownConfigurationUrl'))

  const [defraIdOidcConfig, entraIdOidcConfig] = await Promise.all([
    getDefraIdOidcConfig(),
    getEntraIdOidcConfig()
  ])

  return { defraIdOidcConfig, entraIdOidcConfig }
}

export { getOidcConfigs }
