import HapiSwagger from 'hapi-swagger'
import { describe, it, expect } from 'vitest'

import { applyRoutesPlugin } from '#forms-submission-data/plugin.js'
import { getConfig } from '#root/config.js'

import { moduleRoutePlugins, serverPlugins } from './server-plugins.js'

/** @param {boolean} isSwaggerEnabled */
const registersSwagger = (isSwaggerEnabled) =>
  serverPlugins(getConfig({ isSwaggerEnabled }), []).some(
    (entry) => entry.plugin === HapiSwagger
  )

/** @param {any} entry - a bare plugin, or one wrapped with its options */
const pluginOf = (entry) => entry.plugin ?? entry

const MODULE_ROUTE_PLUGINS = moduleRoutePlugins(getConfig()).map(pluginOf)

/** @param {{ modules?: boolean }} [options] */
const registeredModuleRoutes = (options) => {
  const registered = serverPlugins(getConfig(), [], options).map(pluginOf)
  return MODULE_ROUTE_PLUGINS.filter((plugin) => registered.includes(plugin))
}

describe('serverPlugins', () => {
  it('registers Swagger when the config enables it', () => {
    expect(registersSwagger(true)).toBe(true)
  })

  it('leaves Swagger out when the config disables it', () => {
    expect(registersSwagger(false)).toBe(false)
  })

  it("registers the modules' route plugins", () => {
    expect(MODULE_ROUTE_PLUGINS).not.toHaveLength(0)
    expect(registeredModuleRoutes()).toEqual(MODULE_ROUTE_PLUGINS)
  })

  it("leaves the modules' route plugins out when asked for none", () => {
    expect(registeredModuleRoutes({ modules: false })).toEqual([])
  })

  it.each([true, false])(
    'registers the apply routes when modules is %s',
    (modules) => {
      expect(serverPlugins(getConfig(), [], { modules })).toContain(
        applyRoutesPlugin
      )
    }
  )
})
