---
name: ctf-web-prototype-pollution
description: Use when Web CTF evidence mentions Node.js, Express, lodash merge, qs/body-parser, __proto__, constructor.prototype, template options, EJS/Pug/Handlebars, vm/sandbox, or JavaScript prototype chain.
compatibility: opencode
---

# CTF Web Prototype Pollution

## Stop Conditions

Stop when the signal is falsified, the stated budget is exhausted, the action would exceed scope/risk, or the result is sufficient for handoff. Do not continue with payload variants without a new discriminator.

## Output Contract

Return a compact result containing confirmed facts, unresolved uncertainty, attempted discriminator, status (`continue`, `pivot`, `blocked`, `dead`, or `close`), and exactly one next action.

## Dispatch / Handoff

Return facts, uncertainty, and the next probe to `ctf-web` / `ctf-web-attack-queue`; enter primitive-lock only after oracle-backed confirmation.

## First Safe Action

Read the current candidate, evidence, and attempt budget, then run the smallest read-only or reversible discriminator defined by this skill.

## Required Inputs

Require the current Web phase, candidate/surface, relevant evidence, target constraints, and an explicit attempt or mutation budget before probing.

## Do Not Load When

Do not load without a matching observed signal, and do not use this focused skill to replace the `ctf-web` phase controller or global route ranking.

## Load When

Load after `ctf-web` focused-probe selects a matching prototype-pollution signal; do not use it for generic Web recon.

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
