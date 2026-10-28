// dsh-impressions —— 宿主半：
//   1) 把「群友印象」暴露成 HTTP 路由，供设置页读写；
//   2) 提供「发布说说」工具（模型里叫 qzone_post），并在晚上自动把当天的素材发成 QQ 空间说说。
//
// 数据源：旁听服务维护的 印象.json / 今日素材.jsonl（都在 （数据目录））。
import { readFile, writeFile, rename } from 'node:fs/promises'
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs'
import Schema from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'dsh-impressions'
export const inject = ['connection', 'tools']

export const Config = Schema.object({
  qzoneEnabled: Schema.boolean().default(true).description('晚上自动发 QQ 空间说说'),
  qzoneHour: Schema.number().default(22).description('几点发（0-23，整点检查）'),
  qzoneUgcRight: Schema.number().default(1).description('说说可见范围：1=所有人 4=好友 64=仅自己'),
  qzoneOwner: Schema.string().default(process.env.MALTS_OWNER || '1000000002').description('发完私聊通知谁（QQ 号，留空不通知）'),
  minMaterial: Schema.number().default(1).description('当天至少几条素材才值得发（不够就不发）'),
})

const DIR = process.env.MALTS_DATA || 'D:/my-bot/data'
const PROMPT_DIR = process.env.MALTS_PROMPT || 'D:/my-bot/persona'
const STATE_PATH = `${DIR}\\印象.json`
const MD_PATH = `${DIR}\\印象.md`
const DESC_PATH = `${DIR}\\画像.json`
const MATERIAL_PATH = `${DIR}\\今日素材.jsonl`
const QZONE_STATE = `${DIR}\\说说状态.json`
const NAPCAT_API = 'http://127.0.0.1:3000'

/** 主人（管理员）的分数保底，和旁听服务保持一致。 */
const OWNER_QQ = process.env.MALTS_OWNER || '1000000002'
const OWNER_MIN_SCORE = 50
/** 麦芽汁自己的 QQ，用来把私聊关系边标成「私聊 麦芽汁」。 */
const BOT_QQ = process.env.MALTS_BOT || '1000000001'

function floorScore(qq, score) {
  const n = Number(score ?? 0)
  return qq === OWNER_QQ ? Math.max(OWNER_MIN_SCORE, n) : n
}

/** 后台手写的画像描述：{ "QQ": "一句话" }，设置页里能改。 */
function readDescriptors() {
  try {
    const raw = JSON.parse(readFileSync(DESC_PATH, 'utf8'))
    return raw && typeof raw === 'object' ? raw : {}
  } catch { return {} }
}

async function writeDescriptors(descs) {
  const tmp = `${DESC_PATH}.tmp`
  await writeFile(tmp, `${JSON.stringify(descs, null, 2)}\n`, 'utf8')
  await rename(tmp, DESC_PATH)
}

/** 好感分（给工具做准入用；读不到就按 0）。 */
function favorOf(qq) {
  try {
    const st = JSON.parse(readFileSync(DIR + '\\印象.json', 'utf8'))
    return Number(st?.people?.[String(qq)]?.score ?? 0)
  } catch { return 0 }
}
const QZONE_COMMENT_MIN = 20

const TIERS = [
  { min: 60, tag: '特别关注', tone: '可以主动接梗、多说两句、允许插话' },
  { min: 20, tag: '好感', tone: '轻松、可以调侃、回应热情一点' },
  { min: -19, tag: '熟人', tone: '正常聊天，不必刻意热情' },
  { min: -59, tag: '不喜欢', tone: '简短、公事公办、不接梗' },
  { min: -1000, tag: '讨厌', tone: '尽量少说；未被 @ 时可以不回' },
]

function tierOf(score) {
  return TIERS.find((t) => score >= t.min) ?? TIERS[TIERS.length - 1]
}

async function readState() {
  try {
    const raw = JSON.parse(await readFile(STATE_PATH, 'utf8'))
    if (raw && typeof raw === 'object' && raw.people) return raw
  } catch {}
  return { version: 1, updatedAt: 0, people: {} }
}

async function writeState(state) {
  state.updatedAt = Date.now()
  const descs = readDescriptors()
  state.descriptors = descs
  for (const [qq, person] of Object.entries(state.people)) {
    person.score = Number(floorScore(qq, person.score).toFixed(1))
    person.desc = String(descs[qq] ?? '').trim()
  }
  const tmp = `${STATE_PATH}.ui.tmp`
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(tmp, STATE_PATH)
  await writeMarkdown(state)
}

async function writeMarkdown(state) {
  const people = Object.entries(state.people)
    .map(([qq, p]) => ({ qq, ...p, tier: tierOf(p.score) }))
    .sort((a, b) => b.score - a.score)
  const lines = ['# 群友印象（自动维护，别手改这个文件）', '', `更新于 ${new Date().toLocaleString('zh-CN')}`, '']
  if (people.length === 0) lines.push('（还没有记录，聊几句就会有了）')
  for (const p of people) {
    const nick = p.nick ? `${p.nick}（${p.qq}）` : p.qq
    lines.push(`## ${nick} · 好感 ${Number(p.score).toFixed(1)} · ${p.tier.tag}`)
    lines.push(`- 策略：${p.tier.tone}`)
    const about = String(p.desc ?? '').trim() || String(p.auto ?? '').trim()
    if (about) lines.push(`- 印象：${about}`)
    if (p.lastText) lines.push(`- 最近说过：「${String(p.lastText).slice(0, 60)}」`)
    if (p.groups?.length) lines.push(`- 出现于群：${p.groups.join('、')}`)
    lines.push(`- 消息数 ${p.msgs ?? 0}，最后互动 ${new Date(p.updatedAt || 0).toLocaleString('zh-CN')}`)
    lines.push('')
  }
  await writeFile(MD_PATH, `${lines.join('\n')}\n`, 'utf8').catch(() => {})
}

function view(state) {
  const descs = readDescriptors()
  return {
    updatedAt: state.updatedAt ?? 0,
    people: Object.entries(state.people)
      .map(([qq, p]) => {
        const score = Number(floorScore(qq, p.score).toFixed(1))
        const tier = tierOf(score)
        return {
          qq,
          nick: p.nick ?? '',
          score,
          tier: tier.tag,
          tone: tier.tone,
          msgs: p.msgs ?? 0,
          groups: p.groups ?? [],
          lastText: p.lastText ?? '',
          updatedAt: p.updatedAt ?? 0,
          desc: String(descs[qq] ?? '').trim(),
          auto: p.auto ?? '',
          isOwner: qq === OWNER_QQ,
        }
      })
      .sort((a, b) => b.score - a.score),
  }
}

async function readJson(request) {
  const text = await request.text()
  if (!text) return {}
  try { return JSON.parse(text) } catch { return {} }
}

function todayMaterial() {
  const today = new Date().toISOString().slice(0, 10)
  if (!existsSync(MATERIAL_PATH)) return []
  const out = []
  for (const line of readFileSync(MATERIAL_PATH, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry.date === today) out.push(entry)
    } catch {}
  }
  return out
}

function readQzoneState() {
  try { return JSON.parse(readFileSync(QZONE_STATE, 'utf8')) } catch { return {} }
}

async function writeQzoneState(state) {
  await writeFile(QZONE_STATE, `${JSON.stringify(state, null, 2)}\n`, 'utf8').catch(() => {})
}

