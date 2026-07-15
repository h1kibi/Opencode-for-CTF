# CXX UAF data-only first

## Trigger
- C++ object wrappers, inventory/equipment/menu abstractions, or object-field reuse suggest a UAF or stale-reference path.
- The branch is jumping straight to FSOP, vtable, or shell closure without proving the shorter consumer.

## Why it looks promising
- Many medium C++ pwns close through data-only corruption, string/path overwrite, or adjacent consumer hijack before heavy control-flow routes.

## What usually goes wrong
- The solver assumes every C++ UAF needs a fully weaponized heap technique or vtable takeover.

## Better question
- What adjacent object, field, string, length, or output consumer is already closer to the flag than a full control-flow rewrite?

## First safe check
- Run adjacency reasoning first, map later consumers, and test one shortest data-only or output-hijack route before FSOP/vtable escalation.

## Oracle
- A shorter adjacent consumer path appears or the data-only branch is cleanly falsified.

## Stop rule
- Do not promote FSOP, vtable, or heavier heap closure before one focused adjacency/data-only check.

## Pivot rule
- If no shorter consumer exists after adjacency audit, keep the current heap/control route and document why the data-only branch lost.
