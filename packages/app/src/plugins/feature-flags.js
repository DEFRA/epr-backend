import { createConfigFeatureFlags } from '#feature-flags/feature-flags.config.js'

export const featureFlags = {
  plugin: {
    name: 'feature-flags',
    version: '1.0.0',
    register: (server, options) => {
      const decorateFeatureFlags = (flags) => {
        server.decorate('server', 'featureFlags', flags)
        server.decorate('request', 'featureFlags', () => flags, {
          apply: true
        })
      }

      if (options?.featureFlags) {
        decorateFeatureFlags(options.featureFlags)
      } else {
        const flags = createConfigFeatureFlags(options.config)
        decorateFeatureFlags(flags)
      }
    }
  }
}
