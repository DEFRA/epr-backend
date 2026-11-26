import HapiSwagger from 'hapi-swagger'
import { describe, it, expect } from 'vitest'

import { getConfig } from '#root/config.js'
import { wasteRecordsExport } from '#waste-records-export/plugin.js'

import { serverPlugins } from './server-plugins.js'

/** @param {boolean} isSwaggerEnabled */
const registersSwagger = (isSwaggerEnabled) =>
  serverPlugins(getConfig({ isSwaggerEnabled }), []).some(
    (entry) => entry.plugin === HapiSwagger
  )

/** @param {{ modules?: boolean }} [options] */
const registersModuleRoutes = (options) =>
  serverPlugins(getConfig(), [], options).includes(wasteRecordsExport)

describe('serverPlugins', () => {
  it('registers Swagger when the config enables it', () => {
    expect(registersSwagger(true)).toBe(true)
  })

  it('leaves Swagger out when the config disables it', () => {
    expect(registersSwagger(false)).toBe(false)
  })

  it("registers the modules' route plugins", () => {
    expect(registersModuleRoutes()).toBe(true)
  })

  it("leaves the modules' route plugins out when asked for none", () => {
    expect(registersModuleRoutes({ modules: false })).toBe(false)
  })
})
