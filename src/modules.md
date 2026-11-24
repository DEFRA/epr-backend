# Modules

A module is a directory under `src/` that owns one responsibility. Code outside it reaches it only through its entry points, and lint refuses any other import. The organisation read model is the first module in this shape, so copy it.

## Entry points

- **`index.js`** is the public interface. It holds the module's types, including the type of each capability it provides, and its pure rules. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the module's one Hapi plugin. Only the server setup and the test servers import it.
- **`test-support.js`** holds the module's in-memory adapters and test builders. Only tests import it.

## The plugin

The plugin registers what the module offers. That is routes for its users, a capability for other modules, or both. A capability is a port, such as a repository or an application service. The storage behind a capability stays private to the module.

- **It declares a literal `name` and the keys it `provides`.** The `provides` keys are keys of `ServerApp` in `src/common/hapi-types.js`, which stays the one closed type for what plugins provide.
- **Its config arrives as the `config` option.** It never reads the config singleton, and it reads its own feature flags from that option.
- **Its adapters are options keyed by port.** An adapter is an instance, or a factory that takes the other capabilities it needs. Given none, the plugin builds its MongoDB adapter and declares the `mongodb` plugin.
- **It provides each capability with `registerDependency`** inside the `after` callback of `dependsOn`. Hapi runs that callback at every initialise, so the plugin guards it to provide only once. Handlers keep reading capabilities from the request, so each request logs with its own logger.

## Dependencies between plugins

`dependsOn` in `src/plugins/depends-on.js` declares the plugins a plugin needs, by name. A misspelt name fails the type check, and `after` sees only the keys the named plugins provide.

- **Pass `after` only to wire something at startup.** A plugin that reads a capability only in its handlers declares the names without `after`. Two plugins that each pass `after` and name each other cannot start.
- **Never read another plugin's output at registration, or in a plain `onPreStart`.** Neither waits for the plugin that provides it. A plugin that needs it at runtime reads it in its `start` listener, as the queue consumer does.
- **Never list dependencies statically on the plugin.** A static list cannot change with the adapters the plugin is given, so the test server could not start.

Every server, test servers included, is initialised before use, because capabilities are provided at initialise.

## Registering modules

`modules` in `src/plugins/modules.js` lists every module, and `modulePlugins` turns it into registrations with their config. Both servers register it after their own plugins. The test server gives each module its in-memory adapter through a `ModuleOptions` map, whose type comes from the list, and a test overrides a capability through `createTestServer`'s `repositories`. The legacy apply-routes server registers no modules.

A plugin that is not yet a module stays in each server's own list. Its name and what it provides are listed in `UnmigratedProvides` in `src/plugins/modules.js` while another plugin declares it with `dependsOn`.
