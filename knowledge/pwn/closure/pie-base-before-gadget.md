# PIE base before gadget

## Trigger
- PIE is enabled, and the branch is discussing gadget addresses or binary-relative chains before a binary/code pointer leak is classified.

## Why it looks promising
- A single binary leak is often enough to turn a medium PIE challenge back into a template route.

## What usually goes wrong
- The solver hardcodes gadgets, confuses libc leaks with binary base, or drives final math from unknown-class pointers.

## Better question
- What is the smallest leak that proves a binary/return-address/code pointer class and yields a valid PIE base?

## First safe check
- Classify every leak, compute base only from known-class binary/code pointers, and delay final gadget math until the base is explicit.

## Oracle
- One known-class code pointer yields a sane PIE base.

## Stop rule
- Unknown-class leaks must not drive final gadget math.

## Pivot rule
- If only libc leaks are available, use them for libc closure only after proving the binary-relative part is unnecessary.
