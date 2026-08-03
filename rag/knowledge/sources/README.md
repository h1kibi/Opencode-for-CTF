# Local Knowledge Sources

`knowledge/` is the canonical runtime RAG for this plugin. User-supplied corpora may be mirrored locally under `knowledge/imported/<source-id>/`; that tree is ignored by Git and excluded from npm/managed installs.

A maintained source should produce a committed `*.manifest.json` plus compact, attributed retrieval assets such as pattern cards. Do not commit raw third-party writeups, scripts, binaries, exact flags, credentials, private keys, session tokens, or live-target secrets.

Each manifest records the upstream repository, pinned revision, source paths and hashes, license/provenance caveats, selected/rejected counts, and generated outputs. Individual articles or scripts may retain rights that differ from the compilation license.
