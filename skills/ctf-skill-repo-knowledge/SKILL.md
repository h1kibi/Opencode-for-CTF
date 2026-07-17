---
name: ctf-skill-repo-knowledge
description: Use when a CTF solve needs pattern recall from the local mirror of ljagiello/ctf-skills. Provides rules for searching the repository as a technique catalog without copying exact challenge writeups or polluting the main prompt.
compatibility: opencode
---

# CTF Skill Repo Knowledge

Local mirror:

```text
{env:OPENCODE_CONFIG_DIR}\knowledge\ljagiello-ctf-skills
```

Do not add this repository to `skills.paths`: it contains skills with names like `ctf-web`, `ctf-pwn`, and `ctf-crypto` that can conflict with the local curated opencode skills. Treat it as a knowledge base. Use `ctf-lesson-search` first for local closure/owner/failure/anti-pattern lessons, `ctf-pattern-card-search` second for decision-ready offline cards, and `ctf-skill-repo-search` third for full-text context.

## Why This Exists

The repository is valuable because it contains broad CTF experience organized by category, technique family, first-pass workflows, pivot rules, and deep notes. The right way to use it is evidence-driven retrieval:

```text
local evidence -> pattern query -> candidate family -> first safe check -> one-variable probe -> observe/pivot
```

The wrong way is:

```text
challenge title -> writeup answer -> copy final payload
```

## Mandatory Search Moments

Use `ctf-lesson-search` before continuing when the branch is closure-first, mixed-owner, stale, or strategically weak. Then use `ctf-pattern-card-search` when possible. If card results are weak or too generic, use `ctf-skill-repo-search` for full-text context before external title/writeup search.

- Two same-family probes produced no new differential.
- Source shows a precheck/sink split or semantic mismatch.
- A bug family is suspected but the first safe check is unclear.
- A challenge crosses categories and the correct subagent is uncertain.
- The solver is about to perform broad environment enumeration, broad fuzzing, or exact-title writeup search.
- The next step would be a long manual technique branch.
- A high-value primitive exists and the challenge has become a closure problem.
- The current branch matches a likely failure signature or anti-pattern.

## Query Construction

Build queries from the constraint equation, not from the challenge title.

Good:

```text
category=web query="file reader include filter parser mismatch"
category=web query="url parser fetcher ssrf redirect host header"
category=crypto query="rsa small e broadcast linear padding coppersmith"
category=pwn query="format string leak got overwrite relro"
category=reverse query="custom vm dispatch loop bytecode trace"
category=forensics query="pcap dns covert channel timing"
category=misc query="pyjail no quotes no call object graph"
family=closure query="source leak admin route config env"
family=owner query="web java spring actuator stacktrace route"
family=failure query="flat differential repeated payload no new oracle"
family=anti-pattern query="jwt decode no trust boundary role path"
```

Bad as first move:

```text
query="<exact challenge title> writeup"
query="<exact challenge title> flag"
```

## Using Search Results

For every useful hit, extract only:

- trigger signal,
- first safe check,
- expected oracle,
- stop rule,
- pivot rule,
- likely tool/subagent.

Do not paste long technique catalogs into the main reasoning. If a hit is too broad, refine the query by adding the precheck, sink, filter, oracle, or artifact type.

## Category Search Heuristics

- `web`: server-side, client-side, auth/access, JWT/OAuth, upload, parser mismatch, template, SSRF, XSS/admin bot.
- `pwn`: overflow, ROP, shellcode, format string, heap, FSOP, seccomp, kernel.
- `reverse`: tools, anti-analysis, VM/bytecode, language/platform specifics, runtime oracle, symbolic execution.
- `crypto`: RSA, AES modes, ECC, lattice/LWE, PRNG, hash/MAC, padding oracle, ZKP.
- `forensics`: disk, memory, network, stego, media, Windows/Linux artifacts, signals/hardware.
- `misc`: pyjails, bashjails, encodings, QR/audio/RF, games/VMs, DNS, platform navigation.

## Decision Contract

After a search, the agent must state:

```markdown
Pattern source: <file path from ctf-skills>
Trigger matched: ...
First safe check: ...
Expected oracle: ...
Stop rule: ...
Pivot if: ...
Next tool/subagent: ...
```

If no card or full-text result is useful, return to `ctf-experience-gate` and update the constraint equation rather than guessing.

If `ctf-lesson-search` finds a strong lesson, state:

```markdown
Lesson source: <lesson path>
Why it matches now: ...
What behavior it changes: queue ranking / owner / budget / closure order
Next concrete probe/control action: ...
```
