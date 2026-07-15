# Failure: movaps or alignment crash treated as bad gadget luck

- family: failure
- category: pwn
- trigger: a ret2libc/ROP chain reaches libc or a gadget but crashes on `movaps`, near `system`, or immediately after a `ret`
- misleading signal: the solver assumes the libc version or gadget family is wrong before checking stack alignment
- wrong behavior: keeps rotating libc, gadgets, or one_gadget candidates without testing a single alignment fix
- damage: wastes exploit budget and hides a nearly-correct chain behind avoidable crash noise
- correction rule: when the crash shape matches alignment symptoms, test one clean stack-alignment fix before route mutation
- better next probe: add one alignment `ret` or equivalent ABI-corrective step, then rerun the same chain under the same runtime
