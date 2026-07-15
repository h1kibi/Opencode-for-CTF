# Bundled Libc First

## Purpose

Use this card when a challenge ships `libc.so.6` and optionally `ld-linux`. The bundled runtime is a **hard gate**, not a soft hint.

## Trigger

- `libc.so.6` exists in the challenge bundle
- `ld-linux*` exists in the challenge bundle
- heap / overlap / tcache / FILE / seccomp behavior differs from the assumed base image
- local proof is being attempted on a generic pwnlab image before runtime alignment is checked

## Hard Rule

Do **not** validate heap overlap, tcache poisoning, fake FILE behavior, or seccomp closure on a mismatched glibc base once bundled libc/ld is present.

## First Safe Check

1. Run `ctf-pwn-libc-runtime-doctor binary=<bin> libc=<libc> [ld=<ld>]`.
2. Record:
   - recommended image / service / profile
   - explicit loader command
   - stop condition if current base is mismatched
3. If the doctor output disagrees with the current substrate, stop exploit validation and relock the substrate first.

## Preferred Runtime Order

1. challenge Docker / compose if present and correct
2. bundled `ld-linux --library-path` local reproduction
3. matched pwnlab image from the runtime doctor
4. generic pwnlab only when no stronger runtime signal exists

## Output You Need Before Continuing

- exact runtime lock
- explicit loader command
- whether the current heap observations are trustworthy on this base

## Anti-Pattern

**Wrong move:** proving heap overlap or tcache conclusions on a default Ubuntu 22.04 image while the challenge ships older glibc.

**Why it fails:** allocator layout, overlap boundaries, safe-linking assumptions, and FILE/FSOP closure facts become polluted.

## Stop Rule

If bundled libc/ld exists and runtime is not locked, do not spend the next probe budget on heap mutation, overlap offset search, or closure gadget changes.
