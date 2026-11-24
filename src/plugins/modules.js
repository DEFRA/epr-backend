import { organisationReadModel } from '#organisation-read-model/plugin.js'

/**
 * The modules every server registers, except the legacy apply-routes server.
 * `src/modules.md` describes the shape each one takes.
 */
export const modules = /** @type {const} */ ([organisationReadModel])

/** @typedef {typeof modules[number]} Module */

/**
 * @typedef {{ [M in Module as M['name']]: M['provides'][number] }} ModuleProvides
 */

/**
 * What each plugin that is not yet a module provides, for the plugins that
 * declare it with `dependsOn`.
 *
 * @typedef {{
 *   mongodb: never
 *   organisationsRepository: 'organisationAdministrationRepository' | 'organisationLinkingRepository'
 *   overseasSitesRepository: 'overseasSitesRepository'
 *   reportsRepository: 'reportsRepository'
 *   summaryLogsRepository: 'summaryLogsRepository'
 *   systemLogsRepository: 'systemLogsRepository'
 *   uploadsRepository: 'uploadsRepository'
 *   wasteBalanceService: 'wasteBalanceService'
 * }} UnmigratedProvides
 */

/** @typedef {ModuleProvides & UnmigratedProvides} Provides */

/** @typedef {keyof Provides} PluginName */

/**
 * @template {PluginName} N
 * @typedef {Provides[N]} ProvidedBy
 */

/**
 * The options a server gives each module beside its config, such as an
 * in-memory adapter.
 *
 * @typedef {{
 *   [M in Module as M['name']]?: Omit<Parameters<M['register']>[1], 'config'>
 * }} ModuleOptions
 */

/**
 * @param {{ get: (key: string) => unknown }} config
 * @param {ModuleOptions} [moduleOptions]
 */
export const modulePlugins = (config, moduleOptions = {}) =>
  modules.map((plugin) => ({
    plugin,
    options: { config, ...moduleOptions[plugin.name] }
  }))
