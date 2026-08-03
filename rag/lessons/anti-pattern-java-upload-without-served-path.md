# Java upload without served path proof

family: anti-pattern
category: web/java-web

## Trigger
- Upload/write primitive is assumed to become JSP execution or static readback without canary served-path proof.

## Better question
Where is the file stored, is the path user-controlled, is it served/reloaded, and can a canary be read back?

## Stop rule
Do not attempt JSP shells or overwrite existing files until canary create/readback/served behavior is proven.

## Control action
Use `ctf-file-write-matrix`; if not served, pivot to file read, include consumer, archive traversal, or config/source closure.
