import HapiSwagger from 'hapi-swagger'
import { describe, it, expect } from 'vitest'

import { packagingRecyclingNotesRoutesPlugin } from '#packaging-recycling-notes/plugin.js'
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

/**
 * @param {object} [configOverrides]
 * @param {{ modules?: boolean }} [options]
 */
const prnRoutesEntry = (configOverrides, options) =>
  serverPlugins(getConfig(configOverrides), [], options).find(
    (entry) => entry.plugin === packagingRecyclingNotesRoutesPlugin
  )

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

  it('registers the PRN routes without admin cancellation when its flag is off', () => {
    expect(prnRoutesEntry()?.options.adminCancellation).toBe(false)
  })

  it('registers the PRN routes with admin cancellation when its flag is on', () => {
    expect(
      prnRoutesEntry({ featureFlags: { prnAdminCancellation: true } })?.options
        .adminCancellation
    ).toBe(true)
  })

  it('gives the PRN routes the December Waste window from the config', () => {
    expect(
      prnRoutesEntry({ decemberWaste: { windowStart: '11-15T09:30' } })?.options
        .decemberWaste
    ).toEqual({ windowStart: '11-15T09:30' })
  })

  it("leaves the modules' route plugins out when asked for none", () => {
    expect(registersModuleRoutes({ modules: false })).toBe(false)
    expect(prnRoutesEntry({}, { modules: false })).toBeUndefined()
  })
})