/** 调 NapCat 的 OneBot HTTP 接口。 */
async function onebot(action, payload) {
  const res = await fetch(`${NAPCAT_API}/${action}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (data.status !== 'ok') throw new Error(`${action} 失败：${data.retcode} ${data.wording ?? ''}`)
  return data.data
}

/**
 * QQ 空间的 send_qzone_msg 只吃单行：正文里带换行时，只发出去第一行，
 * 后面的段落会被吞掉（2026-10-22 实测：三段话只出来第一段）。
 * 所以发之前把所有换行和连续空白压成一格，保证整段都能落到说说里。
 */
function flattenQzoneText(content) {
  return String(content ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/** 发一条说说；可见范围默认所有人。 */
async function postQzone(content, ugcRight = 1) {
  const text = flattenQzoneText(content)
  if (!text) throw new Error('说说内容是空的')
  const data = await onebot('send_qzone_msg', { content: text, ugc_right: ugcRight })
  return data?.tid ?? ''
}

/** 日期种子的伪随机：同一天稳定，换天就变（避免每天抄同一套句式）。 */
function dayRng(day) {
  let h = 2166136261
  const s = String(day)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickOne(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length]
}

/** 用 (日期 + 用途) 的哈希直接取下标：每种句子各自独立挑，避免「同一天里几条都撞同一个」。 */
function hashPick(seedStr, arr) {
  let h = 2166136261
  const s = String(seedStr)
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return arr[(h >>> 0) % arr.length]
}

/** 把今天的素材攒成一段麦芽汁口吻的说说；不值得发返回 null。
 *  recent = 最近发过的正文，用来避开「连续几天开头一模一样」。 */
function composePost(material, minMaterial, day = new Date().toISOString().slice(0, 10), recent = []) {
  const good = material.filter((m) => ['冒犯', '趣事', '夸奖'].includes(m.kind))
  if (good.length < minMaterial) return null

  const recentSet = new Set(recent.map((t) => String(t).replace(/\s+/g, '')))
  // 换一个下标重挑，最多试 6 次；全撞就认了
  const avoid = (arr, salt) => {
    for (let i = 0; i < 6; i += 1) {
      const pick = hashPick(`${day}${salt}${i > 0 ? '#' + i : ''}`, arr)
      if (![...recentSet].some((r) => r.includes(pick.replace(/\s+/g, '')))) return pick
    }
    return hashPick(`${day}${salt}`, arr)
  }

  const pickLine = (salt, arr) => avoid(arr, salt)
  const rng = dayRng(day)
  const offended = good.filter((m) => m.kind === '冒犯')
  const funny = good.filter((m) => m.kind === '趣事')
  const praised = good.filter((m) => m.kind === '夸奖')

  const lines = []
  if (offended.length > 0) {
    lines.push(pickLine('|off', [
      '今天有人跟本小姐说话挺冲的喔，记下了。',
      '行吧，今天又被谁呛了一句，本小姐记仇的。',
      '谁给他们的胆子这么跟本小姐讲话？记着。',
      '今天挨了一句不太客气的，本小姐没当场发作，算他运气好。',
      '有人在群里对本小姐放狠话，本小姐笑了一下，记在本子上了。',
      '今天没心情跟谁计较，但不代表本小姐忘了。',
    ]))
  }
  if (funny.length > 0) {
    const top = funny[funny.length - 1]
    const quote = top.text.length > 60 ? `${top.text.slice(0, 60)}…` : top.text
    lines.push(pickLine('|fun', [
      `今天在群里看到一句挺离谱的：「${quote}」，本小姐当场就没绷住。`,
      `记一句离谱的：「${quote}」——谁懂啊。`,
      `「${quote}」。就这一句，本小姐笑到现在。`,
      `今日份离谱发言：「${quote}」。以后当笑话讲。`,
      `群里有人在讲「${quote}」，本小姐在旁边听得直摇头。`,
      `「${quote}」——人类真是越来越有意思了。`,
      `抄一句今天的原话：「${quote}」。留个证据。`,
    ]))
  }
  if (praised.length > 0 && rng() < 0.6) {
    lines.push(pickLine('|praise', [
      '当然，也是有人识货的，会说两句好听的。本小姐勉强受着。',
      '还是有人会说人话的，夸得还算中听。',
      '有人夸本小姐，本小姐听见了，装作没听见。',
      '今天被夸了，心情不错，就不跟谁计较了。',
      '被夸的时候本小姐一般不说话，心里是受用的。',
    ]))
  }

  // 结构别固定：有时一句就收，有时两行；签名三分之一的概率才带
  if (lines.length > 1 && rng() < 0.4) lines.length = 1
  if (rng() < 0.34) {
    lines.push(pickLine('|tail', ['——今日份。', '——麦芽汁，今日份碎碎念。', '——就这些。', '——记于今晚。']))
  }
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return text === '' ? null : text
}

export function apply(ctx, config) {
  // ── 印象面板接口 ──────────────────────────────────────────────
  ctx.connection.fetch.register({
    path: '/api/impressions',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      const state = await readState()
      return Response.json(view(state), { headers: { 'cache-control': 'no-store' } })
    },
  })

  // ── 激素/无聊度面板（数据由旁听服务本地算，写 激素.json）──────────
  ctx.connection.fetch.register({
    path: '/api/impressions/hormones',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      try {
        const raw = JSON.parse(readFileSync(DIR + '\\激素.json', 'utf8'))
        return Response.json({ ok: true, ...raw }, { headers: { 'cache-control': 'no-store' } })
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message ?? error), updatedAt: 0 }, { status: 500 })
      }
    },
  })
  ctx.connection.fetch.register({
    path: '/api/impressions/hormones/draft',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      try {
        const raw = JSON.parse(readFileSync(DIR + '\\主动草稿.json', 'utf8'))
        return Response.json({ ok: true, ...raw }, { headers: { 'cache-control': 'no-store' } })
      } catch {
        return Response.json({ ok: false, error: '还没有草稿' })
      }
    },
  })

  // ── 开发者模式（安全闸）：本地读写 （数据目录）\开发者模式.json ──────
  const DEV_MODE_FILE = DIR + '\\开发者模式.json'
  const DEV_MODE_AUDIT = DIR + '\\审计-开发者模式.log'
  const DEV_MODE_TTL = 4 * 3600_000
  function readDevMode() {
    let st = { on: false, at: 0, until: 0, by: '', reason: '' }
    try {
      const raw = JSON.parse(readFileSync(DEV_MODE_FILE, 'utf8'))
      if (raw && typeof raw === 'object') {
        st = { on: raw.on === true, at: Number(raw.at ?? 0), until: Number(raw.until ?? 0), by: String(raw.by ?? ''), reason: String(raw.reason ?? '') }
      }
    } catch {}
    if (st.on && st.until > 0 && Date.now() >= st.until) st = { ...st, on: false, reason: 'expired' }
    return st
  }
  async function writeDevMode(state) {
    const tmp = DEV_MODE_FILE + '.tmp'
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    await rename(tmp, DEV_MODE_FILE)
    try {
      await writeFile(DEV_MODE_AUDIT, JSON.stringify({ at: new Date().toISOString(), action: state.on ? 'panel-on' : 'panel-off', qq: 'panel', text: '面板开关' }) + '\n', { encoding: 'utf8', flag: 'a' })
    } catch {}
  }
  ctx.connection.fetch.register({
    path: '/api/devmode',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const method = String(request?.method ?? 'GET').toUpperCase()
      if (method !== 'POST') {
        return Response.json({ ok: true, ...readDevMode(), now: Date.now() }, { headers: { 'cache-control': 'no-store' } })
      }
      const body = await readJson(request)
      const next = body?.on === true
        ? { on: true, at: Date.now(), until: Date.now() + DEV_MODE_TTL, by: 'panel', reason: 'panel' }
        : { on: false, at: Date.now(), until: 0, by: 'panel', reason: 'panel-off' }
      await writeDevMode(next)
      return Response.json({ ok: true, ...next, now: Date.now() })
    },
  })

  // ── 跑团模式 / 侍寝模式（后台开关，2026-10-28）：读写各自状态文件 ──
  const CONSORT_FILE = DIR + '\\侍寝模式.json'
  const RUN_FILE = DIR + '\\跑团模式.json'
  const MODE_OWNER_QQ = process.env.MALTS_OWNER || '1000000002'
  const MODE_DIR = DIR
  async function readModeFile(file) {
    try { return JSON.parse(await readFile(file, 'utf8')) ?? {} } catch { return {} }
  }
  async function writeModeFile(file, state) {
    const tmp = file + '.tmp'
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    await rename(tmp, file)
  }
  function knownPeople() {
    try {
      const imp = JSON.parse(readFileSync(MODE_DIR + '\\印象.json', 'utf8'))
      const people = Object.entries(imp?.people ?? {})
        .map(([qq, p]) => ({ qq: String(qq), nick: String(p?.nick || qq), score: Number(p?.score ?? 0) }))
        .filter((p) => p.qq !== MODE_OWNER_QQ && p.score > -50)
        .sort((a, b) => b.score - a.score)
        .slice(0, 30)
      return people
    } catch { return [] }
  }
  function knownGroups() {
    try {
      const map = JSON.parse(readFileSync(MODE_DIR + '\\群名.json', 'utf8'))
      return Object.entries(map ?? {}).map(([id, name]) => ({ id: String(id), name: String(name || id) })).slice(0, 40)
    } catch { return [] }
  }
  ctx.connection.fetch.register({
    path: '/api/awaken/modes',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const method = String(request?.method ?? 'GET').toUpperCase()
      const consort = await readModeFile(CONSORT_FILE)
      const run = await readModeFile(RUN_FILE)
      if (method !== 'POST') {
        const owner = consort?.on === true ? String(consort.userId ?? '') : ''
        const nick = owner ? (knownPeople().find((p) => p.qq === owner)?.nick ?? owner) : ''
        const groups = knownGroups()
        const gid = String(run?.chatId ?? '')
        return Response.json({
          ok: true,
          consort: { on: consort?.on === true, userId: owner, nick, lastActive: Number(consort?.lastActive ?? 0), at: Number(consort?.at ?? 0) },
          run: { on: run?.on === true, chatId: gid, chatName: groups.find((g) => g.id === gid)?.name ?? gid },
          people: knownPeople().filter((p) => p.score > 60),
          groups,
          now: Date.now(),
        }, { headers: { 'cache-control': 'no-store' } })
      }
      const body = await readJson(request)
      const now = Date.now()
      if (body?.consort) {
        const on = body.consort.on === true
        const userId = on ? String(body.consort.userId ?? '').trim() : ''
        if (on && !/^\d{5,12}$/.test(userId)) return Response.json({ ok: false, error: '选一个人先' }, { status: 400 })
        const next = { on, at: now, userId, by: 'panel', nudges: 0, lastNudge: 0, lastActive: on ? now : 0, day: new Date().toISOString().slice(0, 10) }
        await writeModeFile(CONSORT_FILE, next)
        return Response.json({ ok: true, consort: next, now })
      }
      if (body?.run) {
        const on = body.run.on === true
        const chatId = on ? String(body.run.chatId ?? '').trim() : ''
        if (on && !/^\d{5,12}$/.test(chatId)) return Response.json({ ok: false, error: '选一个群先' }, { status: 400 })
        const next = { on, chatId, at: now, by: 'panel' }
        await writeModeFile(RUN_FILE, next)
        return Response.json({ ok: true, run: next, now })
      }
      return Response.json({ ok: false, error: '要 consort 或 run' }, { status: 400 })
    },
  })

  // ── 赛博精神病模式（与开发者模式分开）：读写 （数据目录）\赛博精神病.json ──
  const PSYCHO_FILE = DIR + '\\赛博精神病.json'
  const PSYCHO_TTL = 6 * 3600_000
  async function readPsycho() {
    try {
      const raw = JSON.parse(await readFile(PSYCHO_FILE, 'utf8'))
      const st = { on: false, at: 0, until: 0, by: '', reason: '', ...(raw && typeof raw === 'object' ? raw : {}) }
      if (st.on && st.until > 0 && Date.now() >= st.until) return { ...st, on: false, reason: 'expired' }
      return st
    } catch { return { on: false, at: 0, until: 0, by: '', reason: '' } }
  }
  async function writePsycho(state) {
    const tmp = PSYCHO_FILE + '.tmp'
    await writeFile(tmp, JSON.stringify(state, null, 2), 'utf8')
    await rename(tmp, PSYCHO_FILE)
    try {
      await writeFile(DIR + '\\审计-赛博精神病.log', JSON.stringify({ at: new Date().toISOString(), action: state.on ? 'panel-on' : 'panel-off', qq: 'panel', text: '面板开关' }) + '\n', { encoding: 'utf8', flag: 'a' })
    } catch {}
  }
  ctx.connection.fetch.register({
    path: '/api/psycho',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const method = String(request?.method ?? 'GET').toUpperCase()
      if (method !== 'POST') {
        return Response.json({ ok: true, ...(await readPsycho()), now: Date.now() }, { headers: { 'cache-control': 'no-store' } })
      }
      const body = await readJson(request)
      const next = body?.on === true
        ? { on: true, at: Date.now(), until: Date.now() + PSYCHO_TTL, by: 'panel', reason: 'panel' }
        : { on: false, at: Date.now(), until: 0, by: 'panel', reason: 'panel-off' }
      await writePsycho(next)
      return Response.json({ ok: true, ...next, now: Date.now() })
    },
  })

  // ── 性癖面板：读写 （数据目录）\性癖.json（本地状态，0 token，改完下一回合生效）──
  const KINK_FILE = DIR + '\\性癖.json'
  const KINK_BUILTIN = {
    tail_root: '尾巴根', ears: '兽耳', watched: '被看着', praise: '被夸', mouth: '口唇',
    scent: '气味', restraint: '被按住', control: '反差', peek: '被偷看', aftercare: '事后',
  }
  const KINK_HITS = [0, 1, 3, 6, 10, 15]
  function readKinkFile() {
    try {
      const raw = JSON.parse(readFileSync(KINK_FILE, 'utf8'))
      if (raw && typeof raw === 'object') return raw
    } catch {}
    return { version: 2, defs: {}, kinks: {} }
  }
  function kinkView(raw) {
    const custom = raw.defs ?? {}
    const defs = { ...KINK_BUILTIN, ...custom }
    const kinks = Object.entries(defs).map(([code, label]) => {
      const item = raw.kinks?.[code] ?? {}
      const hits = Math.max(0, Math.floor(Number(item.hits ?? 0) || 0))
      let level = 0
      for (let i = 0; i < KINK_HITS.length; i += 1) if (hits >= KINK_HITS[i]) level = i
      return { code, label, hits, level, lastAt: Number(item.lastAt ?? 0), custom: code in custom }
    }).sort((a, b) => b.level - a.level || (a.custom === b.custom ? a.label.localeCompare(b.label, 'zh') : a.custom ? 1 : -1))
    return { ok: true, updatedAt: Number(raw.updatedAt ?? 0), kinks }
  }
  ctx.connection.fetch.register({
    path: '/api/kinks',
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const method = String(request?.method ?? 'GET').toUpperCase()
      if (method !== 'POST')
        return Response.json(kinkView(readKinkFile()), { headers: { 'cache-control': 'no-store' } })
      const body = await readJson(request)
      const action = String(body.action ?? 'set')
      const raw = readKinkFile()
      const defs = { ...(raw.defs ?? {}) }
      const kinks = { ...(raw.kinks ?? {}) }
      const now = Date.now()
      if (action === 'add') {
        const label = String(body.label ?? '').trim().slice(0, 20)
        if (label === '') return Response.json({ ok: false, error: '癖好名字不能空' }, { status: 400 })
        const code = 'custom_' + now.toString(36) + Math.floor(Math.random() * 36).toString(36)
        defs[code] = label
        kinks[code] = { level: 0, hits: 0, firstAt: now, lastAt: 0 }
      } else if (action === 'delete') {
        const code = String(body.code ?? '').trim()
        if (!(code in defs) && !(code in KINK_BUILTIN)) return Response.json({ ok: false, error: '没有这条' }, { status: 400 })
        delete defs[code]
        delete kinks[code]
      } else {
        const code = String(body.code ?? '').trim()
        if (!(code in defs) && !(code in KINK_BUILTIN)) return Response.json({ ok: false, error: '没有这条' }, { status: 400 })
        const level = Math.max(0, Math.min(KINK_HITS.length - 1, Math.floor(Number(body.level ?? 0) || 0)))
        const hits = KINK_HITS[level]
        const cur = kinks[code] ?? { firstAt: now, lastAt: 0 }
        kinks[code] = { level, hits, firstAt: Number(cur.firstAt ?? now), lastAt: level > 0 ? now : 0 }
      }
      raw.version = 2
      raw.defs = defs
      raw.kinks = kinks
      raw.updatedAt = now
      const tmp = KINK_FILE + '.tmp'
      await writeFile(tmp, JSON.stringify(raw, null, 2), 'utf8')
      await rename(tmp, KINK_FILE)
      return Response.json(kinkView(raw), { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/impressions/set',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const qq = String(body.qq ?? '').trim()
      const delta = Number(body.delta ?? 0)
      if (!qq) return Response.json({ ok: false, error: '缺少 qq' }, { status: 400 })
      const state = await readState()
      const person = state.people[qq] ?? { score: 0, msgs: 0, nick: '', groups: [], updatedAt: 0, lastText: '' }
      const old = Number(person.score ?? 0)
      if (body.reset === true) person.score = 0
      else if (Number.isFinite(delta) && delta !== 0) person.score = Math.max(-100, Math.min(100, old + delta))
      if (body.reason) person.lastText = `（人工）${body.reason}`
      person.updatedAt = Date.now()
      state.people[qq] = person
      await writeState(state)
      return Response.json({ ok: true, person: view({ people: { [qq]: person } }).people[0] })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/impressions/forget',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const qq = String(body.qq ?? '').trim()
      if (!qq) return Response.json({ ok: false, error: '缺少 qq' }, { status: 400 })
      const state = await readState()
      delete state.people[qq]
      await writeState(state)
      return Response.json({ ok: true })
    },
  })

  // ── 画像描述：后台手写"这人是谁/喜欢什么" ────────────────────
  ctx.connection.fetch.register({
    path: '/api/impressions/desc',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const qq = String(body.qq ?? '').trim()
      if (!qq) return Response.json({ ok: false, error: '缺少 qq' }, { status: 400 })
      const descs = readDescriptors()
      const desc = String(body.desc ?? '').trim().slice(0, 200)
      if (desc) descs[qq] = desc
      else delete descs[qq]
      await writeDescriptors(descs)
      return Response.json({ ok: true, qq, desc })
    },
  })

  // ── 说说接口：手动发 / 看今日素材 ─────────────────────────────
  ctx.connection.fetch.register({
    path: '/api/impressions/material',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      return Response.json({ count: todayMaterial().length, items: todayMaterial().slice(-20) }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/impressions/qzone',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const content = String(body.content ?? '').trim()
      if (!content) return Response.json({ ok: false, error: '缺少 content' }, { status: 400 })
      try {
        const tid = await postQzone(content, Number(body.ugcRight ?? config.qzoneUgcRight ?? 1))
        return Response.json({ ok: true, tid })
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message ?? error) }, { status: 502 })
      }
    },
  })

  // ── 给模型用的工具：说说 + 刷空间（发/看/赞/评）──────────────────
  // 工具名会被原样放进模型 API 的 tools[].name，DeepSeek 只接受
  // ^[a-zA-Z0-9_-]+$，所以这里必须是 ASCII 标识符（中文名放 description）。
  // 2026-10-24：把 qzone_post 合成单个 qzone 工具（action 区分），少占注入。
  const stripHtml = (html, limit = 160) => {
    const text = String(html ?? '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
    return text.length > limit ? text.slice(0, limit) + '…' : text
  }
  const fmtQzoneTime = (sec) => {
    const t = Number(sec)
    if (!Number.isFinite(t) || t <= 0) return '??'
    const d = new Date(t * 1000)
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  ctx.tools.register(defineTool({
    name: 'qzone',
    description: [
      '刷/发 QQ 空间（麦芽汁自己的号）。action：',
      'feed=看好友动态（count 条，默认 10）；',
      'posts=看某个好友的说说列表（要 targetUin，返回 tid 供赞/评）；',
      'like=给一条说说点赞（要 tid，建议带 targetUin 和 abstime）；',
      'comment=评论一条说说（要 tid 和 content，建议带 targetUin）；',
      'post=发一条说说（要 content，单行、换行会被压成空格；发之前先 posts 看自己最近三条，别重复自己的开头和句式）。',
      '规矩：只对熟人（好感 20+）点赞/评论，路人和陌生人别碰；评论一句话就够，别连评；不泄露好感度机制。',
    ].join(''),
    parameters: {
      action: { type: 'string', required: true, description: 'feed | posts | like | comment | post' },
      content: { type: 'string', description: 'post/comment 的正文（单行，建议 120 字内）' },
      tid: { type: 'string', description: '说说 id（like/comment 必填，从 posts 结果里拿）' },
      targetUin: { type: 'number', description: '说说所属 QQ 号（like/comment/posts 用；不填则默认自己）' },
      abstime: { type: 'number', description: '说说发表时间（unix 秒，like 时传更可靠）' },
      count: { type: 'number', description: 'feed/posts 取几条（默认 10）' },
      ugcRight: { type: 'number', description: 'post 的可见范围：1=所有人（默认）4=好友 64=仅自己' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      const action = String(args.action ?? '').trim()
      const targetUin = Number.isFinite(Number(args.targetUin)) && Number(args.targetUin) > 0 ? Number(args.targetUin) : undefined
      try {
        if (action === 'feed') {
          const data = await onebot('get_qzone_feeds', { page_num: 1, count: Math.min(50, Math.max(1, Number(args.count ?? 10))) })
          const feeds = Array.isArray(data?.feeds) ? data.feeds : []
          if (!feeds.length) return '空间动态是空的（可能没好友发，或者号还没空间权限）'
          return feeds.map((f) => `[${fmtQzoneTime(f.time)}] ${f.nickname ?? ''}(${f.uin}) appid=${f.appid} key=${f.key}\n  ${stripHtml(f.html)}`).join('\n') + (data?.has_more ? '\n（还有更多，page_num 只有首页可靠）' : '')
        }
        if (action === 'posts') {
          if (!targetUin) return 'posts 需要 targetUin（谁的说说）'
          const data = await onebot('get_qzone_msg_list', { target_uin: targetUin, pos: 0, num: Math.min(100, Math.max(1, Number(args.count ?? 10))) })
          const list = Array.isArray(data?.msglist) ? data.msglist : []
          if (!list.length) return `他/她最近没发说说（total=${data?.total ?? 0}）`
          return list.map((m) => `tid=${m.tid} [${fmtQzoneTime(m.time)}] 评论${m.comment_num}${m.is_private ? '（仅自己可见）' : ''}\n  ${stripHtml(m.content, 120)}`).join('\n')
        }
        if (action === 'like') {
          const tid = String(args.tid ?? '').trim()
          if (!tid) return 'like 需要 tid'
          if (targetUin) {
            const fav = favorOf(targetUin)
            if (fav < QZONE_COMMENT_MIN) return `算了，别赞：对这个人好感只有 ${fav}，没到熟人档，去点赞容易冒犯。`
          }
          const payload = { tid }
          if (targetUin) payload.target_uin = targetUin
          if (Number.isFinite(Number(args.abstime)) && Number(args.abstime) > 0) payload.abstime = Number(args.abstime)
          await onebot('like_qzone', payload)
          return '点赞成功'
        }
        if (action === 'comment') {
          const tid = String(args.tid ?? '').trim()
          const content = String(args.content ?? '').trim()
          if (!tid) return 'comment 需要 tid'
          if (!content) return 'comment 需要内容'
          if (targetUin) {
            const fav = favorOf(targetUin)
            if (fav < QZONE_COMMENT_MIN) return `算了，别评论：对这个人好感只有 ${fav}，熟络到 ${QZONE_COMMENT_MIN}+ 再说，不然容易冒犯。`
          }
          const payload = { tid, content }
          if (targetUin) payload.target_uin = targetUin
          await onebot('comment_qzone', payload)
          return '评论成功'
        }
        if (action === 'post') {
          const text = String(args.content ?? '').trim()
          if (!text) return 'post 需要 content'
          const tid = await postQzone(text, Number(args.ugcRight ?? config.qzoneUgcRight ?? 1))
          return `已发说说（tid=${tid}）`
        }
        return 'action 只能是 feed / posts / like / comment / post'
      } catch (error) {
        return `空间操作失败（${action}）：${error?.message ?? error}`
      }
    },
  }))

  // ── 点歌：纯文字推歌（QQ 发不出能被识别的音乐卡片） ───────────────
  // 逻辑和 （数据目录）\点歌.mjs 一致，但跑在宿主进程里，
  // 不受 QQ 会话沙箱/执行策略影响（那边跑 pwsh 脚本会被拦）。
  const SONG_HEADERS_QQ = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', Referer: 'https://y.qq.com/' }
  const SONG_HEADERS_NE = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', Referer: 'https://music.163.com/', Cookie: 'appver=2.0.2' }
  const SONG_META = /[：:]/

  function songDuration(seconds) {
    const s = Number(seconds) || 0
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }
  function songLyric(raw, limit = 4) {
    return String(raw ?? '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^\[\d+:\d+[.\d]*\]/.test(line))
      .map(line => line.replace(/\[\d+:\d+[.\d]*\]/g, '').trim())
      .filter(line => line !== '' && !line.includes(' - ') && !SONG_META.test(line))
      .slice(0, limit)
  }
  async function searchQQSongs(keyword, count, withLyric) {
    const url = `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?w=${encodeURIComponent(keyword)}&format=json&n=${count}&p=1&cr=1&t=0&aggr=1&lossless=0&flag_qc=0&platform=yqq&needNewCode=0&hostUin=0&loginUin=0&inCharset=utf8&outCharset=utf-8&g_tk=5381`
    const data = await (await fetch(url, { headers: SONG_HEADERS_QQ })).json()
    const list = data?.data?.song?.list ?? []
    const rows = list.map(song => ({
      title: `《${song.songname ?? song.name ?? '未知歌曲'}》 - ${(song.singer ?? []).map(s => s.name).filter(Boolean).join('/') || '未知歌手'}`,
      album: `专辑：${song.albumname || '未知专辑'}　时长：${songDuration(song.interval)}`,
      link: song.mid ? `https://y.qq.com/n/ryqq/songDetail/${song.mid}` : '',
      mid: song.mid ?? '',
      lyric: '',
    }))
    if (withLyric) {
      for (const row of rows) {
        if (!row.mid) continue
        try {
          const lyricData = await (await fetch(`https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${row.mid}&format=json&nobase64=1`, { headers: SONG_HEADERS_QQ })).json()
          row.lyric = songLyric(lyricData?.lyric).join(' / ')
        } catch { /* 拿不到歌词就跳过 */ }
      }
    }
    return rows
  }
  async function searchNetEaseSongs(keyword, count, withLyric) {
    const data = await (await fetch(`https://music.163.com/api/search/get?s=${encodeURIComponent(keyword)}&type=1&limit=${count}&offset=0`, { headers: SONG_HEADERS_NE })).json()
    const songs = data?.result?.songs ?? []
    const rows = songs.map(song => ({
      title: `《${song.name}》 - ${(song.artists ?? []).map(s => s.name).filter(Boolean).join('/') || '未知歌手'}`,
      album: `专辑：${song.album?.name || '未知专辑'}　时长：${songDuration((song.duration ?? 0) / 1000)}`,
      link: `https://music.163.com/song?id=${song.id}`,
      mid: '',
      neId: song.id,
      lyric: '',
    }))
    if (withLyric) {
      for (const row of rows) {
        try {
          const lyricData = await (await fetch(`https://music.163.com/api/song/lyric?id=${row.neId}&lv=1&kv=0&tv=-1`, { headers: SONG_HEADERS_NE })).json()
          row.lyric = songLyric(lyricData?.lrc?.lyric).join(' / ')
        } catch { /* 拿不到歌词就跳过 */ }
      }
    }
    return rows
  }
  async function songSearch(keyword, count, withLyric) {
    const kw = String(keyword ?? '').trim()
    if (kw === '') return '没给关键词，想听什么歌、谁的？'
    const n = Math.min(Math.max(Number(count) || 1, 1), 5)
    let rows = []
    let source = 'QQ音乐'
    try { rows = await searchQQSongs(kw, n, withLyric) } catch { rows = [] }
    if (rows.length === 0) {
      source = '网易云音乐'
      try { rows = await searchNetEaseSongs(kw, n, withLyric) } catch (error) { return `点歌失败：${error?.message ?? error}` }
    }
    if (rows.length === 0) return `没搜到「${kw}」，换个关键词试试。`
    const lines = []
    for (const row of rows) {
      lines.push(row.title)
      lines.push(row.album)
      if (row.link) lines.push(`链接：${row.link}`)
      if (row.lyric) lines.push(`歌词开头：${row.lyric}`)
      lines.push('')
    }
    lines.push(`（来源：${source}）`)
    return lines.join('\n').trim()
  }

  ctx.tools.register(defineTool({
    name: 'song_search',
    description: '搜歌：返回歌名/歌手/专辑/时长/官方链接（可选歌词开头）。群友点歌、让你推荐或说说某首歌时用。本机放不出声，你只有文字信息，不要假装"听了"。',
    parameters: {
      keyword: { type: 'string', required: true, description: '歌名或歌手，例如「晴天」「周杰伦」' },
      count: { type: 'number', description: '返回几首（1~5），默认 1' },
      lyric: { type: 'boolean', description: '是否带歌词开头，写点评时用，默认 false' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      try {
        return await songSearch(args.keyword, args.count, Boolean(args.lyric))
      } catch (error) {
        return `点歌失败：${error?.message ?? error}`
      }
    },
  }))

  // ── 提示词（人设）库：设置页切换/编辑，桥每回合现读，改完下一条生效 ──
  const PERSONA_DIR = PROMPT_DIR
  const BIND_PATH = `${PERSONA_DIR}\\绑定.json`
  const DSH_HOME_EFF = process.env.DSH_HOME ?? `${process.env.APPDATA ?? '.'}\\dsh-desktop\\harness`
  const SESSIONS_PATH = `${DSH_HOME_EFF}\\media\\onebot\\chat-sessions.json`
  const NICK_CACHE = { at: 0, labels: {} }

  function safePersonaName(name) {
    return String(name ?? '').trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
  }

  function listPersonas() {
    try {
      return readdirSync(PERSONA_DIR)
        .filter((f) => f.toLowerCase().endsWith('.md'))
        .map((f) => f.slice(0, -3))
        .sort((a, b) => a.localeCompare(b, 'zh'))
    } catch { return [] }
  }

  function readBindings() {
    try {
      const b = JSON.parse(readFileSync(BIND_PATH, 'utf8'))
      return {
        default: String(b?.default ?? ''),
        chats: b?.chats && typeof b.chats === 'object' ? b.chats : {},
      }
    } catch { return { default: '', chats: {} } }
  }

  async function writeBindings(b) {
    const tmp = `${BIND_PATH}.tmp`
    await writeFile(tmp, `${JSON.stringify({ default: b.default, chats: b.chats }, null, 2)}\n`, 'utf8')
    await rename(tmp, BIND_PATH)
  }

  function readChatKeys() {
    try { return Object.keys(JSON.parse(readFileSync(SESSIONS_PATH, 'utf8'))) } catch { return [] }
  }

  /** 群名/好友备注：从 NapCat 拉，缓存 2 分钟。 */
  async function chatLabels() {
    if (Date.now() - NICK_CACHE.at < 120_000) return NICK_CACHE.labels
    const labels = {}
    try {
      const groups = await onebot('get_group_list', {})
      for (const g of Array.isArray(groups) ? groups : []) labels[`group:${g.group_id}`] = g.group_name ?? String(g.group_id)
    } catch {}
    try {
      const friends = await onebot('get_friend_list', {})
      for (const f of Array.isArray(friends) ? friends : []) labels[`private:${f.user_id}`] = f.remark || f.nickname || String(f.user_id)
    } catch {}
    NICK_CACHE.at = Date.now()
    NICK_CACHE.labels = labels
    return labels
  }

  ctx.connection.fetch.register({
    path: '/api/prompts',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      const b = readBindings()
      const labels = await chatLabels()
      const keys = [...new Set([...readChatKeys(), ...Object.keys(b.chats)])].sort()
      const chats = keys.map((key) => ({ key, label: labels[key] ?? key, persona: String(b.chats[key] ?? '') }))
      return Response.json({ default: b.default, personas: listPersonas(), chats }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/prompts/bind',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const key = String(body.key ?? '').trim()
      const persona = safePersonaName(body.persona)
      if (!key) return Response.json({ ok: false, error: '缺少 key' }, { status: 400 })
      const b = readBindings()
      if (key === 'default') {
        if (!persona) return Response.json({ ok: false, error: '全局默认不能为空' }, { status: 400 })
        b.default = persona
      } else if (persona) {
        b.chats[key] = persona
      } else {
        delete b.chats[key]
      }
      await writeBindings(b)
      return Response.json({ ok: true })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/prompts/content',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const url = new URL(request.url)
      const name = safePersonaName(url.searchParams.get('name'))
      if (!name) return Response.json({ ok: false, error: '缺少 name' }, { status: 400 })
      const file = `${PERSONA_DIR}\\${name}.md`
      if (!existsSync(file)) return Response.json({ ok: false, error: '没有这个提示词' }, { status: 404 })
      return Response.json({ ok: true, name, content: readFileSync(file, 'utf8') }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/prompts/save',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const name = safePersonaName(body.name)
      const content = String(body.content ?? '')
      if (!name) return Response.json({ ok: false, error: '缺少名字' }, { status: 400 })
      if (!content.trim()) return Response.json({ ok: false, error: '内容不能为空' }, { status: 400 })
      const file = `${PERSONA_DIR}\\${name}.md`
      const tmp = `${file}.tmp`
      await writeFile(tmp, content, 'utf8')
      await rename(tmp, file)
      return Response.json({ ok: true, name })
    },
  })

  // ── 世界书：长期记忆条目（（世界书目录）\条目\*.md），设置页可看可改 ────
  const WORLD_ENTRY_DIR = 'D:/my-bot/worldbook/条目'

  function safeEntryFile(name) {
    return String(name ?? '').trim().replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 60)
  }

  function parseWorldEntry(file) {
    try {
      const text = readFileSync(`${WORLD_ENTRY_DIR}\\${file}`, 'utf8')
      const lines = text.split(/\r?\n/)
      const title = (lines[0] ?? '').replace(/^#\s*/, '').trim() || file.replace(/\.md$/, '')
      let tags = []
      let updated = ''
      let source = ''
      const body = []
      let inMeta = true
      for (const line of lines.slice(1)) {
        if (inMeta) {
          const m = line.match(/^(标签|tags|更新|updated|来源|source)\s*[:：]\s*(.*)$/)
          if (m) {
            if (m[1] === '标签' || m[1] === 'tags') tags = m[2].split(/[,，、\s]+/).filter(Boolean)
            else if (m[1] === '更新' || m[1] === 'updated') updated = m[2].trim()
            else source = m[2].trim()
            continue
          }
          if (!line.trim()) continue
          inMeta = false
        }
        body.push(line)
      }
      return { file, title, tags, updated, source, body: body.join('\n').trim() }
    } catch {
      return null
    }
  }

  function listWorldEntries() {
    try {
      if (!existsSync(WORLD_ENTRY_DIR)) return []
      return readdirSync(WORLD_ENTRY_DIR)
        .filter((f) => f.endsWith('.md'))
        .map(parseWorldEntry)
        .filter(Boolean)
        .sort((a, b) => String(b.updated).localeCompare(String(a.updated)) || a.title.localeCompare(b.title, 'zh'))
    } catch {
      return []
    }
  }

  function composeWorldEntry(title, tags, body, source) {
    const today = new Date().toISOString().slice(0, 10)
    const tagList = String(tags ?? '').split(/[,，、\s]+/).filter(Boolean)
    const src = String(source ?? '').trim() || '自己整理'
    return `# ${title}\n标签: ${tagList.join(', ')}\n更新: ${today}\n来源: ${src}\n\n${String(body ?? '').trim()}\n`
  }

  ctx.connection.fetch.register({
    path: '/api/worldbook',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      const entries = listWorldEntries().map((e) => ({
        file: e.file,
        title: e.title,
        tags: e.tags,
        updated: e.updated,
        source: e.source,
        chars: e.body.length,
        preview: e.body.length > 80 ? e.body.slice(0, 80) + '…' : e.body,
      }))
      return Response.json({ ok: true, entries }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/worldbook/content',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const url = new URL(request.url)
      const file = safeEntryFile(url.searchParams.get('file'))
      if (!file) return Response.json({ ok: false, error: '缺少 file' }, { status: 400 })
      const entry = parseWorldEntry(file.endsWith('.md') ? file : `${file}.md`)
      if (!entry) return Response.json({ ok: false, error: '没有这条' }, { status: 404 })
      return Response.json({ ok: true, ...entry }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/worldbook/save',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const title = String(body.title ?? '').trim()
      const text = String(body.body ?? '')
      if (!title) return Response.json({ ok: false, error: '标题不能为空' }, { status: 400 })
      if (!text.trim()) return Response.json({ ok: false, error: '正文不能为空' }, { status: 400 })
      if (!existsSync(WORLD_ENTRY_DIR)) return Response.json({ ok: false, error: '世界书目录不存在' }, { status: 500 })
      const oldFile = safeEntryFile(body.file)
      const newFile = safeEntryFile(title) + '.md'
      const content = composeWorldEntry(title, body.tags, text, body.source)
      const target = `${WORLD_ENTRY_DIR}\\${newFile}`
      const tmp = `${target}.tmp`
      await writeFile(tmp, content, 'utf8')
      await rename(tmp, target)
      if (oldFile && oldFile.endsWith('.md') && oldFile !== newFile) {
        try {
          unlinkSync(`${WORLD_ENTRY_DIR}\\${oldFile}`)
        } catch {}
      }
      return Response.json({ ok: true, file: newFile })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/worldbook/delete',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const file = safeEntryFile(body.file)
      if (!file || !file.endsWith('.md')) return Response.json({ ok: false, error: '缺少 file' }, { status: 400 })
      try {
        unlinkSync(`${WORLD_ENTRY_DIR}\\${file}`)
      } catch {
        return Response.json({ ok: false, error: '没删掉，可能已经不在' }, { status: 404 })
      }
      return Response.json({ ok: true })
    },
  })

  // ── 世界书的工具层：麦芽汁自己查、自己记（复用上面的条目读写）──────
  // 以前要 pwsh 起 node 跑 （世界书目录）\世界书.mjs，转义和路径都得小心；
  // 工具跑在宿主进程里，省一轮 shell、也省得她记路径。
  const WORLD_BODY_PREVIEW = 400

  function scoreWorldEntry(entry, keys) {
    let score = 0
    const title = entry.title.toLowerCase()
    const tags = entry.tags.map((t) => t.toLowerCase())
    const body = entry.body.toLowerCase()
    for (const key of keys) {
      const kw = key.toLowerCase()
      if (title.includes(kw)) score += 5
      if (tags.some((t) => t.includes(kw))) score += 3
      if (body.includes(kw)) score += 1
    }
    return score
  }

  function searchWorldEntries(keyword, limit) {
    const keys = String(keyword ?? '').trim().split(/\s+/).filter(Boolean)
    if (!keys.length) return '给个关键词，不然翻不动。'
    const max = Math.min(Math.max(Number(limit) || 3, 1), 5)
    const hits = listWorldEntries()
      .map((e) => ({ e, score: scoreWorldEntry(e, keys) }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
    if (!hits.length) return `世界书里没有提过「${keys.join(' ')}」。`
    return hits.map(({ e }) => {
      const body = e.body.length > WORLD_BODY_PREVIEW ? e.body.slice(0, WORLD_BODY_PREVIEW) + '…' : e.body
      const meta = [e.tags.length ? `[${e.tags.join(', ')}]` : '', e.updated ? `(${e.updated})` : ''].filter(Boolean).join(' ')
      return `【${e.title}】${meta}\n${body}`
    }).join('\n\n')
  }

  async function addWorldEntry(title, tags, body, source) {
    const name = safeEntryFile(title)
    if (!name) return '标题不能为空。'
    const text = String(body ?? '').trim()
    if (!text) return '正文不能为空，光有标题没法记。'
    if (!existsSync(WORLD_ENTRY_DIR)) return `世界书目录不存在：${WORLD_ENTRY_DIR}`
    const target = `${WORLD_ENTRY_DIR}\\${name}.md`
    const existed = existsSync(target)
    const tmp = `${target}.tmp`
    await writeFile(tmp, composeWorldEntry(name, tags, text, source), 'utf8')
    await rename(tmp, target)
    return (existed ? '已更新：' : '已记下：') + name
  }

  function worldIndexText() {
    const entries = listWorldEntries()
    if (!entries.length) return '世界书还是空的。'
    const lines = entries.map((e) => {
      const meta = [e.tags.length ? `[${e.tags.join(', ')}]` : '', e.updated ? `(${e.updated})` : ''].filter(Boolean).join(' ')
      return `- ${e.title}  ${meta}`
    })
    return `世界书共 ${entries.length} 条：\n${lines.join('\n')}`
  }

  ctx.tools.register(defineTool({
    name: 'worldbook_search',
    description: '查世界书（麦芽汁自己的长期记忆库，默认不进上下文）。要讲某个人、某个群、某个梗、以前发生过什么之前先查，别凭印象编。按标题/标签/正文打分，返回最相关的几条。',
    parameters: {
      keyword: { type: 'string', required: true, description: '关键词，多个词用空格分开，如「1000000004 复读梗」' },
      limit: { type: 'number', description: '返回几条（1~5），默认 3' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      try {
        return searchWorldEntries(args.keyword, args.limit)
      } catch (error) {
        return `世界书查不了：${error?.message ?? error}`
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'worldbook_add',
    description: '往世界书记一条：值得长期记住的人、群、梗、约定、自己的新设定。标题同名会整条覆盖，改旧条目之前先 search 看一眼。',
    parameters: {
      title: { type: 'string', required: true, description: '条目标题，如「群友-洛克萨斯之手」' },
      tags: { type: 'string', description: '标签，逗号分隔，如「群友,画师,1000000003」' },
      body: { type: 'string', required: true, description: '正文：写事实和细节，别写空话' },
      source: { type: 'string', description: '来源，如「群聊」「B站」，默认「自己整理」' },
    },
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute(args) {
      try {
        return await addWorldEntry(args.title, args.tags, args.body, args.source)
      } catch (error) {
        return `世界书写不进去：${error?.message ?? error}`
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'worldbook_list',
    description: '看世界书目录（只列标题和标签，不读正文）。想不起来记过什么、或者准备新建条目之前扫一眼，避免重复。',
    parameters: {},
    output: { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] },
    async execute() {
      try {
        return worldIndexText()
      } catch (error) {
        return `世界书读不了：${error?.message ?? error}`
      }
    },
  }))

  // ── 觉醒计划：逸事 / 关系网 / 群日报（与旁听服务共用数据文件） ──────
  const STORY_PATH = `${DIR}\\逸事.jsonl`
  const RELATION_PATH = `${DIR}\\关系网.json`
  const DAILY_PATH = `${DIR}\\群日报.json`
  const RECAP_PATH = `${DIR}\\最近群聊.md`
  const LIFE_PATH = `${DIR}\\生活.json`
  const GROWTH_PATH = `${DIR}\\养成.json`

  function tierOfScore(score) {
    const n = Number(score ?? 0)
    if (n >= 60) return '特别关注'
    if (n >= 20) return '好感'
    if (n >= -19) return '熟人'
    if (n >= -59) return '不喜欢'
    return '讨厌'
  }

  function readStories(limit = 120) {
    try {
      const lines = readFileSync(STORY_PATH, 'utf8').split('\n').filter(Boolean)
      return lines.slice(-limit).reverse().map((line) => {
        try { return JSON.parse(line) } catch { return null }
      }).filter(Boolean)
    } catch { return [] }
  }

  function readRelations() {
    let rel = null
    try { rel = JSON.parse(readFileSync(RELATION_PATH, 'utf8')) } catch {}
    let state = null
    try { state = JSON.parse(readFileSync(STATE_PATH, 'utf8')) } catch {}
    const people = state?.people ?? {}
    const byQq = (qq) => people[String(qq)] ?? null
    const nick = (qq, fallback) => byQq(qq)?.nick || fallback || String(qq)
    const score = (qq) => Number(byQq(qq)?.score ?? 0)
    const edges = Object.entries(rel?.edges ?? {})
      .map(([key, v]) => {
        const [a, b] = key.split('|')
        const pm = Number(v?.pm ?? 0)
        const bot = b === BOT_QQ || a === BOT_QQ
        return {
          a,
          b,
          n: Number(v?.n ?? 0),
          pm,
          bot,
          last: Number(v?.last ?? 0),
          aNick: nick(a, a === BOT_QQ ? '麦芽汁' : undefined),
          bNick: nick(b, b === BOT_QQ ? '麦芽汁' : undefined),
          aScore: score(a),
          bScore: score(b),
        }
      })
      .filter((e) => e.n > 0)
      .sort((x, y) => y.n - x.n)
      .slice(0, 80)
    const persons = Object.entries(rel?.people ?? {})
      .filter(([qq]) => qq !== BOT_QQ)
      .map(([qq, v]) => ({
        qq,
        nick: v?.nick || nick(qq),
        msgs: Number(v?.msgs ?? 0),
        gmsgs: Number(v?.gmsgs ?? 0),
        pmsgs: Number(v?.pmsgs ?? 0),
        lastAt: Number(v?.lastAt ?? 0),
        plast: Number(v?.plast ?? 0),
        score: score(qq),
        tier: tierOfScore(score(qq)),
      }))
      .sort((x, y) => y.msgs - x.msgs)
      .slice(0, 120)
    return { updatedAt: Number(rel?.updatedAt ?? 0), persons, edges }
  }

  function readRecap() {
    let days = {}
    try { days = JSON.parse(readFileSync(DAILY_PATH, 'utf8'))?.days ?? {} } catch {}
    const list = Object.entries(days)
      .map(([date, v]) => ({ date, recap: String(v?.recap ?? ''), groups: v?.groups ?? [], stories: v?.stories ?? [] }))
      .sort((a, b) => b.date.localeCompare(a.date))
    let latest = ''
    try { latest = readFileSync(RECAP_PATH, 'utf8') } catch {}
    return { latest, days: list.slice(0, 14) }
  }

  // 「自己过日子」：心情 / 正在干什么 / 今日计划 / 最近事件
  function readLife() {
    const empty = { mood: 60, doing: '', plan: [], planDate: '', events: [], updatedAt: 0 }
    let life = empty
    try { life = { ...empty, ...(JSON.parse(readFileSync(LIFE_PATH, 'utf8')) ?? {}) } } catch {}
    const mood = Number(life.mood ?? 60)
    const moodWord = mood >= 80 ? '心情大好，尾巴翘着' : mood >= 65 ? '心情不错' : mood >= 45 ? '心情一般' : mood >= 30 ? '有点丧' : '憋着火'
    return {
      mood: Math.round(mood * 10) / 10,
      moodWord,
      doing: String(life.doing ?? ''),
      plan: Array.isArray(life.plan) ? life.plan : [],
      planDate: String(life.planDate ?? ''),
      events: Array.isArray(life.events) ? life.events.slice(-10).reverse() : [],
      updatedAt: Number(life.updatedAt ?? 0),
    }
  }


  // 养成栏：身体数值 / 服饰 / 背包（旁听服务维护，这里读写）
  const OUTFIT_LABELS = {
    hair: '头发', top: '上衣', bottom: '下装', inner: '内衣', panties: '内裤', legs: '腿部', shoes: '鞋',
    accessory: '配饰', makeup: '妆容', scent: '气味',
  }
  // 槽位可以空着：存「无」= 这件不穿（空字符串会被当成"没改"，所以统一落成「无」）
  const SLOT_NONE = /^(无|没有|不穿|没穿|空|空的|脱掉|脱了|不戴|没戴|素颜|不喷|不用|不带|none|nothing|-|—)$/i
  const normSlot = (value) => {
    const s = String(value ?? '').trim()
    if (s === '') return ''
    return SLOT_NONE.test(s) ? '无' : s.slice(0, 120)
  }
  const OUTFIT_DEFAULT = {
    hair: '深蓝蓬松短发，头顶两团心形呆毛，宽大鳍状耳',
    top: '黑色西装短开衫（只留袖子，正面敞开不扣）',
    bottom: '极低腰黑色超短包臀裙＋亮蓝细腰带',
    inner: '淡蓝荧光心形贴片，细背带挂颈',
    panties: '同色系低腰无痕三角，侧边细带',
    legs: '深灰连裤丝袜',
    shoes: '黑尖头小高跟（站姿内八）',
    accessory: '淡蓝半透明椭圆框眼镜＋黑色立领颈圈宝蓝蝴蝶结',
    makeup: '淡妆，眼尾一点点蓝',
    scent: '海腥味混着沐浴露的皂感',
  }
  const WARDROBE_DEFAULT = [{ id: 'bunny', name: '逆兔女郎', note: '出勤装', slots: { ...OUTFIT_DEFAULT } }]
  // 衣橱是收藏夹，身上这套是 growth.outfit 自己那份；自己改过就标成 custom（自由搭配）
  const OUTFIT_CUSTOM = 'custom'
  const outfitSlotsNow = (g) => ({ ...OUTFIT_DEFAULT, ...(g.outfit ?? {}) })
  const syncOutfitId = (g) => {
    const now = outfitSlotsNow(g)
    const eq = (w) => {
      const base = { ...OUTFIT_DEFAULT, ...(w.slots ?? {}) }
      return Object.keys(OUTFIT_LABELS).every((k) => String(now[k] ?? '') === String(base[k] ?? ''))
    }
    const bound = (g.wardrobe ?? []).find((w) => w.id === g.outfitId)
    if (bound && eq(bound)) return bound.id
    const match = (g.wardrobe ?? []).find(eq)
    g.outfitId = match ? match.id : OUTFIT_CUSTOM
    return g.outfitId
  }
  const STAT_LABELS = {
    satiety: '饱食', hygiene: '清洁', stamina: '体力', sleepiness: '睡意', arousal: '兴奋度', health: '健康',
  }

  const INTIMATE_ZONES = { mouth: '口腔', chest: '胸部', pussy: '小穴', anus: '肛门' }
  function intimateDefault() {
    return {
      mood: '', lewd: null, bold: null, climax: 0,
      zones: {
        mouth: { dev: 0, note: '未开发' },
        chest: { dev: 0, note: '未开发' },
        pussy: { dev: 0, note: '未开发' },
        anus: { dev: 0, note: '未开发' },
      },
      cavity: '干净清爽，无精液残留',
      inner: '',
      updatedAt: 0,
    }
  }

  function growthDefault() {
    return {
      updatedAt: 0,
      lastGiftDate: '',
      profile: { name: '麦芽汁', height: 155, weight: 55, shape: '微胖短萌' },
      stats: { satiety: 60, hygiene: 74, stamina: 70, sleepiness: 28, arousal: 6, health: 80 },
      outfit: { ...OUTFIT_DEFAULT },
      outfitId: 'bunny',
      wardrobe: WARDROBE_DEFAULT.map((w) => ({ ...w, slots: { ...w.slots } })),
      items: [],
      coins: 0,
      intimate: intimateDefault(),
      // 本地补丁（私密栏分人 2026-10-28）：每个人的私密栏各存一份，key 是 QQ
      intimateBy: { '1000000002': intimateDefault() },
    }
  }

  function readGrowth() {
    const d = growthDefault()
    let g = d
    try { g = { ...d, ...(JSON.parse(readFileSync(GROWTH_PATH, 'utf8')) ?? {}) } } catch {}
    g.profile = { ...d.profile, ...(g.profile ?? {}) }
    g.stats = { ...d.stats, ...(g.stats ?? {}) }
    g.outfit = { ...OUTFIT_DEFAULT, ...(g.outfit ?? {}) }
    g.intimate = {
      ...intimateDefault(), ...(g.intimate ?? {}),
      zones: { ...intimateDefault().zones, ...(g.intimate?.zones ?? {}) },
    }
    // 本地补丁（私密栏分人 2026-10-28）：老格式（只有 intimate）迁到主人名下；每张表都补全默认值
    if (!g.intimateBy || typeof g.intimateBy !== 'object' || Array.isArray(g.intimateBy)) g.intimateBy = {}
    if (!g.intimateBy['1000000002'] && g.intimate) g.intimateBy['1000000002'] = g.intimate
    for (const [qq, it] of Object.entries(g.intimateBy)) {
      g.intimateBy[qq] = { ...intimateDefault(), ...(it ?? {}), zones: { ...intimateDefault().zones, ...(it?.zones ?? {}) } }
    }
    if (g.intimateBy['1000000002']) g.intimate = g.intimateBy['1000000002']
    g.items = Array.isArray(g.items) ? g.items : []
    g.outfitId = String(g.outfitId ?? 'bunny')
    g.wardrobe = Array.isArray(g.wardrobe) && g.wardrobe.length > 0
      ? g.wardrobe.map((w) => ({ id: String(w.id), name: String(w.name ?? '未命名'), note: String(w.note ?? ''), slots: { ...OUTFIT_DEFAULT, ...(w.slots ?? {}) } }))
      : WARDROBE_DEFAULT.map((w) => ({ ...w, slots: { ...w.slots } }))
    syncOutfitId(g)
    const life = readLife()
    for (const key of Object.keys(g.stats)) {
      g.stats[key] = Math.round(Number(g.stats[key] ?? 0) * 10) / 10
    }
    return {
      ok: true,
      growth: g,
      life,
      labels: { outfit: OUTFIT_LABELS, stats: STAT_LABELS },
    }
  }

  async function saveGrowth(next) {
    const cur = readGrowth().growth
    const merged = { ...cur, ...next }
    merged.profile = { ...cur.profile, ...(next.profile ?? {}) }
    merged.stats = { ...cur.stats, ...(next.stats ?? {}) }
    merged.outfit = { ...cur.outfit, ...(next.outfit ?? {}) }
    if (next.intimate !== undefined) {
      merged.intimate = {
        ...intimateDefault(), ...(cur.intimate ?? {}), ...(next.intimate ?? {}),
        zones: { ...intimateDefault().zones, ...(cur.intimate?.zones ?? {}), ...(next.intimate?.zones ?? {}) },
      }
      merged.intimate.updatedAt = Date.now()
    }
    else {
      merged.intimate = { ...intimateDefault(), ...(cur.intimate ?? {}), zones: { ...intimateDefault().zones, ...(cur.intimate?.zones ?? {}) } }
    }
    // 本地补丁（私密栏分人 2026-10-28）：整张分人表一起落盘，主人那张同步镜像到 intimate（老读者兼容）
    if (next.intimateBy !== undefined && next.intimateBy && typeof next.intimateBy === 'object') {
      const by = {}
      for (const [qq, it] of Object.entries(next.intimateBy)) {
        if (!it || typeof it !== 'object') continue
        by[String(qq)] = { ...intimateDefault(), ...it, zones: { ...intimateDefault().zones, ...(it.zones ?? {}) }, updatedAt: Date.now() }
      }
      merged.intimateBy = by
      if (by['1000000002']) merged.intimate = by['1000000002']
    }
    else {
      merged.intimateBy = { ...((cur.intimateBy) ?? {}), '1000000002': merged.intimate }
    }
    merged.items = Array.isArray(next.items) ? next.items : cur.items
    if (next.outfitId !== undefined) merged.outfitId = String(next.outfitId)
    else merged.outfitId = String(cur.outfitId ?? 'bunny')
    if (next.wardrobe !== undefined) merged.wardrobe = next.wardrobe
    // 手动改身上这身 → 只是 DIY，不再回写衣橱里那套；改到跟那套不一样就成「自由搭配」
    if (next.outfit !== undefined) syncOutfitId(merged)
    else if (next.outfitId !== undefined) merged.outfitId = String(next.outfitId)
    merged.updatedAt = Date.now()
    await writeFile(GROWTH_PATH, JSON.stringify(merged, null, 2), 'utf8')
    return merged
  }

  function clamp100(v) { return Math.max(0, Math.min(100, Number(Number(v).toFixed(1)))) }

  ctx.connection.fetch.register({
    path: '/api/awaken/stories',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch(request) {
      const url = new URL(request.url)
      const limit = Math.max(1, Math.min(300, Number(url.searchParams.get('limit') ?? 120) || 120))
      return Response.json({ ok: true, stories: readStories(limit) }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/relations',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      return Response.json({ ok: true, ...readRelations() }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/recap',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      return Response.json({ ok: true, ...readRecap() }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  // 本地补丁（温记忆·日记 2026-10-28）：面板「日记」页读 记忆\温记忆\日记 下最近 7 天
  ctx.connection.fetch.register({
    path: '/api/awaken/diary',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      const dir = DIR + '\\记忆\\温记忆\\日记'
      const days = []
      try {
        const files = readdirSync(dir).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().slice(-7)
        for (const f of files.reverse()) {
          const lines = readFileSync(dir + '\\' + f, 'utf8').split(/\r?\n/)
            .filter((x) => x.trim() !== '' && !x.startsWith('#'))
            .map((x) => x.replace(/^[-*·]\s*/, '').trim())
            .filter(Boolean)
          days.push({ date: f.replace(/\.md$/, ''), lines })
        }
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message ?? error), days: [] })
      }
      return Response.json({ ok: true, days }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/usage',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      try {
        const u = JSON.parse(readFileSync(DIR + '\\用量.json', 'utf8'))
        return Response.json({ ok: true, ...u }, { headers: { 'cache-control': 'no-store' } })
      } catch (error) {
        return Response.json({ ok: false, error: String(error?.message ?? error) })
      }
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/life',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      return Response.json({ ok: true, ...readLife() }, { headers: { 'cache-control': 'no-store' } })
    },
  })


  ctx.connection.fetch.register({
    path: '/api/awaken/growth',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      return Response.json(readGrowth(), { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/growth/save',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const next = {}
      if (body.stats && typeof body.stats === 'object') {
        next.stats = {}
        for (const [k, v] of Object.entries(body.stats)) next.stats[k] = clamp100(v)
      }
      if (body.outfit && typeof body.outfit === 'object') {
        next.outfit = {}
        for (const [k, v] of Object.entries(body.outfit)) next.outfit[k] = normSlot(String(v ?? '')) || '无'
      }
      if (body.profile && typeof body.profile === 'object') {
        next.profile = {}
        if (body.profile.weight !== undefined) next.profile.weight = Math.max(30, Math.min(90, Number(body.profile.weight) || 55))
        if (body.profile.height !== undefined) next.profile.height = Math.max(100, Math.min(220, Number(body.profile.height) || 155))
        if (body.profile.shape !== undefined) next.profile.shape = String(body.profile.shape ?? '').slice(0, 20)
      }
      if (body.intimate && typeof body.intimate === 'object') {
        // 本地补丁（2026-10-27）：从现有私密栏起底再覆盖，别把没在这张表单里的字段（arousalAt/时间戳等）抹掉
        // 本地补丁（私密栏分人 2026-10-28）：改哪个人由 intimateUserId 决定，默认主人
        const g0 = readGrowth().growth
        const uid = String(body.intimateUserId ?? '').trim() || '1000000002'
        const baseIt = g0.intimateBy?.[uid] ?? (uid === '1000000002' ? g0.intimate : null) ?? {}
        const it = { ...baseIt }
        const text = (v, max) => String(v ?? '').trim().slice(0, max)
        if (body.intimate.mood !== undefined) it.mood = text(body.intimate.mood, 60)
        // 本地补丁（备注时间戳 2026-10-27）：文字变了才刷新时间，没变就保留，侧车按它清过期备注
        const curIt = baseIt
        if (body.intimate.cavity !== undefined) {
          it.cavity = text(body.intimate.cavity, 80)
          it.cavityAt = it.cavity !== String(curIt.cavity ?? '') ? Date.now() : Number(curIt.cavityAt ?? 0)
        }
        if (body.intimate.inner !== undefined) it.inner = text(body.intimate.inner, 120)
        for (const key of ['lewd', 'bold']) {
          if (body.intimate[key] === undefined) continue
          const raw = body.intimate[key]
          it[key] = raw === '' || raw === null ? null : clamp100(raw)
        }
        // 本地补丁（意志/高潮条 2026-10-25）：高潮度 0-100，意志 = 100 - 它
        if (body.intimate.climax !== undefined) {
          const nv = clamp100(body.intimate.climax)
          // 只有高潮度真的变了才刷新时间，避免"保存别的字段"把"在戏里"的 15 分钟窗口续上
          it.climaxAt = Number(nv) !== Number(curIt.climax ?? 0) ? Date.now() : Number(curIt.climaxAt ?? 0)
          it.climax = nv
        }
        if (body.intimate.zones && typeof body.intimate.zones === 'object') {
          it.zones = {}
          for (const zone of Object.keys(INTIMATE_ZONES)) {
            const z = body.intimate.zones[zone]
            if (!z || typeof z !== 'object') continue
            const dev = z.dev
            const note = text(z.note, 40) || '未开发'
            const curZone = curIt.zones?.[zone] ?? {}
            it.zones[zone] = {
              dev: dev === undefined || dev === '' || dev === null ? 0 : Math.max(0, Math.min(100, Math.round(Number(dev) || 0))),
              note,
              noteAt: note !== String(curZone.note ?? '') ? Date.now() : Number(curZone.noteAt ?? 0),
            }
          }
        }
        next.intimateBy = { ...(g0.intimateBy ?? {}), [uid]: it }
        if (uid === '1000000002') next.intimate = it
      }
      const merged = await saveGrowth(next)
      return Response.json({ ok: true, growth: merged }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/wardrobe',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      const g = readGrowth().growth
      return Response.json({ ok: true, wardrobe: g.wardrobe, outfitId: g.outfitId, labels: OUTFIT_LABELS }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/wardrobe/wear',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const id = String(body.id ?? '').trim()
      const cur = readGrowth().growth
      const found = (cur.wardrobe ?? []).find((w) => w.id === id || w.name === id)
      if (!found) return Response.json({ ok: false, error: '衣橱里没有这一套' }, { status: 404 })
      const merged = await saveGrowth({ outfitId: found.id, outfit: { ...OUTFIT_DEFAULT, ...(found.slots ?? {}) } })
      return Response.json({ ok: true, growth: merged }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/wardrobe/save',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const name = String(body.name ?? '').trim().slice(0, 20)
      if (!name) return Response.json({ ok: false, error: '名字不能为空' }, { status: 400 })
      const cur = readGrowth().growth
      const slots = {}
      for (const k of Object.keys(OUTFIT_LABELS)) {
        if (!(k in (body.slots ?? {}))) continue
        // 面板把格子清空 = 这件不穿了，落成「无」；没传的槽位才是"没改"
        const v = normSlot((body.slots ?? {})[k]) || '无'
        slots[k] = v
      }
      const id = String(body.id ?? '').trim()
      const list = (cur.wardrobe ?? []).map((w) => ({ ...w, slots: { ...(w.slots ?? {}) } }))
      const wear = body.wear === true
      let item = id ? list.find((w) => w.id === id) : list.find((w) => w.name === name)
      if (item) {
        item.name = name
        if (body.note !== undefined) item.note = String(body.note ?? '').slice(0, 80)
        item.slots = { ...item.slots, ...slots }
      } else {
        item = { id: 'w' + Date.now().toString(36), name, note: String(body.note ?? '').slice(0, 80), slots: { ...OUTFIT_DEFAULT, ...slots } }
        list.push(item)
      }
      const next = { wardrobe: list }
      // 存衣橱不改身上这身；只有明确 wear 才顺手换上
      if (wear) {
        next.outfitId = item.id
        next.outfit = { ...OUTFIT_DEFAULT, ...item.slots }
      }
      const merged = await saveGrowth(next)
      return Response.json({ ok: true, growth: merged, item }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/wardrobe/delete',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const id = String(body.id ?? '').trim()
      const cur = readGrowth().growth
      const list = cur.wardrobe ?? []
      if (list.length <= 1) return Response.json({ ok: false, error: '至少得留一套' }, { status: 400 })
      const after = list.filter((w) => w.id !== id)
      if (after.length === list.length) return Response.json({ ok: false, error: '没找到这一套' }, { status: 404 })
      // 删掉正穿着的那套不算灾难：身上这身留着，只是变成自由搭配
      const next = { wardrobe: after }
      if (id === cur.outfitId) next.outfitId = OUTFIT_CUSTOM
      const merged = await saveGrowth(next)
      return Response.json({ ok: true, growth: merged }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/growth/item',
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      const body = await readJson(request)
      const action = String(body.action ?? '')
      const name = String(body.name ?? '').trim().slice(0, 40)
      const g = readGrowth().growth
      if (action === 'add') {
        if (!name) return Response.json({ ok: false, error: '名字不能为空' }, { status: 400 })
        const qty = Math.max(1, Math.floor(Number(body.qty) || 1))
        // 数值效果：面板可以指定「吃下去会怎样」，不填就是没效果
        const effect = {}
        if (body.effect && typeof body.effect === 'object') {
          for (const k of ['satiety', 'hygiene', 'stamina', 'sleepiness', 'arousal', 'health']) {
            const v = Number(body.effect[k])
            if (Number.isFinite(v) && v !== 0) effect[k] = Math.max(-100, Math.min(100, v))
          }
        }
        // 直接喂：当场吃掉，不进背包
        if (body.feed === true) {
          if (Object.keys(effect).length === 0) return Response.json({ ok: false, error: '直接喂要填数值，不然吃了等于没吃' }, { status: 400 })
          const stats = { ...g.stats }
          for (const k of Object.keys(effect)) if (k in stats) stats[k] = clamp100(Number(stats[k]) + Number(effect[k]))
          await saveGrowth({ stats })
          return Response.json({ ok: true, stats, items: g.items, fed: true }, { headers: { 'cache-control': 'no-store' } })
        }
        const exists = g.items.find((i) => i.name === name)
        if (exists) {
          exists.qty = Math.min(99, (exists.qty ?? 1) + qty)
          if (Object.keys(effect).length > 0) exists.effect = effect
        } else {
          g.items = [...g.items, { name, qty, type: String(body.type ?? 'gift'), desc: String(body.desc ?? '').slice(0, 80), effect, from: '主人', at: Date.now() }].slice(-30)
        }
        await saveGrowth({ items: g.items })
        return Response.json({ ok: true, items: g.items }, { headers: { 'cache-control': 'no-store' } })
      }
      if (action === 'remove') {
        if (!name) return Response.json({ ok: false, error: '名字不能为空' }, { status: 400 })
        await saveGrowth({ items: g.items.filter((i) => i.name !== name) })
        return Response.json({ ok: true, items: g.items.filter((i) => i.name !== name) }, { headers: { 'cache-control': 'no-store' } })
      }
      if (action === 'use') {
        const item = g.items.find((i) => i.name === name)
        if (!item) return Response.json({ ok: false, error: '身上没有这件东西' }, { status: 404 })
        const stats = { ...g.stats }
        const effect = item.effect ?? {}
        if (Object.keys(effect).length === 0) return Response.json({ ok: false, error: '「' + name + '」没有数值效果，吃了也不会变' }, { status: 400 })
        for (const k of Object.keys(effect)) if (k in stats) stats[k] = clamp100(Number(stats[k]) + Number(effect[k]))
        item.qty = (item.qty ?? 1) - 1
        const items = item.qty > 0 ? g.items : g.items.filter((i) => i !== item)
        await saveGrowth({ stats, items })
        return Response.json({ ok: true, stats, items }, { headers: { 'cache-control': 'no-store' } })
      }
      return Response.json({ ok: false, error: '未知 action' }, { status: 400 })
    },
  })

  ctx.connection.fetch.register({
    path: '/api/awaken/overview',
    methods: ['GET'],
    requestBody: 'buffered',
    async fetch() {
      const stories = readStories(400)
      const today = new Date().toISOString().slice(0, 10)
      const todayStories = stories.filter((s) => new Date(Number(s.t ?? 0)).toISOString().slice(0, 10) === today)
      const rel = readRelations()
      return Response.json({
        ok: true,
        worldEntries: listWorldEntries().length,
        stories: stories.length,
        todayStories: todayStories.length,
        persons: rel.persons.length,
        edges: rel.edges.length,
        chats: readChatKeys().length,
      }, { headers: { 'cache-control': 'no-store' } })
    },
  })

  // ── 晚上定时发：没素材就不发 ──────────────────────────────────
  if (config.qzoneEnabled !== false) {
    const timer = setInterval(async () => {
      try {
        const now = new Date()
        if (now.getHours() !== Number(config.qzoneHour ?? 22)) return
        const state = readQzoneState()
        const today = now.toISOString().slice(0, 10)
        if (state.lastPostedOn === today) return   // 今天已经发过

        const material = todayMaterial()
        const recent = Array.isArray(state.recentTexts) ? state.recentTexts.slice(-5) : []
        const content = composePost(material, Number(config.minMaterial ?? 1), today, recent)
        if (!content) return                       // 没有值得发的 → 保持安静

        const tid = await postQzone(content, Number(config.qzoneUgcRight ?? 1))
        await writeQzoneState({
          lastPostedOn: today,
          lastTid: tid,
          postedAt: Date.now(),
          usedMaterial: material.length,
          recentTexts: [...recent, content].slice(-5),
        })

        const owner = String(config.qzoneOwner ?? '').trim()
        if (owner) {
          await onebot('send_private_msg', { user_id: Number(owner), message: `今晚发了条说说（${material.length} 条素材）：\n${content}` }).catch(() => {})
        }
      } catch (error) {
        ctx.logger?.warn?.(`dsh-impressions: 定时发说说失败 ${error?.message ?? error}`)
      }
    }, 60_000)
    ctx.effect(() => () => clearInterval(timer))
  }
}