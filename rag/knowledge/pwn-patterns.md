# PWN 题型识别与攻击策略速查表

## 一、根据源码特征识别

### 危险函数
| 函数 | 漏洞类型 | 攻击方式 |
|------|----------|----------|
| `gets()` | 栈溢出 | ret2win/ret2libc/shellcode |
| `scanf("%s")` | 栈溢出 | 同上 |
| `strcpy()` | 栈溢出 | 同上 |
| `strcat()` | 栈溢出 | 同上 |
| `sprintf()` | 栈溢出 | 同上 |
| `printf(buf)` | 格式化字符串 | 泄漏/写入 |
| `fprintf(buf)` | 格式化字符串 | 同上 |
| `read(0, buf, big)` | 栈溢出 | 同 gets |
| `read(0, buf, small)` | 可能 off-by-one | 仔细分析 |
| `malloc/free` 循环 | 堆漏洞 | UAF/double-free |
| `cin >>` 大缓冲区 | 栈溢出 | C++ 特定 |

### 安全函数（需要绕过）
| 函数 | 防护 | 绕过方式 |
|------|------|----------|
| `read(0, buf, n)` | 限制长度 | 需要精确控制 |
| `fgets()` | 限制长度 | 可能 off-by-null |

---

## 二、根据 checksec 结果识别

### 保护状态速查
```
Arch:     amd64-64-little    # 架构
RELRO:    Full RELRO         # GOT 不可写
Stack:    Canary found       # 栈保护
NX:       NX enabled         # 栈不可执行
PIE:      PIE enabled        # 地址随机化
```

### 组合攻击策略
| Canary | PIE | NX | RELRO | 策略 |
|--------|-----|-----|-------|------|
| ❌ | ❌ | ❌ | 部分 | **最简单**: ret2win + shellcode |
| ❌ | ❌ | ✅ | 部分 | ret2win 或 ret2libc |
| ❌ | ✅ | ❌ | 部分 | 泄漏 PIE + shellcode |
| ❌ | ✅ | ✅ | 部分 | 泄漏 + ret2libc |
| ✅ | ❌ | ❌ | 部分 | 泄漏 canary + shellcode |
| ✅ | ❌ | ✅ | 部分 | 泄漏 canary + ret2libc |
| ✅ | ✅ | ❌ | 部分 | 泄漏 canary+PIE + shellcode |
| ✅ | ✅ | ✅ | 完全 | **最难**: 泄漏全部 + ROP |
| 静态 | - | - | - | syscall ROP 或 ORW |

---

## 三、根据二进制特征识别

### 符号表
```bash
readelf -s ./chall | grep -E "win|flag|backdoor|shell|system"
```
- `win`/`flag`/`backdoor` → 直接跳转
- `system`@PLT → 直接调用
- `execve` → 可能有 ORW 路径

### 字符串
```bash
strings ./chall | grep -E "flag|/bin/sh|system|cat |secret"
```
- `/bin/sh` → ret2libc 目标
- `flag`/`secret` → 可能有直接读取路径
- `cat ` → 可能有 system 调用

### 导入函数
```bash
readelf -r ./chall | grep -E "puts|printf|read|write|system"
```
- `puts@plt` → 可用于泄漏
- `read@plt` → 可用于读入 shellcode
- `system@plt` → 直接调用

---

## 四、根据运行行为识别

### 输入提示
| 提示 | 可能漏洞 | 攻击方向 |
|------|----------|----------|
| "Enter your name:" | 栈溢出 | 尝试长输入 |
| "Choose option:" | 菜单题 | 堆利用 |
| "Enter format:" | 格式化字符串 | 泄漏/写入 |
| "Size:" | 堆题 | 分配大小分析 |
| "Data:" | 堆题 | 写入内容 |

### 崩溃行为
| 行为 | 含义 | 下一步 |
|------|------|--------|
| Segfault at 0x41414141 | 控制 RIP | 找偏移 |
| Segfault at unknown | 未控制 RIP | 分析输入 |
| Stack smashing detected | 触发 canary | 需要泄漏 |
| Hang/No crash | 可能需要特定输入 | 分析协议 |

---

## 五、常见 CTF 题型模板

### 1. 简单栈溢出 (Baby PWN)
```
特征: gets/scanf, 无 canary, 有 win 函数
攻击: 溢出到 win 地址
模板: pwn_fast_ret2win.py
时间: 2-3 分钟
```

### 2. ret2libc
```
特征: 有 puts/printf, 需要 libc
攻击: 泄漏 GOT, 计算 base, 调用 system
模板: pwn_fast_ret2libc.py
时间: 5-7 分钟
```

### 3. 格式化字符串
```
特征: printf(buf) 或 format 参数
攻击: 泄漏 canary/PIE/libc, 写入 GOT
模板: pwn_fast_fmt.py
时间: 5-10 分钟
```

