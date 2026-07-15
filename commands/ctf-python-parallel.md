---
description: Run a Windows-safe multiprocessing Python script through a real file
agent: ctf-rev
subtask: false
---

Run a Python multiprocessing script through `ctf-python-parallel`.

Rule: on Windows, include `if __name__ == '__main__':` or the tool will reject execution early.
