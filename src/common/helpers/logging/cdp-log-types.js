/**
 * Hand-curated subset of CDP's indexed-fields schema, restricted to fields
 * apps may set (✅ and ✅⚠️ in cdp-documentation/how-to/logging.md). Fields
 * marked ❌ (CDP-reserved) are excluded — apps that try to set them get
 * silently dropped at ingest. ✅⚠️ fields are included with the caveat that
 * their value is overridden if `req`/`res` are present in the log payload.
 *
 * When the upstream CDP docs change, update this typedef in lockstep.
 *
 * Per the docs: "flattened keys and keys in a map are not considered the
 * same. i.e. `a/b = {a: {b: value}}` and `a.b = {'a.b': value}`". So the
 * dotted entries below (host.hostname, log.level, span.id, transaction.id)
 * are literal flat field names — not nested object paths.
 *
 * @typedef {{
 *   message?: string,
 *   'host.hostname'?: string,
 *   'log.level'?: string,
 *   'span.id'?: string,
 *   'transaction.id'?: string,
 *   client?: { address?: string, ip?: string, port?: number },
 *   error?: {
 *     code?: string,
 *     id?: string,
 *     message?: string,
 *     stack_trace?: string,
 *     type?: string
 *   },
 *   event?: {
 *     action?: string,
 *     category?: string,
 *     created?: string,
 *     duration?: number,
 *     kind?: string,
 *     outcome?: string,
 *     reason?: string,
 *     reference?: string,
 *     severity?: number,
 *     type?: string
 *   },
 *   http?: {
 *     request?: {
 *       body?: { bytes?: number },
 *       bytes?: number,
 *       headers?: {
 *         'Accept-language'?: string,
 *         'accept-encoding'?: string,
 *         'cache-control'?: string,
 *         expires?: string,
 *         referer?: string
 *       },
 *       id?: string,
 *       method?: string
 *     },
 *     response?: { status_code?: number }
 *   },
 *   log?: { file?: { path?: string }, logger?: string },
 *   process?: {
 *     name?: string,
 *     pid?: number,
 *     thread?: { id?: number, name?: string }
 *   },
 *   server?: { address?: string },
 *   service?: { type?: string },
 *   tenant?: { id?: string, message?: string },
 *   url?: {
 *     domain?: string,
 *     full?: string,
 *     path?: string,
 *     port?: number,
 *     query?: string
 *   },
 *   user_agent?: {
 *     device?: { name?: string },
 *     name?: string,
 *     original?: string,
 *     version?: string
 *   }
 * }} CdpIndexedLog
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
