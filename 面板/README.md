# 面板（dsh-impressions，脱敏移植版）

浏览器里管养成数值 / 私密栏 / 激素 / 日记 / 用量 / 场景开关的**宿主插件**。
这里是脱敏版：QQ 号换成 `1000000002` 这类占位符、数据目录换成环境变量，逻辑没删。

## 文件

| 文件 | 说明 |
| --- | --- |
| `index.js` | 宿主半：注册 HTTP 路由 + 提供 `qzone_post` 等工具 |
| `client.js` | 浏览器半：设置页里的各个页面（React h() 手写，无构建步骤） |
| `package.json` | DSH 插件清单（`dsh.bundle.patch` + `dsh.client` 注入） |
| `cordis.patch.yml` | 挂载声明 |

## 装法

1. 把这个目录复制成 `profiles/web/node_modules/dsh-impressions/`
2. 确认 `package.json` 里 `name: "dsh-impressions"`、`exports` 指向 `index.js` / `client.js`
3. 在 `profiles/web/cordis.patch.yml` 里启用（参考本目录 `cordis.patch.yml`）
4. **重启 DSH Desktop**，打开设置页 → 侧边栏出现「养成 / 日记 / 用量 / 安全」等页
5. 路由返回 401 是正常的（需要登录）；没登录时能用 curl 看 401 就说明注册成功

## 环境变量

```bash
MALTS_DATA=D:/my-bot/data        # 养成.json / 印象.json / 激素.json / 各种状态.json 所在目录
MALTS_PROMPT=D:/my-bot/persona   # 提示词/人设目录
MALTS_OWNER=1000000002           # 主人 QQ（默认值已写成占位符）
MALTS_BOT=1000000001             # bot QQ
```

数据文件结构（和侧车共用）：

```
data/
  养成.json          数值、intimateBy（每人一张私密表）
  印象.json          好感/档位
  激素.json          四条激素 + 峰值
  性癖.json          癖好定义与等级
  侍寝模式.json  跑团模式.json  开发者模式.json  赛博精神病.json
  日记状态.json  用量.json  主动草稿.json
```

## 功能

- **养成**：饱食/清洁/体力/睡意/兴奋/健康/体重 + 淫荡/大胆/高潮 + 私密栏（按人切换、部位备注、腔内情况）
- **激素**：四条彩条 + 历史峰值标线 + 最近 6 次推力
- **日记**：最近 7 天，按天折叠
- **用量**：近 7 天请求数、缓存命中率、空闲/高峰估算花费、每天柱状
- **安全**：开发者模式（4h TTL）、赛博精神病模式（6h）、侍寝（选人）、跑团（选群）
- **说说**：`qzone_post` 工具 + 晚上自动发当天素材（可关）

## 注意

- 面板里所有写入都是**直接改 JSON 文件**（tmp+rename 原子写），没有数据库；改完下一回合生效
- 时间戳字段（`noteAt/cavityAt/climaxAt`）只在值变化时刷新，否则「保存别的字段」会把衰减计时一直续命
- 这个脱敏版把本机路径换成了占位符，**首次运行前全局搜一下** `my-bot` / `1000000` 按你的实际目录改
