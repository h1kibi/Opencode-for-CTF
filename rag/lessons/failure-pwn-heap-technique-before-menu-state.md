# Failure: named heap technique chosen before menu state reduction

- family: failure
- category: pwn
- trigger: allocator challenge with add/delete/edit/show style operations, but chunk layout, lifetime rules, or libc version are still unclear
- misleading signal: recognizable heap keywords make a familiar house/tcache route feel immediately available
- wrong behavior: jumps into tcache poisoning, unsorted-bin, FSOP, or house techniques before proving the menu primitive and allocator facts
- damage: causes high-variance payload mutation and false confidence in the wrong heap family
- correction rule: block named heap techniques until the menu state table, allocator version, and one concrete heap primitive are verified
- better next probe: map one clean allocation/free/edit/show cycle and prove one leak, overlap, UAF, or double-free fact
