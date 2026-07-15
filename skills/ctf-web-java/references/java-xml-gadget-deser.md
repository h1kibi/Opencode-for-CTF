# Java XMLDecoder / CommonsCollections Gadget Notes

Derived from ljagiello/ctf-skills `ctf-web/server-side-deser.md` Java deserialization notes.

Use when Java XMLDecoder or binary Java serialization is source-proven and dependency/classpath gates are known.

## XMLDecoder

### Trigger Signals

- `java.beans.XMLDecoder` in source/bytecode.
- XML body/file import route reaches object construction.
- Parser error references XMLDecoder or Java bean instantiation.

### Key Insight

`XMLDecoder` is text-based object construction and method invocation. It may not need an external gadget chain.

### First Safe Checks

1. Prove route reaches XMLDecoder with harmless XML object/error probe.
2. Determine output oracle: response body, error, callback, side effect.
3. Prefer file-read/application helper invocation if available; command execution may fail in no-shell containers.

## Binary Java Serialization

### Trigger Signals

- Serialized magic: base64 `rO0AB` or hex `aced0005`.
- `ObjectInputStream`, `readObject`, `readUnshared`.
- Content-Type `application/x-java-serialized-object`.

### First Safe Checks

1. Confirm parser with invalid stream or URLDNS-style blind callback only if callbacks are in scope.
2. Identify classpath: CommonsCollections, Spring, BeanUtils, custom challenge classes.
3. Prefer application-specific gadgets/helper methods when visible, not blind ysoserial rotation.
4. For Java 17+, expect module restrictions; demote classic gadget assumptions unless proven.

## Custom CTF Gadget Pattern

If source contains privileged static helpers like `Flag.getFlag()`, gadget goal may be direct method invocation rather than shell.

- CommonsCollections `LazyMap` + `ChainedTransformer` can call static methods.
- Avoid triggering LazyMap locally while building payload; delayed insertion into `HashMap` may be needed.
- Treat reflection/module restrictions as a gate.

## Stop Rules

- Do not run gadget payloads from dependency name alone.
- Require parser + classpath + data shape + oracle.
- After two gadget attempts without parser-specific feedback, pivot to parser/config/source evidence.
