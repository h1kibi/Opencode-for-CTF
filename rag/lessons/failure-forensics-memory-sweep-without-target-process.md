# Failure: memory sweep without target process

- family: failure
- category: forensics
- trigger: memory image is large and many plugin outputs are available, but no target process or artifact family has been prioritized
- misleading signal: broad plugin output feels like progress because it is voluminous
- wrong behavior: sweeps many processes, handles, and dumps before selecting one target process or anchor artifact
- damage: converts the image into an unbounded search space and delays the first real pivot
- correction rule: choose one anchor such as browser/session/credential clues, suspicious strings, or handles, then rank the first target process before deeper extraction
- better next probe: map the process families quickly and select one highest-probability target for the next focused extraction step
