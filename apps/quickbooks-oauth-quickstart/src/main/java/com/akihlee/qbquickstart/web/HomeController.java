package com.akihlee.qbquickstart.web;

import com.akihlee.qbquickstart.oauth.TokenStore;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** A tiny hand-written page — not a template engine dependency for one screen. */
@RestController
public class HomeController {

    private final TokenStore tokenStore;

    public HomeController(TokenStore tokenStore) {
        this.tokenStore = tokenStore;
    }

    @GetMapping(value = "/", produces = MediaType.TEXT_HTML_VALUE)
    public String home() {
        boolean connected = tokenStore.isConnected();
        String realmId = connected ? tokenStore.current().realmId() : null;

        return """
                <!doctype html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <title>QuickBooks OAuth Quickstart</title>
                  <style>
                    body { font-family: -apple-system, sans-serif; max-width: 640px; margin: 40px auto; padding: 0 16px; color: #1a1a1a; }
                    h1 { font-size: 20px; }
                    section { margin-bottom: 28px; padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
                    label { display: block; font-size: 13px; margin-top: 8px; }
                    input { width: 100%%; padding: 6px; margin-top: 2px; box-sizing: border-box; }
                    button { margin-top: 12px; padding: 8px 14px; cursor: pointer; }
                    pre { background: #f6f6f6; padding: 10px; overflow-x: auto; font-size: 12px; }
                    .status { font-weight: 600; color: %s; }
                  </style>
                </head>
                <body>
                  <h1>QuickBooks OAuth Quickstart (sandbox)</h1>
                  <p class="status">%s</p>

                  <section>
                    <h2>Step 1 — Connect</h2>
                    <p>Redirects to Intuit's consent screen, where you'll pick a sandbox company.</p>
                    <a href="/connect"><button>Connect to QuickBooks</button></a>
                  </section>

                  <section>
                    <h2>Step 2 — Paste back code / realmId / state</h2>
                    <p>Your redirect_uri is Intuit's own Quickstart page, so after consenting it will
                       <em>display</em> code/realmId/state instead of sending them to this app automatically.
                       Copy them from there into this form.</p>
                    <form id="exchangeForm">
                      <label>code <input name="code" required></label>
                      <label>realmId <input name="realmId" required></label>
                      <label>state <input name="state" required></label>
                      <button type="submit">Exchange for tokens</button>
                    </form>
                  </section>

                  <section>
                    <h2>Step 3 — Call the APIs</h2>
                    <button onclick="call('/api/company-info')">Get company info</button>
                    <button onclick="call('/api/transactions?entity=Purchase&maxResults=25')">Get transactions (Purchase)</button>
                    <button onclick="call('/api/user-info')">Get user info</button>
                  </section>

                  <section>
                    <h2>Step 4 — Refresh</h2>
                    <button onclick="post('/refresh')">Force refresh now</button>
                    <button onclick="post('/disconnect')">Disconnect (revoke + clear)</button>
                  </section>

                  <pre id="output">Responses will appear here.</pre>

                  <script>
                    const out = document.getElementById('output');
                    async function call(url) {
                      const res = await fetch(url);
                      out.textContent = JSON.stringify(await res.json().catch(() => res.text()), null, 2);
                    }
                    async function post(url) {
                      const res = await fetch(url, { method: 'POST' });
                      out.textContent = 'HTTP ' + res.status;
                      location.reload();
                    }
                    document.getElementById('exchangeForm').addEventListener('submit', async (e) => {
                      e.preventDefault();
                      const form = new FormData(e.target);
                      const params = new URLSearchParams(form);
                      const res = await fetch('/exchange', { method: 'POST', body: params });
                      out.textContent = JSON.stringify(await res.json(), null, 2);
                      if (res.ok) location.reload();
                    });
                  </script>
                </body>
                </html>
                """.formatted(
                connected ? "#0a7d2c" : "#b02a2a",
                connected ? "Connected — realmId " + realmId : "Not connected"
        );
    }
}
