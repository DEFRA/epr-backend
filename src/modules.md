# Modules

A module is a directory under `src/` that owns one responsibility. Code outside it reaches it only through its entry points, and lint refuses any other import. The organisation read model is the first module in this shape, so copy it.

## Entry points

- **`index.js`** is the public interface. It holds the module's types, including the type of each port it provides, and its pure rules. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the module's production plugins. Only the server setup and the test servers import it.
- **`test-support.js`** holds the module's in-memory adapters, their plugins and its test builders. Only tests import it.

## Plugins

A module offers routes, ports, or both. A port is a capability other code uses, such as a repository or an application service.

- **Routes go in a route plugin.**
- **Each adapter of a port is its own plugin, named after the port, and looks like the existing repository plugins,** such as the overseas sites one. Its name is the port's key in `ServerApp`, in `src/common/hapi-types.js`, and it provides that key and nothing else. A port's adapters share the name, so Hapi refuses a server that registers two of them. The server setup registers the production adapter, and the test server registers the in-memory one.
- **Its config arrives as the `config` option.** It never reads the config singleton, and it reads its own feature flags from that option.
- **It provides its port with `registerDependency` when it registers.** Handlers keep reading the port from the request, so an adapter built per request logs with that request's logger.

## Dependencies between plugins

A plugin lists the plugins it needs in Hapi's `dependencies` field, by the name of the port each one provides. Hapi checks that list when the server initialises, so every server, test servers included, is initialised before use.

- **A plugin that reads another plugin's port when it registers needs that plugin registered first.** Hapi does not check the list until initialise, so the plugin throws a clear error when the port is missing, and the server setup registers the provider first.
- **A plugin that reads a port only at runtime reads it in its handlers or its `start` listener,** as the queue consumer does.
