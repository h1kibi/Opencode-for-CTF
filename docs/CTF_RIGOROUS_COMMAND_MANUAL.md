# CTF Rigorous 命令总览与使用手册

> 适用范围：`ctf-master` 模式下的复杂、困难、分支多、易漂移、需要恢复、需要收尾的 CTF 题目。  
> 目标：让你在实战时知道 **什么时候该用哪个命令**，而不是在一堆命令里犹豫。

---

# 1. 总体原则

`ctf-master` 不是靠“多试 payload”取胜，而是靠：

- 正确的 **主线 owner**
- 稳定的 **top-3 hypothesis queue**
- 明确的 **next one-variable probe**
- 及时进入 **closure / endgame**
- 避免无记录 pivot、无边界扩展、无意义重复

如果你不确定下一步干什么，优先考虑控制类命令，而不是继续乱试。

---

# 2. 命令分层速览

你现在的 `ctf-master` 相关命令，大致分成 6 类：

## A. 入口 / 模式
- `/ctf-fast`
- `/ctf-master`
- `/ctf-choose`

## B. 快照 / 恢复 / 状态整理
- `/ctf-snapshot`
- `/ctf-ledger`
- `/ctf-recover`
- `/ctf-resume`

## C. 分支 / 路由 / owner
- `/ctf-branch`
- `/ctf-owner`
- `/ctf-pivot`
- `/ctf-route`

## D. 收尾 / 终局 / final
- `/ctf-closure`
- `/ctf-close`
- `/ctf-endgame`
- `/ctf-final`

## E. 全局控制 / 停止 / 升级
- `/ctf-control`
- `/ctf-escalate`
- `/ctf-stop-gate`

## F. 链路 / 状态机 /辅助纪律
- `/ctf-chain-state`
- `/ctf-chain-advance`
- `/ctf-validate-probe`

---

# 3. 高频命令：先记这 10 个就够了

如果你不想一开始记太多，先记下面这 10 个：

1. `/ctf-master` —— 进入困难题主模式
2. `/ctf-snapshot` —— 轻量状态快照
3. `/ctf-ledger` —— 重型状态整理
4. `/ctf-recover` —— 中断恢复
5. `/ctf-owner` —— 定 primary owner
6. `/ctf-branch` —— 分支控制
7. `/ctf-control` —— 不知道下一步用哪个控制命令时先用它
8. `/ctf-closure` —— 进入 primitive→flag 收尾
9. `/ctf-endgame` —— 判断 close_more / final_now / not_ready
10. `/ctf-final` —— 最终验证 flag

如果只记住这 10 个，已经足够实战大多数 hard 题。

---

# 4. 每个命令什么时候用

## 4.1 入口 / 模式

### `/ctf-choose`
**什么时候用：**
- 一道新题刚开始，还不确定用 `ctf-fast` 还是 `ctf-master`

**适合：**
- 新题分类
- 复杂度初判

**不要用在：**
- 已经打了一半的题

---

### `/ctf-master`
**什么时候用：**
- 多分支
- 有 source / archive / bytecode / Docker / config
- 多角色 / 状态机 / 权限边界复杂
- 已经卡住
- 已经确认是 hard 题

**一句话理解：**
困难题主模式。

---

## 4.2 快照 / 恢复 / 状态整理

### `/ctf-snapshot`
**什么时候用：**
- 一个 probe 跑完后
- 暂停前
- pivot 前
- 感觉状态有点乱，但还没乱到要大整理

**作用：**
- 输出最小可恢复状态
- 给出一个推荐控制动作

**一句话理解：**
轻量拍快照。

**不要替代：**
- `/ctf-ledger` 的完整整理

---

### `/ctf-ledger`
**什么时候用：**
- top-3 不清楚
- hypothesis queue 发 stale
- chain ledger 发 stale
- pivot 记不清
- shared segment 太多

**作用：**
- 重整 hypothesis queue
- 重整 Best Evidence Snapshot
- 重整 pivot bookkeeping

**一句话理解：**
重型账本整理。

---

### `/ctf-recover`
**什么时候用：**
- 对话中断
- 模型超时
- 工具失败后回来
- 多轮后状态已模糊

