# System logs

This module records what was done to the service's data and who did it, and finds those records again. Other modules write a system log through the `systemLogsRepository` port, and service maintainers search them through `GET /v1/system-logs/search`.

Code outside the module imports from three entry points:

- **`index.js`** is the public interface: the system log types and the type of the repository port. It loads no route, adapter or Hapi code.
- **`plugin.js`** holds the MongoDB adapter's plugin, which provides the repository, and the plugin that adds the search route. Only code in `src/server`, `src/plugins` and `src/test` may import it.
- **`test-support.js`** holds the in-memory repository, its plugin, the MongoDB repository's factory and the test builder, and only a test may import it. The test server registers the in-memory plugin.

[`src/modules.md`](../modules.md) describes the shape every module takes.

Lint refuses any other import into the module, but it cannot see a JSDoc `@import`.
