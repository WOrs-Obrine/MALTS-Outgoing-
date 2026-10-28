// 旁听侧车 · 最小骨架
// 作用：连 OneBot 的 WS，旁听所有消息（不发言），本地算印象/数值/激素，
//       每分钟 tick 一次，写「当前状态卡」供人设读取。
// 特点：不占上下文、不花 token；只有真的发消息才走模型。
//
// 用法：
//   node 侧车骨架.mjs
// 环境变量：
//   WS_URL=ws://127.0.0.1:3001  TOKEN=xxx  BOT_QQ=1000000001  OWNER_QQ=1000000002
//   DATA_DIR=D:/my-bot/data     MEM_DIR=D:/my-bot/memory
//   SEND=1 才真的发消息（默认只算不发，安全）
//
// Node 22+ 自带 WebSocket，无需装依赖。

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { join } from 'node:path'

const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:3001'
const TOKEN = process.env.TOKEN || ''
const BOT_QQ = process.env.BOT_QQ || '1000000001'
const OWNER_QQ = process.env.OWNER_QQ || '1000000002'
const DATA_DIR = process.env.DATA_DIR || 'D:/my-bot/data'
const MEM_DIR = process.env.MEM_DIR || 'D:/my-bot/memory'
const SEND = process.env.SEND === '1'
const HOUR = 3600_000

mkdirSync(DATA_DIR, { recursive: true })
mkdirSync(join(MEM_DIR, '热记忆'), { recursive: true })

// ---------- 小工具 ----------
const now = () => Date.now()
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v))
const r1 = (v) => Math.round(v * 10) / 10

function load(file, fallback) {
  try {
    const t = readFileSync(join(DATA_DIR, file), 'utf8').replace(/^\uFEFF/, '')
    return JSON.parse(t) ?? fallback
  } catch {
    return fallback
  }
}

function save(file, data) {
  const p = join(DATA_DIR, file)
  const tmp = p + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  renameSync(tmp, p) // 原子替换，避免读到半个文件
}

// ---------- 状态 ----------
const impressions = load('印象.json', {})   // { "<QQ>": { score, nick, lastAt, hits } }
const growth = load('养成.json', {
  stats: { satiety: 70, hygiene: 70, stamina: 80, sleepiness: 30, arousal: 4, health: 90 },
  profile: { weight: 55 },
  intimate: { lewd: 10, bold: 25, climax: 0, arousalAt: 0, climaxAt: 0, zones: {} },
  intimateBy: {},
})
const hormones = load('激素.json', {
  dopamine: 0.3, oxytocin: 0.3, cortisol: 0.1, serotonin: 0.5,
  peak: {}, events: [],
})

// 档位：特别关注 / 好感 / 熟人 / 路人
const tierOf = (s) => (s >= 60 ? '特别关注' : s >= 20 ? '好感' : s >= 11 ? '熟人' : '路人')

// ---------- 事件 → 数值 ----------
// 词表很粗，只是骨架；真实项目里按场景拆细
const WARM = /(谢谢|喜欢你|好可爱|抱抱|摸摸|辛苦|晚安|早上好)/
const SNAP = /(滚|闭嘴|烦|蠢|废物|傻)/
const INTIMATE = /(亲|吻|抱|摸|舔|湿|硬|胸|腿|穴|宝贝|乖)/

function bumpQQ(qq, nick, delta, reason) {
  const key = String(qq)
  const p = impressions[key] || { score: 0, nick, lastAt: 0, hits: 0 }
  p.nick = nick || p.nick
  p.score = clamp((p.score ?? 0) + delta, -50, 100)
  p.hits = (p.hits ?? 0) + 1
  p.lastAt = now()
  p.lastReason = reason
  impressions[key] = p
}

