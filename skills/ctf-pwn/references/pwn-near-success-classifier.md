# PWN Near-Success Classifier

Use this reference when a payload changes behavior but does not yet yield a flag.

Classify exactly one state:

- shell likely spawned, command set limited
- one-shot command execution only
- file-read primitive likely works without shell
- prompt desync or pacing issue
- exploit succeeded but stdout/stderr closure differs

Required next action by class:

- shell likely spawned, command set limited -> test one minimal read-oriented command, not shell cosmetics
- one-shot command execution only -> pivot to direct `cat` / `readflag` / env/config read
- file-read primitive likely works without shell -> treat as closure path and stop gadget hunting
- prompt desync or pacing issue -> stabilize transcript before mutating payload family
- stdout/stderr closure differs -> recheck where success output is emitted before route changes