**作用：**
- 从 Best Evidence Snapshot 恢复
- 尽量不重开 recon

**一句话理解：**
恢复到“还能继续打”的状态。

---

### `/ctf-resume`
**什么时候用：**
- 你有旧 notes / decision-state / solve.py / work 目录
- 需要从已有工件重建 solve 状态

**和 `/ctf-recover` 的区别：**
- `/ctf-recover` 更偏当前会话恢复
- `/ctf-resume` 更偏从已有文件/记录重建历史状态

---

## 4.3 分支 / 路由 / owner

### `/ctf-owner`
**什么时候用：**
- 看起来又像 Web，又像 Rev / Java / Forensics
- 不知道当前主要 owner 应该是谁
- mixed-evidence 题

**作用：**
- 选一个 primary owner
- 最多保留一个 supporting surface

**一句话理解：**
先确定“谁是主脑”。

---

### `/ctf-branch`
**什么时候用：**
- 多条 plausible branch 并存
- 当前 branch 变 noisy
- 想 pivot，但不想丢状态

**作用：**
- top-3 branch 管理
- branch 切换
- 避免无记录横跳

**一句话理解：**
选哪条线继续打。

---

### `/ctf-pivot`
**什么时候用：**
- 两次 same-family probe 没有新 differential
- 当前 family 已经低信息量

**作用：**
- 强制换到 orthogonal next probe

**一句话理解：**
从一个死 family 里拔出来。

---

### `/ctf-route`
**什么时候用：**
- 一开始分类
- challenge 类型还不稳定

**一句话理解：**
做 route gate。

---

## 4.4 收尾 / 终局 / final

### `/ctf-closure`
**什么时候用：**
- 已经有 high-value primitive
- 但 flag 还没拿到
- 需要从 primitive 往 flag 收口

**作用：**
- 建 Flag Location Model
- 选 top closure probe

**一句话理解：**
进入收尾模式。

---

### `/ctf-close`
**什么时候用：**
- branch 已经很强
- 想把 closure 往前推进一大步

**作用：**
- 推 primitive→flag 的近期闭合

**一句话理解：**
推进收尾。

---

### `/ctf-endgame`
**什么时候用：**
- 不确定现在是：
  - 还要再 close 一步
  - 还是已经该 final 了

**返回结果：**
- `CLOSE_MORE`
- `FINAL_NOW`
- `NOT_READY`
- `ABANDON_ENDGAME`

**一句话理解：**
判断“现在是不是终局”。

---

### `/ctf-final`
**什么时候用：**
- 已经有 candidate flag 或直接 extraction path
- 需要做最终验证

**作用：**
- 判断 `REAL_LIKELY / NEED_ONE_CONFIRMATION / REJECT`
- 输出最小 reproduction

**一句话理解：**
最终验旗。

---

## 4.5 全局控制 / 停止 / 升级

### `/ctf-control`
**什么时候用：**
- 你完全不知道现在该用哪个控制命令
- 状态 messy，但还没决定是 snapshot、ledger、owner、branch 还是 close

**作用：**
- 在这些控制动作里选唯一最佳下一步：
  - `SNAPSHOT`
  - `LEDGER`
  - `OWNER`
  - `BRANCH`
  - `CLOSE`
  - `CONTINUE`
  - `ASK_USER`
  - `STOP`
  - `RETRO`

**一句话理解：**
控制面板入口。

---

### `/ctf-escalate`
**什么时候用：**
- 不确定该继续、该 stop、该 closure、该 ask user、该 retro

**作用：**
- 输出唯一决策：
  - `CONTINUE`
  - `LEDGER`
  - `OWNER`
  - `CLOSURE`
  - `ASK_USER`
  - `RETRO`
  - `STOP`

**一句话理解：**
控制层升级决策器。

---

### `/ctf-stop-gate`
**什么时候用：**
- 预算快耗完
- 两个 top hypotheses 都死了
- 不确定是不是该停

**一句话理解：**
做停止判断。

---

## 4.6 链路 / 状态机 / 辅助纪律

