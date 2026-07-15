# PWN Anti-Overcomplication

Use this reference when a PWN branch already has a strong primitive but is drifting into extra local explanation instead of the shortest exploit closure.

## Core Rule

High-value primitive present -> compress early.

Do not wait for perfect local semantics if the current evidence already supports a standard exploit family.

## Exploit Normal Form

Compress the branch to:

```text
control: saved_rip | saved_rbp | stack_pivot | aar | aaw
code_addr: fixed | pie
writable_memory: none | stack | heap | bss | global
replay: yes | no
leak_surface: puts_got | printf_got | show_path | fmt_read | none
closure_template: ret2win | pivot+bss | leak+replay | orw | shell | data_only
```

If this card is already stable, later probes should refine or falsify it, not restart free-form route narration.

## Canonical Closure Priority

Default order unless evidence overrides it:

1. `ret2win`
2. `pivot -> writable static/global memory`
3. `single leak -> replay`
4. `ORW`
5. `interactive shell`

If a higher-priority family is still live, do not promote a lower-priority or more stateful route.

## Minimum Solve Sketch

Ask once:

> If only 20-40 lines of solve were allowed, what is the shortest plausible exploit skeleton now?

If the answer is already concrete, the branch is in closure mode. Do not continue broad slot/object recovery unless it shortens the sketch or falsifies it.

## Bridge Primitive vs Closure Primitive

- `bridge primitive`: keeps the exploit moving but does not directly reduce flag distance. Examples: one more read, one more replay, one more buffer rewrite.
- `closure primitive`: directly advances the final path. Examples: fake-stack pivot, direct leak, ORW, direct read-flag, output hijack.

Default order: closure primitive > bridge primitive.

## Warning Signs

Treat the branch as likely overcomplicating when:

- fixed code address + writable static/global memory + control-transfer primitive + leak path + replay are already present, but rounds are still spent on local slot recovery;
- two successive rounds add explanation but do not shorten the exploit chain;
- a standard template is already visible, but the branch is still being handled as a bespoke unknown;
- “just one more confirmation” has become the default move after primitive lock.

## Fast Compression Questions

1. Do I already have fixed code addresses?
2. Do I already have writable static/global memory?
3. Do I already have a pivot or direct control-transfer primitive?
4. Do I already have one leak surface or direct close path?
5. Do I already have replay/persistent interaction if needed?

If four or more are `yes`, treat the branch as a canonical closure template branch, not a broad modeling problem.

## Preferred Actions Under Drift

- write the exploit-normal-form card;
- write the minimum solve sketch;
- rerank canonical closure families;
- demote explanation-heavy probes that do not shorten the path;
- run one concrete falsifier on the current top canonical family if still uncertain.

## Anti-Pattern

The most common failure is:

> continuing to optimize for explanation completeness after the branch already has enough structure for exploit closure.

When that happens, switch from explanation mode to compression mode.
