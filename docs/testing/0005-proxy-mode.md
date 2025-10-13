# Proxy Mode

The `epr-backend-journey-tests` also includes a Proxy mode to allow you to see the Requests and Responses that are being made by the test against the application.

This is useful for debugging and understanding what is happening, as you may or may not want to inspect the actual requests or responses that are happening on the fly.

You can run the Man-In-The-Middle proxy by using the following command:

```
docker run --rm -it --name mitm-proxy --network cdp-tenant -p 7777:7777 -p 127.0.0.1:8081:8081 mitmproxy/mitmproxy mitmweb --web-host 0.0.0.0 --listen-port 7777 --set block_global=false
```

Run tests with `WITH_PROXY=true`

```
WITH_PROXY=true npm run test
```

You can now navigate to the MITM Proxy frontend (Usually http://localhost:8081 with a Token attached, refer to the output of the MITM Proxy Docker container run) to inspect your requests and responses.

Alternatively, you can also use `Postman` as a Proxy. Refer to the README in the `epr-backend-journey-tests` repository for more details.
