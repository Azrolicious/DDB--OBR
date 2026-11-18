// DDB-OBR Bridge — content script.
//
// Runs only inside the DDB-OBR Owlbear extension's own pages (see "matches" in
// manifest.json). It relays the page's requests to the background worker and
// posts the answers back. It never sees or forwards your D&D Beyond token.
(() => {
  const TAG = "ddb-obr-bridge";
  const api = globalThis.browser ?? globalThis.chrome;
  const version = api.runtime.getManifest().version;

  const post = (message) => window.postMessage({ tag: TAG, dir: "to-page", ...message }, window.location.origin);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const msg = event.data;
    if (!msg || msg.tag !== TAG || msg.dir !== "to-ext") return;

    if (msg.type === "ping") {
      post({ type: "hello", version });
      return;
    }
    if (msg.type !== "request" || typeof msg.id !== "string" || typeof msg.op !== "string") return;

    const params = msg.params && typeof msg.params === "object" ? msg.params : {};
    Promise.resolve()
      .then(() => api.runtime.sendMessage({ op: msg.op, params }))
      .then(
        (response) => {
          if (!response) {
            post({ type: "response", id: msg.id, ok: false, error: { code: "no_response", message: "The bridge didn't answer. Try reloading the page." } });
            return;
          }
          post({ type: "response", id: msg.id, ...response });
        },
        (error) =>
          post({
            type: "response",
            id: msg.id,
            ok: false,
            error: {
              code: "bridge_error",
              message: /context invalidated/i.test(String(error?.message))
                ? "The bridge extension was updated. Reload this Owlbear room."
                : String(error?.message ?? error),
            },
          }),
      );
  });

  post({ type: "hello", version });
})();
