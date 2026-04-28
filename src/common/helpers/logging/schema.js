import Joi from 'joi'

/**
 * Hand-rolled schema describing the log shape epr-backend confines itself to.
 *
 * Each top-level namespace is a subset of CDP's OpenSearch allowlist
 * (cdp-tf-modules/opensearch_ingestion/vars.tf). Keys outside this schema
 * land in CDP's dropped-fields S3 sink and are never indexed, so the schema
 * rejects unknown keys at every level to surface drift immediately.
 *
 * Sources of fields:
 *   - developer-passed at log call sites: message, error (via `err`),
 *     event, http.response, log
 *   - added by @elastic/ecs-pino-format: ecs, log.level, service, process, host
 *   - added by getTraceId() mixin: trace
 *   - added by hapi-pino on response / request-error events:
 *     http.request, url, client, user_agent
 *   - added at ingest by CDP: @timestamp
 */

const errorSchema = Joi.object({
  message: Joi.string(),
  stack_trace: Joi.string(),
  type: Joi.string(),
  code: Joi.string(),
  id: Joi.string()
}).unknown(false)

const eventSchema = Joi.object({
  action: Joi.string(),
  category: Joi.string(),
  created: Joi.string().isoDate(),
  duration: Joi.number().integer(),
  kind: Joi.string(),
  outcome: Joi.string(),
  reason: Joi.string(),
  reference: Joi.string(),
  severity: Joi.number().integer(),
  type: Joi.string()
}).unknown(false)

const httpSchema = Joi.object({
  request: Joi.object({
    body: Joi.object({ bytes: Joi.number().integer() }).unknown(false),
    bytes: Joi.number().integer(),
    headers: Joi.object({
      'Accept-language': Joi.string(),
      'accept-encoding': Joi.string(),
      'cache-control': Joi.string(),
      expires: Joi.string(),
      referer: Joi.string()
    }).unknown(false),
    id: Joi.string(),
    method: Joi.string()
  }).unknown(false),
  response: Joi.object({
    body: Joi.object({ bytes: Joi.number().integer() }).unknown(false),
    bytes: Joi.number().integer(),
    mime_type: Joi.string(),
    response_time: Joi.string(),
    status_code: Joi.number().integer()
  }).unknown(false)
}).unknown(false)

const ecsSchema = Joi.object({ version: Joi.string() }).unknown(false)

const logMetaSchema = Joi.object({
  level: Joi.string(),
  logger: Joi.string(),
  file: Joi.object({ path: Joi.string() }).unknown(false)
}).unknown(false)

const serviceSchema = Joi.object({
  name: Joi.string(),
  type: Joi.string(),
  version: Joi.string()
}).unknown(false)

const processSchema = Joi.object({
  name: Joi.string(),
  pid: Joi.number().integer(),
  thread: Joi.object({
    id: Joi.number().integer(),
    name: Joi.string()
  }).unknown(false)
}).unknown(false)

const hostSchema = Joi.object({ hostname: Joi.string() }).unknown(false)

const traceSchema = Joi.object({ id: Joi.string() }).unknown(false)

const urlSchema = Joi.object({
  domain: Joi.string(),
  full: Joi.string(),
  path: Joi.string(),
  port: Joi.number().integer(),
  query: Joi.string()
}).unknown(false)

const clientSchema = Joi.object({
  address: Joi.string(),
  ip: Joi.string().ip(),
  port: Joi.number().integer()
}).unknown(false)

const userAgentSchema = Joi.object({
  name: Joi.string(),
  original: Joi.string(),
  version: Joi.string(),
  device: Joi.object({ name: Joi.string() }).unknown(false)
}).unknown(false)

export const logSchema = Joi.object({
  '@timestamp': Joi.string().isoDate(),
  message: Joi.string(),
  error: errorSchema,
  event: eventSchema,
  http: httpSchema,
  ecs: ecsSchema,
  log: logMetaSchema,
  service: serviceSchema,
  process: processSchema,
  host: hostSchema,
  trace: traceSchema,
  url: urlSchema,
  client: clientSchema,
  user_agent: userAgentSchema
}).unknown(false)
