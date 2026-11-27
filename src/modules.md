# Modules

A module is a directory under `src/` that owns one responsibility. Code outside it reaches it only through its entry points, and lint refuses any other import. The organisation read model is the first module in this shape, so copy it.

## Entry points

- **`index.js`** is the public interface. It holds the module's types, including the type of each port it provides, and its pure rules. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the module's production plugins. It may also export the startup wiring that code under `src/server` needs from the module. Only the server setup and the test servers import it.
- **`test-support.js`** holds the module's in-memory adapters, their plugins and its test builders. Only tests import it. A test outside the module that runs against a real database builds the real adapter itself, so `test-support.js` exports that adapter's factory too. It does so even when `plugin.js` also exports the factory for code under `src/server`.

## The index and the port

A module's index and its port are one interface, split by role.

- **The port is how a caller asks the module to do something,** whether that is fetching, saving, sending or any other application service. Callers use it from the request or from `server.app`, typed by the port's type from `index.js`.
- **`index.js` describes what those requests take and return.** It holds the module's types, its constants, and the rules that answer questions about a value of those types. Callers import it.

## Plugins

A module offers routes, ports, or both. A port is a capability other code uses, such as a repository or an application service.

- **Routes go in a route plugin.**
- **Each adapter of a port is its own plugin, made with `portAdapter`** from `src/plugins/port-adapter.js`. It is named after the port, which is the port's key in `ServerApp` in `src/common/hapi-types.js`, and it provides that key and nothing else. A port's adapters share the name, so Hapi refuses a server that registers two of them. The server setup registers the production adapter, and the test server registers the in-memory one.
- **The server setup makes the decisions.** It picks the adapter, reads the config and feature flags, and passes the adapter plain values as its options. An adapter never sees config or a feature flag.
- **An adapter declares the ports it needs,** and `mongodb` when it needs the database. When the server starts, the adapter is built from its options and those dependencies alone. It provides its port on `server.app` and on each request, so an adapter built per request logs with that request's logger.

## Dependencies between plugins

A plugin names the ports it needs. Hapi checks them when the server initialises and refuses to start while a provider is missing, so every server, test servers included, is initialised before use.

- **An adapter reads its dependencies only when the server starts,** so the order of the server's plugin list does not matter.
- **A plugin that reads a port only at runtime lists it in Hapi's `dependencies` field,** and reads it in its handlers or its `start` listener, as the queue consumer does.
