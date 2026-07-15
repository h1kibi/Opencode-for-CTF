# OpenCode 配置放置方式

这个包里的 `agents/`、`commands/`、`skills/`、`tools/` 目录需要作为 OpenCode 配置目录的直接子目录加载。

可选方式：

1. 项目级：把本目录内容复制到项目根目录的 `.opencode/` 下：

```text
<project>/.opencode/opencode.jsonc
<project>/.opencode/agents/
<project>/.opencode/commands/
<project>/.opencode/skills/
<project>/.opencode/tools/
```

2. 全局级：把本目录内容复制到 `~/.config/opencode/` 下。

3. 独立目录：设置 `OPENCODE_CONFIG_DIR` 指向本目录。

```powershell
$env:OPENCODE_CONFIG_DIR="C:\path\to\opencode_v3_5"
opencode
```

不要只把这个包作为普通项目子目录保留为 `opencode_v3_5/tools/`，否则自定义 TypeScript tools 不会按预期自动加载。