### `/ctf-chain-state`
**什么时候用：**
- challenge 更像 chain problem
- 想显式维护 chain state

---

### `/ctf-chain-advance`
**什么时候用：**
- 不想手动 observe + report + reasoning
- 想快速拿“当前状态 + 下一步建议”

**一句话理解：**
链路辅助推进器。

---

### `/ctf-validate-probe`
**什么时候用：**
- 某个 probe 看起来像要越界或变量太多
- 需要确认是不是 one-variable probe

---

# 5. 推荐使用流程

## 场景 A：新 hard 题开局
1. `/ctf-choose`
2. 进入 `ctf-master`
3. `/ctf-owner`（如果类别混合）
4. `/ctf-snapshot`（形成第一版状态）

---

## 场景 B：多分支复杂题中段
1. `/ctf-snapshot`
2. `/ctf-branch`
3. `/ctf-ledger`
4. 如 still messy，则 `/ctf-control`

---

## 场景 C：有 primitive 但没旗
1. `/ctf-closure`
2. `/ctf-close`
3. `/ctf-endgame`
4. `/ctf-final`

---

## 场景 D：中断恢复
1. `/ctf-recover`
2. 如果依赖旧工件很多，可 `/ctf-resume`
3. `/ctf-snapshot`
4. 如状态 stale，则 `/ctf-ledger`

---

## 场景 E：完全不知道下一步
1. `/ctf-control`
2. 如果是高层继续/停止问题，再 `/ctf-escalate`

---

# 6. 最容易混淆的边界

## `/ctf-snapshot` vs `/ctf-ledger`
- `snapshot` = 轻量快照
- `ledger` = 重型整理

## `/ctf-recover` vs `/ctf-resume`
- `recover` = 当前 solve 状态恢复
- `resume` = 从 notes / work / decision-state 等历史工件恢复

## `/ctf-closure` vs `/ctf-close`
- `closure` = 进入收尾模式
- `close` = 推进收尾动作

## `/ctf-close` vs `/ctf-endgame`
- `close` = 做收尾推进
- `endgame` = 判断是否已经接近 final

## `/ctf-endgame` vs `/ctf-final`
- `endgame` = 判断是否 ready for final
- `final` = 真正验旗

## `/ctf-control` vs `/ctf-escalate`
- `control` = 选下一个控制动作
- `escalate` = 做更高层的继续/停止/closure/ask-user判断

---

# 7. 一个最实用的简化心法

如果你实战时记不住全部命令，就记住下面这套：

- 状态还行：`/ctf-snapshot`
- 状态乱了：`/ctf-ledger`
- owner 不清：`/ctf-owner`
- 分支打架：`/ctf-branch`
- 有 primitive：`/ctf-closure`
- 快收尾了：`/ctf-endgame`
- 要验旗：`/ctf-final`
- 完全不知道下一步：`/ctf-control`
- 中断恢复：`/ctf-recover`

这 9 个已经足够覆盖大多数 hard 题。

---

# 8. 什么时候不要继续加命令

如果你开始出现下面情况，说明应该先实战，不要再加：

- 你自己也开始分不清 close / closure / endgame / final
- 你开始在 snapshot / ledger / recover / resume 之间犹豫过久
- 你不再缺功能，而是缺真实使用反馈

到这一步，应优先：
- 去打真题
- 记录哪里不顺手
- 再做减法优化

---

# 9. 当前推荐结论

你的 `ctf-master` 命令体系已经具备实战能力。  
下一步不建议继续无上限加功能，而建议：

1. 拿真实复杂题测试
2. 记录使用摩擦点
3. 只根据真实反馈做下一轮精简/合并/修补

---

# 10. 一句话版本

> 不知道当前状态？先 `/ctf-snapshot`。  
> 状态乱了？`/ctf-ledger`。  
> 不知道谁主导？`/ctf-owner`。  
> 分支打架？`/ctf-branch`。  
> 有 primitive 了？`/ctf-closure`。  
> 快结束了？`/ctf-endgame`。  
> 要验旗？`/ctf-final`。  
> 完全不知道下一步？`/ctf-control`。  
> 中断了？`/ctf-recover`。
