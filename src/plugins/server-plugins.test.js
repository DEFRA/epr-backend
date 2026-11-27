import HapiSwagger from 'hapi-swagger'
import { describe, it, expect } from 'vitest'

import { organisationsRoutesPlugin } from '#organisations/plugin.js'
import { registrationAccreditationAdminRoutesPlugin } from '#registration-accreditation-admin/plugin.js'
import { getConfig } from '#root/config.js'
import { systemLogsRoutesPlugin } from '#system-logs/plugin.js'
import { wasteRecordsExport } from '#waste-records-export/plugin.js'

import { serverPlugins } from './server-plugins.js'

/** @param {boolean} isSwaggerEnabled */
const registersSwagger = (isSwaggerEnabled) =>
  serverPlugins(getConfig({ isSwaggerEnabled }), []).some(
    (entry) => entry.plugin === HapiSwagger
  )

const MODULE_ROUTE_PLUGINS = [
  organisationsRoutesPlugin,
  registrationAccreditationAdminRoutesPlugin,
  systemLogsRoutesPlugin,
  wasteRecordsExport
]

/** @param {{ modules?: boolean }} [options] */
const registeredModuleRoutes = (options) => {
  const plugins = serverPlugins(getConfig(), [], options)
  return MODULE_ROUTE_PLUGINS.filter((plugin) =>
    plugins.some((entry) => entry === plugin || entry.plugin === plugin)
  )
}

describe('serverPlugins', () => {
  it('registers Swagger when the config enables it', () => {
    expect(registersSwagger(true)).toBe(true)
  })

  it('leaves Swagger out when the config disables it', () => {
    expect(registersSwagger(false)).toBe(false)
  })

  it("registers the modules' route plugins", () => {
    expect(registeredModuleRoutes()).toEqual(MODULE_ROUTE_PLUGINS)
  })

  it("leaves the modules' route plugins out when asked for none", () => {
    expect(registeredModuleRoutes({ modules: false })).toEqual([])
  })
})
