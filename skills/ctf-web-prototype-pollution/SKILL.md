---
name: ctf-web-prototype-pollution
description: Use when Web CTF evidence mentions Node.js, Express, lodash merge, qs/body-parser, __proto__, constructor.prototype, template options, EJS/Pug/Handlebars, vm/sandbox, or JavaScript prototype chain.
---

# CTF Web Prototype Pollution

Prioritize harmless confirmation before gadget hunting.

First safe checks:

- Identify merge/deep-set/clone/body-parser/qs path where attacker-controlled JSON or query keys reach an object.
- Try a harmless visible property or config flag before privileged fields.
- Check `__proto__`, `constructor.prototype`, nested object paths, array/object parser differences, and content-type parser behavior.
- Map reachable gadgets: auth flags (`isAdmin`), template options, debug options, EJS/Pug/Handlebars rendering, Happy-DOM/jsdom settings, and vm/sandbox execution paths.
- Do not jump to RCE gadget chains until pollution and one influenced property are confirmed.

Pattern recall queries:

- `Node Express prototype pollution __proto__ constructor.prototype lodash merge`
- `EJS Pug template options prototype pollution gadget`
- `vm sandbox escape prototype pollution Node CTF`

References in local mirror:

- `ctf-web/node-and-prototype.md`
- `ctf-web/field-notes.md`
- `ctf-web/cves.md`
