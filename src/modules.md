# Modules

A module is a directory under `src/` that owns one responsibility. Code outside it reaches it only through its entry points, and lint refuses any other import. The organisation read model is the first module in this shape, so copy it.

## Entry points

- **`index.js`** is the public interface. It holds the module's types, including the type of each port it provides, and its pure rules. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the module's production plugins. Only the server setup and the test servers import it.
- **`test-support.js`** holds the module's in-memory adapters, their plugins and its test builders. Only tests import it.

## Plugins

A module offers routes, ports, or both. A port is a capability other code uses, such as a repository or an application service. The storage behind a port stays private to the module.

- **Routes go in a route plugin.**
- **Each adapter of a port is its own plugin, named after the port.** The plugin's name is the literal port name, and it provides that key of `ServerApp` in `src/common/hapi-types.js` and nothing else. A port's adapters share the name, so Hapi refuses a server that registers two of them. The server setup registers the production adapter, and the test server registers the in-memory one.
- **Its config arrives as the `config` option.** It never reads the config singleton, and it reads its own feature flags from that option.
- **It provides its port with `registerDependency`** inside the `after` callback of `dependsOn`, and names there only the plugins that adapter uses. Handlers keep reading the port from the request, so an adapter built per request logs with that request's logger.

## Dependencies between plugins

`dependsOn` in `src/plugins/depends-on.js` declares the plugins a plugin needs, by name. A plugin that uses a port names it by the port's name, whichever adapter provides it. A misspelt name fails the type check, and `after` sees only the keys the named plugins provide. Each name and what it provides are listed in `Provides` in that file.

- **Pass `after` only to wire something at startup.** It runs once, at the first initialise. A plugin that reads a port only in its handlers declares the names without `after`. Two plugins that each pass `after` and name each other cannot start.
- **Never read another plugin's output at registration, or in a plain `onPreStart`.** Neither waits for the plugin that provides it. A plugin that needs it at runtime reads it in its `start` listener, as the queue consumer does.
- **A module's plugin never lists its dependencies statically.** `dependsOn` checks the names against `Provides`, and a static list is not checked.

Every server, test servers included, is initialised before use, because ports are provided at initialise.
