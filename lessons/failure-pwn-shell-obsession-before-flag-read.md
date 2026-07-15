# Failure: shell obsession before easier flag-read closure

- family: failure
- category: pwn
- trigger: seccomp, sandbox, ORW clue, direct file-read path, or shell instability appears after a confirmed memory-corruption primitive
- misleading signal: shell-like endgame looks more familiar than direct read-flag or ORW closure
- wrong behavior: keeps rotating ret2libc/one_gadget/shell payloads instead of modeling the shortest stable closure path
- damage: wastes exploit budget and misclassifies a closure problem as a primitive problem
- correction rule: if shell is blocked or unstable and a direct flag-read path is plausible, promote ORW/read-flag closure above shell variants
- better next probe: test the smallest direct read/ORW chain or concrete flag path read primitive first
