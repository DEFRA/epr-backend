import { fetchJson } from '#common/helpers/fetch-json.js'
import { config } from '../../../config.js'

async function getOidcConfigs() {
  const getEntraIdOidcConfig = () =>
    fetchJson(config.get('oidc.entraId.oidcWellKnownConfigurationUrl'))

  const [entraIdOidcConfig] = await Promise.all([getEntraIdOidcConfig()])

  return { entraIdOidcConfig }
}

export { getOidcConfigs }