### 4. 堆利用
```
特征: malloc/free 循环, 菜单题
攻击: UAF/double-free/tcache poisoning
模板: pwn_fast_heap.py
时间: 10-15 分钟
```

### 5. 静态二进制
```
特征: 无动态链接, 体积大
攻击: syscall ROP 或 ORW
模板: pwn_fast_orw.py
时间: 7-10 分钟
```

### 6. Seccomp 限制
```
特征: seccomp-tools 显示限制
攻击: ORW 读取 flag
模板: pwn_fast_orw.py
时间: 7-10 分钟
```

### 7. C++ 虚表劫持
```
特征: C++ 编译, 虚函数调用
攻击: 覆盖 vtable 指针
参考: cxx-object-uaf.md
时间: 10-15 分钟
```

### 8. 内核 PWN
```
特征: /dev/ptmx, commit_creds
攻击: 内核 ROP
参考: kernel-pwn.md
时间: 20+ 分钟
```

---

## 六、快速攻击流程图

```
开始
  │
  ├─ 有源码? ─── 是 ──→ 分析漏洞点 ──→ 直接利用
  │
  └─ 无源码
       │
       ├─ file/checksec/strings
       │
       ├─ 有 win/backdoor? ─── 是 ──→ ret2win
       │
       └─ 无 win
            │
            ├─ 格式化字符串? ─── 是 ──→ fmt 泄漏 + 写入
            │
            └─ 无格式化
                 │
                 ├─ 堆菜单? ─── 是 ──→ 堆利用
                 │
                 └─ 无堆菜单
                      │
                      ├─ 栈溢出?
                      │    │
                      │    ├─ 有 canary? ─── 是 ──→ 泄漏 canary
                      │    │
                      │    └─ 无 canary
                      │         │
                      │         ├─ 有 PIE? ─── 是 ──→ 泄漏 PIE
                      │         │
                      │         └─ 无 PIE
                      │              │
                      │              ├─ NX off? ─── 是 ──→ shellcode
                      │              │
                      │              └─ NX on
                      │                   │
                      │                   ├─ 有 puts/printf? ─── 是 ──→ ret2libc
                      │                   │
                      │                   └─ 无泄漏 ──→ 需要其他思路
                      │
                      └─ 无栈溢出 ──→ 分析其他漏洞
```

---

## 七、工具优先级

### 快速分析 (< 2 分钟)
1. `file` - 基本信息
2. `checksec` - 保护状态
3. `strings` - 可疑字符串
4. `readelf -s` - 符号表

### 深入分析 (2-5 分钟)
5. `ctf-binary-probe` - 综合分析
6. `ROPgadget` - 可用 gadgets
7. `objdump -d` - 反汇编关键函数

### 利用开发 (5-10 分钟)
8. `ctf-pwn-crash-probe` - 崩溃偏移
9. `ctf-pwn-format-map` - 格式化字符串
10. `ctf-pwn-heap-menu-map` - 堆菜单
11. `ctf-pwn-libc-resolver` - libc 符号

### 调试验证 (10+ 分钟)
12. `gdb` - 动态调试
13. `ctf-pwn-gdb-snapshot` - 状态快照
14. `ctf-pwn-remote-drift-check` - 远程偏差

---

## 八、常见失败原因与解决

| 失败 | 原因 | 解决 |
|------|------|------|
| 偏移错误 | 输入长度计算错误 | 用 cyclic 精确计算 |
| libc 版本错误 | 使用了错误的 libc | 用 `ctf-pwn-libc-resolver` |
| canary 未泄漏 | 泄漏方式错误 | 检查格式化字符串偏移 |
| 堆利用失败 | glibc 版本不匹配 | 检查版本，调整技术 |
| 远程失败 | 本地/远程环境差异 | 用 `ctf-pwn-remote-drift-check` |
| shellcode 不执行 | NX 开启 | 改用 ret2libc |
| ROP 链失败 | gadget 地址错误 | 检查 PIE/ASLR |
| seccomp 阻止 | execve 被禁 | 改用 ORW |

---

## 九、竞赛策略

### 时间分配 (30 分钟题目)
- 0-2 分钟: 分析识别
- 2-10 分钟: 快速利用尝试
- 10-20 分钟: 深入利用
- 20-25 分钟: 最后尝试
- 25-30 分钟: 写解题报告

### 优先级
1. 简单题先做 (5-10 分钟)
2. 中等题次之 (10-20 分钟)
3. 困难题最后 (20+ 分钟)

### 放弃条件
- 10 分钟无进展 → 换题或换思路
- 20 分钟无进展 → 写解题报告
- 多次失败 → 检查前提假设
