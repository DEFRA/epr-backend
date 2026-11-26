# Modules

A module is a directory under `src/` that owns one responsibility. Code outside it reaches it only through its entry points, and lint refuses any other import. The organisation read model is the first module in this shape, so copy it.

## Entry points

- **`index.js`** is the public interface. It holds the module's types, including the type of each port it provides, and its pure rules. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the module's production plugins. Only the server setup and the test servers import it.
- **`test-support.js`** holds the module's in-memory adapters, their plugins and its test builders. Only tests import it.

## The index and the port

A module's index and its port are one interface. The index says what the module offers, and the port is that offer running, provided on `server.app` and on each request.

- **A pure rule over the module's own types goes in `index.js`,** and callers import it. It works only on the values it is given.
- **Anything that reads data or depends on config is a method on the port.** Callers use it from the request or from `server.app`, typed by the port's type from `index.js`.

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
