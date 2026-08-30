# 项目状态(project-state)

> **每次开发会话:开场先读我,收工必更新我。** 最后更新:2026-08-30

## 一句话现状

文档与设计阶段完成,已上传 GitHub;**下一步:写实施计划,然后搭建项目骨架**。

## 已完成

- [x] 需求澄清与设计文档(brainstorming 全流程,用户已确认)
- [x] 技术方案:Node 全栈(方案一),真实行情,完整交易规则,随时可交易
- [x] Stitch 设计稿:5 屏已拉取审阅(`design/stitch/`),4 处已知偏差实现时修正(见 requirements.md §6)
- [x] Stitch MCP 接入:代理补丁 + 包装脚本(仓库外 `~/.zcode/stitch-proxy/`),doctor 体检通过
- [x] 文档体系:README / AGENTS / requirements / architecture / 本文件
- [x] GitHub 仓库:`WYW-1127/stock-learning`(私有),main 分支已推送

## 下一步(按序)

1. **写实施计划** — 按 architecture.md 拆任务排期(建议顺序:骨架 → 交易引擎+测试 → 行情服务 → 前端五屏 → 联调)
2. 搭建项目骨架:server/ + web/ + content/ + 启动.bat + 根 package.json 工作区脚本
3. 交易引擎纯函数 + vitest 全量单测(测试清单见 architecture.md §9)
4. 行情服务:腾讯实时(GBK 解码)+ 东财 K线/搜索 + 缓存重试
5. 前端五屏按设计稿实现(klinecharts 渲染真实 K线)
6. 联调 + 手动测试清单验收

## 待用户事项

- 无

## 关键信息速查

| 项 | 值 |
|---|---|
| GitHub | WYW-1127/stock-learning(私有) |
| Stitch 项目 ID | 13228539535838239483 |
| 屏幕对照 | design/stitch/index.json |
| 系统代理 | 127.0.0.1:7897(仅 Google/Stitch 流量) |
| Stitch CLI | `bash C:/Users/wangy/.zcode/stitch-proxy/stitch.sh <命令>` |
| Node | v22.14.0(fetch 代理补丁见 architecture.md §8) |

## 已知问题 / 风险

- 免费行情接口可能变动:已按"重试×2 + 降级显示旧数据"设计,实现时注意友好降级
- Node 22 无内置 fetch 代理:任何访问 Google 域名的脚本都要带补丁环境变量(见 AGENTS.md)

## 决策记录追加处

重大新决策追加到 `docs/architecture.md` §1 决策记录表,此处只写一行指针。

---

### 更新日志

- 2026-08-30:建立文档体系;完成设计/审稿/接入/GitHub 上传;下一步写实施计划