function noteHormone(kind) {
  // 只做示意：真实项目里按事件表加权 + 半衰期
  if (kind === 'warm') { hormones.oxytocin = clamp(hormones.oxytocin + 0.06, 0, 1); hormones.dopamine = clamp(hormones.dopamine + 0.03, 0, 1) }
  if (kind === 'snap') { hormones.cortisol = clamp(hormones.cortisol + 0.08, 0, 1) }
  if (kind === 'addr') { hormones.dopamine = clamp(hormones.dopamine + 0.04, 0, 1) }
  const p = hormones.peak || (hormones.peak = {})
  for (const k of ['dopamine', 'oxytocin', 'cortisol', 'serotonin']) {
    if ((p[k] ?? 0) < hormones[k]) p[k] = r1(hormones[k] * 100) / 100
  }
  hormones.events = (hormones.events || []).slice(-30)
  hormones.events.push({ at: now(), kind })
  hormones.updatedAt = now()
}

function onMessage(ev) {
  const d = ev?.data && typeof ev.data === 'object' ? ev.data : ev
  if (!d || d.post_type !== 'message') return
  const text = String(d.raw_message ?? d.message ?? '')  // 简化：CQ 码原样
  const uid = String(d.user_id ?? '')
  const nick = String(d.sender?.card || d.sender?.nickname || uid)
  const isGroup = d.message_type === 'group'
  if (!uid || uid === BOT_QQ) return

  // 旁听：只记，不回
  const warm = WARM.test(text)
  const snap = SNAP.test(text)
  const intimate = INTIMATE.test(text)
  bumpQQ(uid, nick, warm ? 2 : snap ? -2 : 1, warm ? '聊得暖' : snap ? '被怼' : '说话')

  if (intimate && !isGroup) {
    // 私聊里的调戏：推兴奋度，并打 arousalAt（判定「在戏里」用）
    growth.stats.arousal = clamp((growth.stats.arousal ?? 0) + 6)
    growth.intimate = growth.intimate || {}
    growth.intimate.arousalAt = now()
  }
  if (uid === OWNER_QQ && INTIMATE.test(text)) growth.stats.arousal = clamp((growth.stats.arousal ?? 0) + 4)
  noteHormone(warm ? 'warm' : snap ? 'snap' : 'addr')

  // 她说过话，刷新「最近互动」
  if (uid === BOT_QQ) { /* no-op，骨架里 bot 自己的消息不参与计分 */ }
}

// ---------- 每分钟 tick ----------
const HALF_LIFE = { dopamine: 3 * HOUR, oxytocin: 8 * HOUR, cortisol: 6 * HOUR, serotonin: 12 * HOUR }

function tick() {
  const t = now()
  const dt = 60_000
  // 激素半衰期（本地算，0 token）
  for (const [k, hl] of Object.entries(HALF_LIFE)) {
    const floor = 0.15
    hormones[k] = floor + (hormones[k] - floor) * Math.pow(0.5, dt / hl)
  }

  // 养成：饱食/清洁/睡意/体力
  const st = growth.stats
  st.satiety = clamp((st.satiety ?? 70) - 0.05)
  st.hygiene = clamp((st.hygiene ?? 70) - 0.02)
  const hour = new Date().getHours()
  st.sleepiness = clamp((st.sleepiness ?? 30) + (hour >= 0 && hour < 8 ? -0.35 : 0.06))
  const sleeping = (st.sleepiness ?? 0) > 80
  st.stamina = clamp((st.stamina ?? 80) + (sleeping ? 0.3 : (st.sleepiness > 75 || (st.arousal ?? 0) >= 45 ? -0.2 : 0.05)))

  // 兴奋度：在戏里涨，不在落（「在戏」只看最近互动时间，不看结果）
  const it = growth.intimate || (growth.intimate = {})
  const lastTouch = Math.max(it.climaxAt ?? 0, it.arousalAt ?? 0)
  const inScene = process.env.CONSORT_ON === '1' || (lastTouch > 0 && t - lastTouch < 10 * 60_000)
  st.arousal = clamp(inScene ? (st.arousal ?? 0) + 0.25 : Math.max(4, (st.arousal ?? 0) - 0.3))
  // 淫荡/大胆：不在戏时回落，在戏时按兴奋度加速
  const up = 0.3 + (st.arousal / 100) * 1.2
  it.lewd = clamp(inScene ? (it.lewd ?? 10) + 0.35 * up : (it.lewd ?? 10) - 0.35, 10)
  it.bold = clamp(inScene ? (it.bold ?? 25) + 0.15 * up : (it.bold ?? 25) - 0.14, 25)
  // 高潮度只在不在戏时衰减；2 小时无接触归零
  if (!inScene) {
    it.climax = clamp((it.climax ?? 0) - 0.5)
    if (it.climaxAt && t - it.climaxAt > 2 * HOUR) it.climax = 0
  }

  // 落盘（节流：每 5 分钟）
  const lastWrite = globalThis.__lastWrite ?? 0
  if (t - lastWrite > 5 * 60_000) {
    globalThis.__lastWrite = t
    growth.updatedAt = t
    impressions.updatedAt = t
    save('养成.json', growth)
    save('印象.json', impressions)
    save('激素.json', hormones)
    writeStateCard()
  }
}

