# Failure: transcript not normalized before attack coding

- family: failure
- category: crypto
- trigger: protocol fields, encodings, or bytes/ints/base64/hex boundaries are still ambiguous when attack code starts
- misleading signal: the math route looks clear enough that serialization details seem secondary
- wrong behavior: writes attack logic against values that have not been canonicalized into exact field and byte semantics
- damage: creates rigorous attacks against the wrong object or transcript interpretation
- correction rule: build one canonical parser/serializer and normalize all challenge values before family selection or attack implementation
- better next probe: verify that every later calculation consumes the same normalized byte/int representation and transcript ordering
