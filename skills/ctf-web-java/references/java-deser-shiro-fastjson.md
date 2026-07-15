# Java Deserialization / Shiro / Fastjson

Use for Java object parsing, rememberMe cookies, JSON polymorphic typing, YAML/XML object mapping, or serialized blobs.

## Triggers

- `ObjectInputStream`, `readObject`, `readUnshared`, `Serializable` custom classes.
- Dependencies: Shiro, Fastjson, Jackson databind/default typing, XStream, SnakeYAML, Commons Collections.
- Cookies/tokens resembling serialized/encrypted/base64 objects, especially Shiro `rememberMe`.
- Endpoints accepting JSON/YAML/XML with type fields or class names.

## First Safe Checks

1. Identify parser and data shape: Java serialization stream, JSON, YAML, XML, cookie token.
2. Confirm version and config gate from dependencies/config/source.
3. Confirm reachable endpoint and controlled bytes/fields.
4. Use a harmless parse/error oracle before gadget payloads.
5. Prefer challenge-provided custom gadget/classes over blind external gadget chains.

## Parser Matrix

| Parser / Feature | Required Evidence | First Safe Check | Primitive |
|---|---|---|---|
| ObjectInputStream | source sink, serialized magic, reachable route | invalid stream error / custom class read path | custom readObject/gadget |
| Shiro rememberMe | Shiro deps/config, rememberMe cookie | delete/tamper cookie oracle, key/config clue | auth bypass/deser if key known/weak |
| Fastjson | version, autoType/config, JSON endpoint | type field error / parser behavior | class instantiation/gadget |
| Jackson | default typing or annotated polymorphism | controlled type field accepted | gadget/custom class |
| XStream/SnakeYAML | dependency + parser call | type/tag error | object construction/gadget |

## Stop Rules

- Do not launch gadget payloads from dependency name alone.
- For Shiro, verify rememberMe behavior and key/config clue before brute gadget attempts.
- For Fastjson/Jackson, verify auto type/default typing or explicit polymorphic binding.
- After two parser probes without a parser-specific oracle, pivot to route/source mapping.

## XMLDecoder / Custom Gadget Specialization

When `XMLDecoder`, binary Java serialization magic (`rO0AB`/`aced0005`), CommonsCollections, or custom challenge helper classes are visible, also load `java-xml-gadget-deser.md`.