// ---------- 当前状态卡（人设每回合读） ----------
function writeStateCard() {
  const st = growth.stats
  const it = growth.intimate || {}
  const top = Object.entries(impressions).filter(([k]) => k !== OWNER_QQ)
    .sort((a, b) => (b[1].score ?? 0) - (a[1].score ?? 0)).slice(0, 8)
  const lines = [
    '# 当前状态（侧车自动写，不要手改）',
    '',
    `- 时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `- 身体：饱食 ${st.satiety.toFixed(0)} / 清洁 ${st.hygiene.toFixed(0)} / 体力 ${st.stamina.toFixed(0)} / 睡意 ${st.sleepiness.toFixed(0)} / 兴奋 ${st.arousal.toFixed(0)} / 健康 ${st.health ?? 90}`,
    `- 私密：淫荡 ${it.lewd?.toFixed(0) ?? 10} / 大胆 ${it.bold?.toFixed(0) ?? 25} / 高潮 ${it.climax?.toFixed(0) ?? 0}`,
    `- 激素：多巴胺 ${(hormones.dopamine * 100).toFixed(0)}% 催产素 ${(hormones.oxytocin * 100).toFixed(0)}% 皮质醇 ${(hormones.cortisol * 100).toFixed(0)}% 血清素 ${(hormones.serotonin * 100).toFixed(0)}%`,
    '',
    '## 关系',
    ...top.map(([qq, p]) => `- ${p.nick || qq}（${tierOf(p.score ?? 0)}，${Math.round(p.score ?? 0)}）`),
  ]
  writeFileSync(join(MEM_DIR, '热记忆', '当前状态.md'), lines.join('\n'), 'utf8')
}

// ---------- OneBot WS ----------
let ws = null
let backoff = 1000

function connect() {
  const url = TOKEN ? `${WS_URL}?access_token=${encodeURIComponent(TOKEN)}` : WS_URL
  ws = new WebSocket(url)
  ws.addEventListener('open', () => { backoff = 1000; console.log('[sidecar] connected', WS_URL) })
  ws.addEventListener('message', (m) => {
    try { onMessage(JSON.parse(m.data)) } catch (e) { console.warn('[sidecar] bad event', e?.message) }
  })
  ws.addEventListener('close', () => {
    console.warn('[sidecar] closed, reconnect in', backoff, 'ms')
    setTimeout(connect, backoff)
    backoff = Math.min(backoff * 2, 30_000)
  })
  ws.addEventListener('error', () => { /* close 会跟着来 */ })
}

// 可选：真的发消息（默认关闭）
export function sendPrivate(userId, text) {
  if (!SEND || !ws || ws.readyState !== 1) return false
  ws.send(JSON.stringify({ action: 'send_private_msg', params: { user_id: Number(userId), message: [{ type: 'text', data: { text } }] } }))
  return true
}

connect()
setInterval(tick, 60_000)
tick()
console.log('[sidecar] up. SEND=' + SEND, 'data=' + DATA_DIR)
