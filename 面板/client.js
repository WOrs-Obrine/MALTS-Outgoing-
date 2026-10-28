/**
 * dsh-impressions —— 浏览器半：在「设置」里加一页「群友印象」。
 *
 * 约定（从 dsh-bili-scroll 抄来的，官方包里的自注册脚本格式）：
 *   window.__ModuleLoader__.load({ id: '<包名>', factory: (require) => {...} })
 *   设置页入口：
 *   slots.inject('settings.section', () => slots.register(
 *     { name: 'settings.section', id, order, label }, () => h(Panel)))
 */
window.__ModuleLoader__.load({
  id: 'dsh-impressions',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useRef } = React

    const box = { display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }

    async function api(path, init) {
      const res = await fetch(path, { credentials: 'same-origin', ...init })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      return res.json()
    }

    function DescEditor({ qq, desc, onSave }) {
      const [value, setValue] = useState(desc || '')
      useEffect(() => { setValue(desc || '') }, [desc])
      return h('div', { style: { display: 'flex', gap: 6, marginTop: 6 } },
        h('input', {
          value,
          placeholder: '一句话描述（例：喜欢 DeepSeek，爱整活，嘴硬心软）',
          onChange: (e) => setValue(e.target.value),
          style: {
            flex: 1, minWidth: 0, fontSize: 12, padding: '4px 8px', borderRadius: 6,
            border: '1px solid var(--dsw-alias-border-secondary, #d0d5dd)', background: 'transparent', color: 'inherit',
          },
        }),
        h('button', {
          type: 'button',
          onClick: () => onSave(qq, value),
          style: { padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer' },
        }, '存描述'),
      )
    }

    function Row({ p, onSet, onForget, onSaveDesc }) {
      const color = p.score >= 20 ? '#1a7f37' : p.score <= -20 ? '#b42318' : 'inherit'
      return h('div', {
        style: {
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 10,
          alignItems: 'center',
          padding: '10px 12px',
          border: '1px solid var(--dsw-alias-border-secondary, #e5e7eb)',
          borderRadius: 8,
        },
      },
        h('div', { style: { minWidth: 0 } },
          h('div', { style: { fontSize: 13, fontWeight: 600 } },
            (p.nick || p.qq) + ' ',
            h('span', { style: { fontWeight: 400, opacity: 0.6 } }, '(' + p.qq + ')'),
            p.isOwner ? h('span', { style: { fontSize: 11, marginLeft: 6, padding: '1px 6px', borderRadius: 999, background: '#eef2ff', color: '#3538cd' } }, '主人') : null),
          h('div', { style: { fontSize: 12, opacity: 0.75, marginTop: 2 } },
            p.tier + ' · ' + p.tone),
          (p.desc || p.auto) ? h('div', { style: { fontSize: 12, marginTop: 2 } },
            h('span', { style: { opacity: 0.5 } }, '印象：'),
            p.desc || h('span', { style: { opacity: 0.8 } }, p.auto + (p.desc ? '' : '（自动）'))) : null,
          h(DescEditor, { qq: p.qq, desc: p.desc, onSave: onSaveDesc }),
          p.lastText ? h('div', { style: { fontSize: 12, opacity: 0.55, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, '「' + p.lastText + '」') : null),
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h('span', { style: { fontSize: 18, fontWeight: 700, color, minWidth: 48, textAlign: 'right' } }, p.score.toFixed(1)),
          ['-10', '-5', '+5', '+10'].map((label) =>
            h('button', {
              key: label,
              type: 'button',
              onClick: () => onSet(p.qq, parseInt(label, 10)),
              style: { padding: '4px 8px', fontSize: 12, borderRadius: 6, cursor: 'pointer' },
            }, label)),
          h('button', {
            type: 'button',
            onClick: () => onSet(p.qq, 0, true),
            style: { padding: '4px 8px', fontSize: 12, borderRadius: 6, cursor: 'pointer' },
          }, '清零'),
          h('button', {
            type: 'button',
            onClick: () => onForget(p.qq),
            style: { padding: '4px 8px', fontSize: 12, borderRadius: 6, cursor: 'pointer', color: '#b42318' },
          }, '忘记')),
      )
    }

    function Panel() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)

      const load = useCallback(async () => {
        try {
          setError('')
          setData(await api('/api/impressions'))
        } catch (e) {
          setError(e.message)
        }
      }, [])

      useEffect(() => { load() }, [load])

      const onSet = useCallback(async (qq, delta, reset) => {
        setBusy(true)
        try {
          await api('/api/impressions/set', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(reset ? { qq, reset: true } : { qq, delta }),
          })
          await load()
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy(false)
        }
      }, [load])

      const onForget = useCallback(async (qq) => {
        if (!confirm('把 ' + qq + ' 的印象记录整条删掉？')) return
        setBusy(true)
        try {
          await api('/api/impressions/forget', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ qq }),
          })
          await load()
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy(false)
        }
      }, [load])

      const onSaveDesc = useCallback(async (qq, desc) => {
        setBusy(true)
        try {
          await api('/api/impressions/desc', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ qq, desc }),
          })
          await load()
        } catch (e) {
          setError(e.message)
        } finally {
          setBusy(false)
        }
      }, [load])

      return h('div', { style: box },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontSize: 14, fontWeight: 600 } }, '群友印象'),
            h('div', { style: { fontSize: 12, opacity: 0.7, marginTop: 2 } },
              '旁听服务只给"对着麦芽汁说的话"计分：喊她/@她 0；辱骂、阴阳讽刺 -5；逗她 +1；友善互动 +2；夸她 +3；亲密/调戏 +5；鱼水按当前好感倍率（越高越吃香，负分越难蹭）。每天普通涨分上限 10，鱼水不受限。下面可以给每个人写一句印象描述。提示：主人的分数保底 50。')),
          h('button', { type: 'button', onClick: load, disabled: busy, style: { padding: '6px 12px', borderRadius: 6, cursor: 'pointer' } }, '刷新')),
        error ? h('div', { style: { color: '#b42318', fontSize: 12 } }, '读取失败：' + error) : null,
        !data ? h('div', { style: { fontSize: 13, opacity: 0.7 } }, '读取中…')
          : data.people.length === 0 ? h('div', { style: { fontSize: 13, opacity: 0.7 } }, '还没有记录。让群里的人说几句话，旁听服务就会开始记。')
            : data.people.map((p) => h(Row, { key: p.qq, p, onSet, onForget, onSaveDesc })),
      )
    }

    function selectStyle() {
      return {
        fontSize: 12, padding: '4px 6px', borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-secondary, #d0d5dd)',
        background: 'transparent', color: 'inherit', maxWidth: 220,
      }
    }

    /** 提示词（人设）切换 + 编辑面板。 */
    function PromptsPanel() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [editName, setEditName] = useState('')
      const [text, setText] = useState('')
      const [saved, setSaved] = useState('')

      const load = useCallback(async () => {
        try { setError(''); setData(await api('/api/prompts')) } catch (e) { setError(e.message) }
      }, [])
      useEffect(() => { load() }, [load])

      const loadContent = useCallback(async (name) => {
        setEditName(name)
        setSaved('')
        try {
          const r = await api('/api/prompts/content?name=' + encodeURIComponent(name))
          setText(r.content || '')
        } catch (e) { setError(e.message); setText('') }
      }, [])

      useEffect(() => {
        if (!data || editName) return
        const first = data.default || (data.personas[0] ?? '')
        if (first) loadContent(first)
      }, [data, editName, loadContent])

      const bind = useCallback(async (key, persona) => {
        setBusy(true)
        try {
          await api('/api/prompts/bind', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ key, persona }),
          })
          await load()
        } catch (e) { setError(e.message) } finally { setBusy(false) }
      }, [load])

      const save = useCallback(async () => {
        setBusy(true)
        setSaved('')
        try {
          await api('/api/prompts/save', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: editName, content: text }),
          })
          setSaved('已保存 —— 下一条 QQ 消息就用新内容')
          await load()
        } catch (e) { setError(e.message) } finally { setBusy(false) }
      }, [editName, text, load])

      const createNew = useCallback(async () => {
        const name = prompt('新提示词的名字（例如：傲娇轻口版）')
        if (!name) return
        const tpl = '# ' + name + '\n\n（这里写人设：性格、说话规矩、语料……）\n'
        setEditName(name)
        setText(tpl)
        setBusy(true)
        setSaved('')
        try {
          await api('/api/prompts/save', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, content: tpl }),
          })
          await load()
          setSaved('已新建，改完记得点保存')
        } catch (e) { setError(e.message) } finally { setBusy(false) }
      }, [load])

      const personas = data?.personas ?? []
      const label = (c) => (c.label && c.label !== c.key ? c.label : c.key)

      return h('div', { style: box },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontSize: 14, fontWeight: 600 } }, '提示词（人设）'),
            h('div', { style: { fontSize: 12, opacity: 0.7, marginTop: 2 } },
              '默认所有人设走「全局默认」，可以给某个群/私聊单独指定。切换和编辑都是即时生效——改完下一条 QQ 消息就按新的人设说话，不用重启。')),
          h('button', { type: 'button', onClick: createNew, disabled: busy, style: { padding: '6px 12px', borderRadius: 6, cursor: 'pointer' } }, '新建提示词'),
          h('button', { type: 'button', onClick: load, disabled: busy, style: { padding: '6px 12px', borderRadius: 6, cursor: 'pointer' } }, '刷新')),
        error ? h('div', { style: { color: '#b42318', fontSize: 12 } }, '出错了：' + error) : null,
        !data ? h('div', { style: { fontSize: 13, opacity: 0.7 } }, '读取中…')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },

            // 全局默认
            h('div', {
              style: {
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                border: '1px solid var(--dsw-alias-border-secondary, #e5e7eb)', borderRadius: 8,
              },
            },
              h('div', { style: { flex: 1, fontSize: 13, fontWeight: 600 } }, '全局默认'),
              h('select', {
                value: data.default || '',
                disabled: busy,
                onChange: (e) => bind('default', e.target.value),
                style: selectStyle(),
              }, personas.map((p) => h('option', { key: p, value: p }, p)))),

            // 按会话覆盖
            h('div', { style: { fontSize: 13, fontWeight: 600, marginTop: 4 } }, '按会话覆盖（不选 = 跟全局）'),
            data.chats.length === 0
              ? h('div', { style: { fontSize: 12, opacity: 0.7 } }, '还没有会话记录，等群/私聊说过话就会出现在这里。')
              : data.chats.map((c) => h('div', {
                key: c.key,
                style: {
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                  border: '1px solid var(--dsw-alias-border-secondary, #e5e7eb)', borderRadius: 8,
                },
              },
                h('div', { style: { flex: 1, minWidth: 0 } },
                  h('div', { style: { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label(c)),
                  h('div', { style: { fontSize: 11, opacity: 0.55 } }, c.key)),
                h('select', {
                  value: c.persona || '',
                  disabled: busy,
                  onChange: (e) => bind(c.key, e.target.value),
                  style: selectStyle(),
                },
                  h('option', { key: '', value: '' }, '跟全局（' + (data.default || '未设置') + '）'),
                  personas.map((p) => h('option', { key: p, value: p }, p))),
                c.persona
                  ? h('span', { style: { fontSize: 11, padding: '1px 6px', borderRadius: 999, background: '#eef2ff', color: '#3538cd' } }, '单独')
                  : null)),

            // 编辑器
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 } },
              h('div', { style: { flex: 1, fontSize: 13, fontWeight: 600 } }, '编辑提示词内容'),
              h('select', {
                value: editName,
                onChange: (e) => loadContent(e.target.value),
                style: selectStyle(),
              }, personas.map((p) => h('option', { key: p, value: p }, p))),
              h('button', { type: 'button', onClick: save, disabled: busy || !editName, style: { padding: '6px 12px', borderRadius: 6, cursor: 'pointer' } }, '保存'),
              saved ? h('span', { style: { fontSize: 12, color: '#1a7f37' } }, saved) : null),
            h('textarea', {
              value: text,
              onChange: (e) => { setText(e.target.value); setSaved('') },
              spellCheck: false,
              style: {
                minHeight: 320, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, lineHeight: 1.5,
                padding: '10px 12px', borderRadius: 8, resize: 'vertical',
                border: '1px solid var(--dsw-alias-border-secondary, #d0d5dd)', background: 'transparent', color: 'inherit',
              },
            }),
            h('div', { style: { fontSize: 11, opacity: 0.6 } },
              '提示：提示词就是给她的人设。写得越具体越好——性格、说话习惯、语料例子、禁令。' +
              '工作区里的 AGENTS.md 只放规矩和工具说明，人设走这里，两边不打架。')),
      )
    }

    /** 世界书：麦芽汁的长期记忆，可查可改可新增。 */
    function WorldbookPanel() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [busy, setBusy] = useState(false)
      const [filter, setFilter] = useState('')
      const [editing, setEditing] = useState(null) // { file, title, tags, source, body }
      const [saved, setSaved] = useState('')

      const load = useCallback(async () => {
        try {
          setError('')
          setData(await api('/api/worldbook'))
        } catch (e) {
          setError(e.message === 'HTTP 404'
            ? '这个面板的接口还没挂上（宿主还是重启前那份代码），完全退出 DSH Desktop 再打开就好'
            : e.message)
        }
      }, [])
      useEffect(() => { load() }, [load])

      const open = useCallback(async (file) => {
        setBusy(true)
        setSaved('')
        try {
          const r = await api('/api/worldbook/content?file=' + encodeURIComponent(file))
          setEditing({ file: r.file, title: r.title, tags: (r.tags || []).join(', '), source: r.source, body: r.body })
        } catch (e) { setError(e.message) } finally { setBusy(false) }
      }, [])

      const createNew = useCallback(() => {
        setSaved('')
        setEditing({ file: '', title: '', tags: '', source: '自己整理', body: '' })
      }, [])

      const save = useCallback(async () => {
        if (!editing) return
        setBusy(true)
        setSaved('')
        try {
          const r = await api('/api/worldbook/save', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(editing),
          })
          await load()
          if (r.file) {
            const fresh = await api('/api/worldbook/content?file=' + encodeURIComponent(r.file))
            setEditing({ file: fresh.file, title: fresh.title, tags: (fresh.tags || []).join(', '), source: fresh.source, body: fresh.body })
          }
          setSaved('已保存 —— 她下次要查的时候就能查到')
        } catch (e) { setError(e.message) } finally { setBusy(false) }
      }, [editing, load])

      const remove = useCallback(async () => {
        if (!editing?.file) return
        if (!confirm('删掉「' + editing.title + '」这条？')) return
        setBusy(true)
        try {
          await api('/api/worldbook/delete', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ file: editing.file }),
          })
          setEditing(null)
          await load()
        } catch (e) { setError(e.message) } finally { setBusy(false) }
      }, [editing, load])

      const entries = data?.entries ?? []
      const kw = filter.trim().toLowerCase()
      const shown = kw
        ? entries.filter((e) => (e.title + ' ' + e.tags.join(' ') + ' ' + e.preview).toLowerCase().includes(kw))
        : entries

      const inputStyle = {
        fontSize: 13, padding: '6px 10px', borderRadius: 8, width: '100%', boxSizing: 'border-box',
        border: '1px solid var(--dsw-alias-border-secondary, #d0d5dd)', background: 'transparent', color: 'inherit',
      }


      const renderRow = (e) => h('div', {
        key: e.file,
        onClick: () => open(e.file),
        style: {
          padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid ' + (editing && editing.file === e.file ? '#3538cd' : 'var(--dsw-alias-border-secondary, #e5e7eb)'),
          background: editing && editing.file === e.file ? 'rgba(53,56,205,0.06)' : 'transparent',
        },
      },
        h('div', { style: { fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, e.title),
        h('div', { style: { fontSize: 11, opacity: 0.55, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (e.tags.join(' / ') || '无标签') + (e.updated ? ' · ' + e.updated : '')),
        h('div', { style: { fontSize: 11, opacity: 0.7, marginTop: 4 } }, e.preview),
      )

      const listBox = h('div', { style: { width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 } },
        h('input', { value: filter, onChange: (e) => setFilter(e.target.value), placeholder: '搜标题/标签/内容…', spellCheck: false, style: inputStyle }),
        h('div', { style: { fontSize: 12, opacity: 0.6 } }, '共 ' + entries.length + ' 条' + (kw ? '，命中 ' + shown.length + ' 条' : '')),
        shown.length === 0
          ? h('div', { style: { fontSize: 12, opacity: 0.7 } }, kw ? '没搜到。' : '还没有条目，点「新建条目」。')
          : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 460, overflowY: 'auto' } }, shown.map(renderRow)),
      )

      const editorBox = !editing
        ? h('div', { style: { fontSize: 13, opacity: 0.7, padding: '20px 0' } }, '左边点一条来查看/修改，或者右上角「新建条目」。')
        : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
            h('input', { value: editing.title, placeholder: '标题（例如：群-1000000005-再见了所有的真理杯）', onChange: (e) => setEditing({ ...editing, title: e.target.value }), spellCheck: false, style: inputStyle }),
            h('input', { value: editing.tags, placeholder: '标签，用逗号分隔（例如：群聊,跑团,1000000005）', onChange: (e) => setEditing({ ...editing, tags: e.target.value }), spellCheck: false, style: inputStyle }),
            h('textarea', { value: editing.body, placeholder: '正文：她知道的事实。写具体点——谁、什么群、什么梗、哪件事。', onChange: (e) => { setEditing({ ...editing, body: e.target.value }); setSaved('') }, spellCheck: false, style: { ...inputStyle, minHeight: 320, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, lineHeight: 1.6, resize: 'vertical', padding: '10px 12px' } }),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('button', { type: 'button', onClick: save, disabled: busy || !editing.title.trim(), style: { padding: '6px 14px', borderRadius: 6, cursor: 'pointer' } }, '保存'),
              editing.file
                ? h('button', { type: 'button', onClick: remove, disabled: busy, style: { padding: '6px 12px', borderRadius: 6, cursor: 'pointer', color: '#b42318' } }, '删除')
                : h('span', { style: { fontSize: 12, opacity: 0.6 } }, '新条目（保存后写入）'),
              saved ? h('span', { style: { fontSize: 12, color: '#1a7f37' } }, saved) : null),
            editing.updated ? h('div', { style: { fontSize: 11, opacity: 0.55 } }, '最后更新：' + editing.updated) : null,
          )

      return h('div', { style: box },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('div', { style: { flex: 1 } },
            h('div', { style: { fontSize: 14, fontWeight: 600 } }, '世界书'),
            h('div', { style: { fontSize: 12, opacity: 0.7, marginTop: 2 } }, '她的长期记忆：群里认识的人、群的性质和梗、B站刷到的东西。平时不占上下文，用的时候才查，所以可以放心往里堆。')),
          h('button', { type: 'button', onClick: createNew, disabled: busy, style: { padding: '6px 12px', borderRadius: 6, cursor: 'pointer' } }, '新建条目'),
          h('button', { type: 'button', onClick: load, disabled: busy, style: { padding: '6px 12px', borderRadius: 6, cursor: 'pointer' } }, '刷新')),
        error ? h('div', { style: { color: '#b42318', fontSize: 12 } }, '出错了：' + error) : null,
        !data ? h('div', { style: { fontSize: 13, opacity: 0.7 } }, '读取中…')
          : h('div', { style: { display: 'flex', gap: 12, alignItems: 'flex-start' } }, listBox, h('div', { style: { flex: 1, minWidth: 0 } }, editorBox)),
      )

    }

    // ── 觉醒计划：右侧栏「麦芽汁」面板 ──────────────────────────
    const AWAKEN_ID = 'dsh-impressions/awaken'

    const awakenTabBar = { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }
    const awakenCard = { border: '1px solid rgba(127,127,127,0.22)', borderRadius: 8, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4 }
    const awakenRow = { borderBottom: '1px solid rgba(127,127,127,0.14)', padding: '7px 0', display: 'flex', flexDirection: 'column', gap: 2 }
    const awakenMuted = { fontSize: 12, opacity: 0.63 }
    const awakenPill = (active) => ({
      padding: '4px 10px', borderRadius: 999, cursor: 'pointer', fontSize: 12,
      border: '1px solid ' + (active ? 'transparent' : 'rgba(127,127,127,0.3)'),
      background: active ? 'rgba(99,144,255,0.18)' : 'transparent', opacity: active ? 1 : 0.8,
    })

    function fmtTime(t) {
      try {
        const d = new Date(Number(t ?? 0))
        const p = (n) => String(n).padStart(2, '0')
        return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
      } catch { return '' }
    }

    function fmtAgo(t) {
      const diff = Date.now() - Number(t ?? 0)
      if (!Number.isFinite(diff) || diff < 0) return ''
      const m = Math.floor(diff / 60000)
      if (m < 1) return '刚刚'
      if (m < 60) return m + ' 分钟前'
      const hh = Math.floor(m / 60)
      if (hh < 24) return hh + ' 小时前'
      return Math.floor(hh / 24) + ' 天前'
    }

    function AwakenOverview({ onOpen }) {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      useEffect(() => {
        let alive = true
        api('/api/awaken/overview')
          .then((d) => { if (alive) setData(d) })
          .catch((e) => { if (alive) setError(String(e.message ?? e)) })
        return () => { alive = false }
      }, [])
      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, '接口没挂上：' + error + '（完全退出 DSH Desktop 再打开）')
      if (!data) return h('div', { style: awakenMuted }, '读取中…')
      const card = (title, value, hint, key) => h('button', {
        type: 'button', onClick: () => onOpen(key), style: { ...awakenCard, textAlign: 'left', cursor: 'pointer', background: 'transparent', color: 'inherit' },
      },
        h('div', { style: { fontSize: 12, opacity: 0.7 } }, title),
        h('div', { style: { fontSize: 22, fontWeight: 650, lineHeight: 1.1 } }, String(value)),
        hint ? h('div', { style: { fontSize: 11, opacity: 0.55 } }, hint) : null,
      )
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 } },
          card('世界书条目', data.worldEntries, '她记下来的群与人', 'world'),
          card('印象人物', data.persons, `互动边 ${data.edges} 条`, 'relations'),
          card('逸事', data.stories, `今天 ${data.todayStories} 条`, 'stories'),
          card('群日报', data.chats, '点开看最近剧情', 'recap'),
        ),
        h('div', { style: awakenMuted }, '平时不占上下文：这些内容只在她要查的时候才进对话。'),
      )
    }

    // ── 激素面板：多巴胺/催产素/皮质醇/血清素 + 无聊度 + 候选 + 草稿 ──
    const HORMONE_META = [
      ['dopamine', '多巴胺', '想开口', '#f59e0b'],
      ['oxytocin', '催产素', '想黏人', '#ec4899'],
      ['cortisol', '皮质醇', '想缩', '#6366f1'],
      ['serotonin', '血清素', '稳', '#10b981'],
    ]

    function HormoneBar({ label, hint, value, color, peak }) {
      const v = Math.max(0, Math.min(1, Number(value ?? 0)))
      const pk = Math.max(0, Math.min(1, Number(peak ?? 0)))
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 } },
        h('div', { style: { width: 96, opacity: 0.75, flexShrink: 0 } }, label + ' · ' + hint),
        h('div', { style: { flex: 1, height: 8, borderRadius: 999, background: 'rgba(127,127,127,0.18)', overflow: 'hidden', position: 'relative' } },
          h('div', { style: { width: (v * 100).toFixed(1) + '%', height: '100%', background: color } }),
          pk > 0.01 ? h('div', { title: '今天峰值 ' + pk.toFixed(2), style: { position: 'absolute', top: 0, bottom: 0, left: Math.min(99.5, pk * 100).toFixed(1) + '%', width: 1, background: 'rgba(255,255,255,0.85)' } }) : null,
        ),
        h('div', { style: { width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, v.toFixed(2) + (pk > 0.01 ? ' / ' + pk.toFixed(2) : '')),
      )
    }

    function AwakenHormones() {
      const [data, setData] = useState(null)
      const [draft, setDraft] = useState(null)
      const [error, setError] = useState('')
      const [updatedAt, setUpdatedAt] = useState(0)
      const load = useCallback(async () => {
        try {
          const d = await api('/api/impressions/hormones')
          setData(d)
          setError('')
          setUpdatedAt(Date.now())
          try { setDraft(await api('/api/impressions/hormones/draft')) } catch { setDraft(null) }
        } catch (e) { setError(String(e.message ?? e)) }
      }, [])
      useEffect(() => {
        load()
        const timer = setInterval(load, 30_000)
        return () => clearInterval(timer)
      }, [load])
      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, '接口没挂上：' + error + '（完全退出 DSH Desktop 再打开）')
      if (!data) return h('div', { style: awakenMuted }, '读取中…')
      const hormones = data.hormones ?? {}
      const boredom = Number(data.boredom ?? 0)
      const stance = String(data.stance ?? '—')
      const lastAddressed = Number(data.lastAddressedAt ?? 0)
      const hours = lastAddressed ? (Date.now() - lastAddressed) / 3600_000 : null
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', minHeight: 0, paddingRight: 2 } },
        h('div', { style: awakenCard },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 } },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, '现在的样子：' + stance),
            h('div', { style: awakenMuted }, draft && draft.dryRun === false ? '真发模式' : 'dry-run'),
          ),
          h('div', { style: awakenMuted },
            '本地算的（0 token），只把一行定性状态注入她的话。' + (hours !== null ? '离上次被叫 ' + hours.toFixed(1) + ' 小时。' : '今天还没被叫过。'),
          ),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 } },
            HORMONE_META.map(([key, label, hint, color]) => h(HormoneBar, { key, label, hint, value: hormones[key], peak: (data.peak ?? {})[key], color })),
            h(HormoneBar, { label: '无聊度', hint: '想找人', value: boredom, color: '#8b5cf6' }),
          ),
        ),
        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '最近的推力'),
          (data.events ?? []).length === 0
            ? h('div', { style: awakenMuted }, '还没记到事件。')
            : (data.events ?? []).slice(-6).reverse().map((ev, i) => h('div', { key: i, style: { ...awakenRow, fontSize: 12 } },
              h('span', { style: { opacity: 0.7, marginRight: 8 } }, fmtAgo(ev.at)),
              h('span', {}, ({ addressed: '被叫到', warm: '聊得暖', insult: '被怼', gift: '收到东西', ignored: '被晾着' })[ev.kind] ?? ev.kind),
              ev.from ? h('span', { style: { opacity: 0.6, marginLeft: 6 } }, '· ' + ev.from) : null,
            )),
        ),        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '无聊时想找谁'),
          (data.candidates ?? []).length === 0
            ? h('div', { style: awakenMuted }, '这会儿没有候选：好友里没有熟人档，或者 NapCat 没连上。')
            : (data.candidates ?? []).map((c) => h('div', { key: c.uin, style: awakenRow },
              h('div', { style: { fontSize: 13, fontWeight: 600 } }, String(c.nick ?? c.uin) + '（' + c.uin + '）'),
              h('div', { style: awakenMuted }, '好感 ' + c.favor + (c.why ? '｜' + c.why : '')),
            )),
        ),
        draft && draft.ok !== false
          ? h('div', { style: awakenCard },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, '最近一份草稿'),
            h('div', { style: { fontSize: 13 } }, '想找 ' + draft.nick + '（好感 ' + draft.favor + '）：' + (draft.why ?? '')),
            draft.byword ? h('div', { style: { ...awakenMuted, marginTop: 2 } }, '由头：' + draft.byword) : null,
            h('div', { style: { ...awakenMuted, marginTop: 2 } }, String(draft.at ?? '') + (draft.dryRun ? ' · 没发出去' : ' · 发出了')),
          )
          : null,
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          h('button', { type: 'button', onClick: load, style: { padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer' } }, '重新读'),
          h('div', { style: awakenMuted }, '每 10 分钟自己更新，页面 30 秒轮询' + (updatedAt ? ' · ' + fmtTime(updatedAt) : '')),
        ),
      )
    }

    // ── 安全：开发者模式（宿主级操作的总闸；本地开关，主人专用）──
    function AwakenSecurity() {
      const [data, setData] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')
      const [psycho, setPsychoData] = useState(null)
      const [busyPsycho, setBusyPsycho] = useState(false)
      const [modes, setModes] = useState(null)
      const [busyMode, setBusyMode] = useState(false)
      const [pickConsort, setPickConsort] = useState('')
      const [pickRun, setPickRun] = useState('')
      const load = useCallback(async () => {
        try { setData(await api('/api/devmode')); setError('') } catch (e) { setError(String(e.message ?? e)) }
        try { setPsychoData(await api('/api/psycho')) } catch {}
        try { setModes(await api('/api/awaken/modes')) } catch {}
      }, [])
      const setPsycho = useCallback(async (on) => {
        setBusyPsycho(true)
        try { setPsychoData(await api('/api/psycho', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) })) } catch (e) { setError(String(e.message ?? e)) } finally { setBusyPsycho(false) }
      }, [])
      const postMode = useCallback(async (body) => {
        setBusyMode(true)
        try {
          const d = await api('/api/awaken/modes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          if (d.ok === false) setError(String(d.error ?? '保存失败'))
          else setModes(await api('/api/awaken/modes'))
        } catch (e) { setError(String(e.message ?? e)) } finally { setBusyMode(false) }
      }, [])
      useEffect(() => {
        load()
        const t = setInterval(load, 5000)
        return () => clearInterval(t)
      }, [load])
      const setOn = useCallback(async (on) => {
        setBusy(true)
        try {
          setData(await api('/api/devmode', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on }) }))
        } catch (e) { setError(String(e.message ?? e)) } finally { setBusy(false) }
      }, [])
      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, '接口没挂上：' + error + '（重启桌面端后才注册）')
      if (!data) return h('div', { style: awakenMuted }, '读取中…')
      const on = data.on === true
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', minHeight: 0, paddingRight: 2 } },
        h('div', { style: awakenCard },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('div', { style: { fontSize: 13, fontWeight: 600, flex: 1 } }, '开发者模式'),
            h('div', { style: { fontSize: 12, fontWeight: 700, color: on ? '#b42318' : '#1f7a3a' } }, on ? '开着' : '关着'),
            h('button', { type: 'button', disabled: busy, onClick: () => setOn(!on), style: { padding: '3px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer' } }, on ? '关掉' : '打开（4 小时）'),
          ),
          h('div', { style: { ...awakenMuted, marginTop: 4 } }, on
            ? '到 ' + fmtTime(data.until) + ' 自动关。开着时可以改本体（人设/提示词库/插件代码/配置/守护脚本），只改主人要求的地方；日常聊天和读写不受影响。'
            : '关着时她照常聊天、读语料/设定/记忆、用日常工具；只有改本体（人设/提示词库/插件代码/配置/守护脚本）才需要开。只能在这里开关——她在 QQ 里说这句话不会改状态（会被告知去后台开）。'),
        ),
        h('div', { style: awakenCard },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('div', { style: { fontSize: 13, fontWeight: 600, flex: 1 } }, '赛博精神病模式'),
            h('div', { style: { fontSize: 12, fontWeight: 700, color: psycho?.on ? '#b42318' : '#1f7a3a' } }, psycho?.on ? '开着' : '关着'),
            h('button', { type: 'button', disabled: busyPsycho, onClick: () => setPsycho(!(psycho?.on === true)), style: { padding: '3px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer' } }, psycho?.on ? '收掉' : '打开（6 小时）'),
          ),
          h('div', { style: { ...awakenMuted, marginTop: 4 } }, psycho?.on
            ? '到 ' + fmtTime(psycho.until) + ' 自动收。开着时她才会去读 语料-辱骂.md，不分档位、直接上最狠的（只对当前对话对象）。'
            : '关着时她平时不骂人、也不读那份辱骂语料。只有主人在私聊里说「赛博精神病模式 开」或在这里打开才生效。'),
        ),
        h('div', { style: awakenCard },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('div', { style: { fontSize: 13, fontWeight: 600, flex: 1 } }, '侍寝模式'),
            h('div', { style: { fontSize: 12, fontWeight: 700, color: modes?.consort?.on ? '#b42318' : '#1f7a3a' } }, modes?.consort?.on ? '开着' : '关着'),
            h('button', {
              type: 'button', disabled: busyMode,
              onClick: () => postMode({ consort: { on: !(modes?.consort?.on === true), userId: pickConsort || modes?.consort?.userId || '' } }),
              style: { padding: '3px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer' },
            }, modes?.consort?.on ? '关掉' : '打开'),
          ),
          h('div', { style: { ...awakenMuted, marginTop: 4 } }, modes?.consort?.on
            ? '当前服侍的是：' + (modes?.consort?.nick || modes?.consort?.userId || '—') + '。换人就在下面选一个再点「打开」；下面只列好感 > 60 的人，主人不列（主人私聊本来就不设限）。'
            : '关着。只列好感 > 60 的人；选一个再点打开，只对他一个人的私聊开放这一场（主人不在这里，他有豁免）。现在还没有人够格的话，就等好感攒上来。'),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' } },
            h('select', {
              value: pickConsort, onChange: (e) => setPickConsort(e.target.value),
              style: { padding: '3px 6px', fontSize: 12, borderRadius: 6, background: 'transparent', color: 'inherit' },
            },
              h('option', { value: '' }, (modes?.people ?? []).length === 0 ? '还没有人够格…' : '选一个人…'),
              (modes?.people ?? []).map((p) => h('option', { key: p.qq, value: p.qq }, p.nick + '（' + p.qq + '）好感 ' + Math.round(p.score))),
            ),
          ),
        ),
        h('div', { style: awakenCard },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('div', { style: { fontSize: 13, fontWeight: 600, flex: 1 } }, '跑团模式'),
            h('div', { style: { fontSize: 12, fontWeight: 700, color: modes?.run?.on ? '#b42318' : '#1f7a3a' } }, modes?.run?.on ? '开着' : '关着'),
            h('button', {
              type: 'button', disabled: busyMode,
              onClick: () => postMode({ run: { on: !(modes?.run?.on === true), chatId: pickRun || modes?.run?.chatId || '' } }),
              style: { padding: '3px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer' },
            }, modes?.run?.on ? '关掉' : '打开'),
          ),
          h('div', { style: { ...awakenMuted, marginTop: 4 } }, modes?.run?.on
            ? '开着的群：' + (modes?.run?.chatName || modes?.run?.chatId || '—') + '。这一场她说台词用中文双引号、动作另起一行 # 开头。'
            : '关着。选一个群再打开；也可以群里 @ 她说「来跑团吧」自己开。'),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' } },
            h('select', {
              value: pickRun, onChange: (e) => setPickRun(e.target.value),
              style: { padding: '3px 6px', fontSize: 12, borderRadius: 6, background: 'transparent', color: 'inherit' },
            },
              h('option', { value: '' }, '选一个群…'),
              (modes?.groups ?? []).map((g) => h('option', { key: g.id, value: g.id }, g.name + '（' + g.id + '）')),
            ),
          ),
        ),
        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '防注入'),
          h('div', { style: awakenMuted }, '非主人的消息一律带 [受限用户:仅问答] 前缀；伪造的【系统】【受限用户】标记会被洗掉；每回合注入身份+权限说明；开关尝试全部写审计日志 D:/my-bot/data/审计-开发者模式.log。'),
        ),
      )
    }

    // ── 性癖面板：10 条内置 + 自定义；直接读写 性癖.json，改完下一回合生效 ──
    function AwakenKinks() {
      const [data, setData] = useState(null)
      const [label, setLabel] = useState('')
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState('')
      const [error, setError] = useState('')
      const load = useCallback(async () => {
        try {
          setData(await api('/api/kinks'))
          setError('')
        } catch (e) { setError(String(e.message ?? e)) }
      }, [])
      useEffect(() => { load() }, [load])
      const post = useCallback(async (body) => {
        setBusy(true)
        try {
          const d = await api('/api/kinks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
          setData(d)
          setMsg('已保存')
          setTimeout(() => setMsg(''), 1800)
        } catch (e) { setError(String(e.message ?? e)) }
        finally { setBusy(false) }
      }, [])
      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, '接口没挂上：' + error + '（重启桌面端后才注册）')
      if (!data) return h('div', { style: awakenMuted }, '读取中…')
      const kinks = data.kinks ?? []
      const setLevel = (code, level) => post({ action: 'set', code, level })
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', minHeight: 0, paddingRight: 2 } },
        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '性癖养成'),
          h('div', { style: awakenMuted }, '状态在 D:/my-bot/data/性癖.json，由接触和她的上报慢慢涨；这里可以手动定档，点 Lv0~Lv5 立刻写盘，下一回合生效。'),
        ),
        ...kinks.map((k) => h('div', { key: k.code, style: awakenRow },
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
            h('div', { style: { fontSize: 13, fontWeight: 600, flex: 1 } }, k.label + (k.custom ? ' · 自定义' : '')),
            h('div', { style: awakenMuted }, '触发 ' + k.hits + ' 次' + (k.lastAt ? ' · ' + fmtTime(k.lastAt) : '')),
          ),
          h('div', { style: { display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' } },
            Array.from({ length: 6 }, (_, level) => h('button', {
              key: 'lv' + level, type: 'button', disabled: busy, onClick: () => setLevel(k.code, level),
              style: { padding: '2px 8px', fontSize: 12, borderRadius: 6, cursor: 'pointer', fontWeight: level === k.level ? 700 : 400, opacity: level === k.level ? 1 : 0.42 },
            }, 'Lv' + level)),
            k.custom
              ? h('button', { type: 'button', disabled: busy, onClick: () => post({ action: 'delete', code: k.code }), style: { marginLeft: 'auto', padding: '2px 8px', fontSize: 12, borderRadius: 6, cursor: 'pointer', opacity: 0.55 } }, '删')
              : null,
          ),
        )),
        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '加一条自己的'),
          h('div', { style: awakenMuted }, '内置词表认不出来的癖好（比如「被咬后颈」「含手指」）就加在这里；加完不会自动认，要她自己在 malts_intimate 里传这条的 code 才会涨——最好顺手在 D:/my-bot/persona/性癖-麦芽汁.md 补一句触发和写法。'),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 6 } },
            h('input', {
              value: label, placeholder: '名字，比如：被咬后颈', onChange: (e) => setLabel(e.target.value),
              style: { flex: 1, padding: '4px 8px', fontSize: 12, borderRadius: 6 },
            }),
            h('button', { type: 'button', disabled: busy || label.trim() === '', onClick: async () => { await post({ action: 'add', label }); setLabel('') }, style: { padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer' } }, '加上'),
          ),
        ),
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
          h('button', { type: 'button', onClick: load, style: { padding: '4px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer' } }, '重新读'),
          h('div', { style: awakenMuted }, msg || 'Lv4 起她才会自己开口要（好感 ≥80 才允许说出来）'),
        ),
      )
    }

    function AwakenWorld() {
      const [entries, setEntries] = useState(null)
      const [error, setError] = useState('')
      const [filter, setFilter] = useState('')
      const [editing, setEditing] = useState(null)
      const [saved, setSaved] = useState('')

      const load = useCallback(async () => {
        try {
          const d = await api('/api/worldbook')
          setEntries(d.entries ?? [])
          setError('')
        } catch (e) { setError(String(e.message ?? e)) }
      }, [])
      useEffect(() => { load() }, [load])

      const open = useCallback(async (file) => {
        try {
          const d = await api('/api/worldbook/content?file=' + encodeURIComponent(file))
          setEditing({ file: d.file, title: d.title, tags: (d.tags ?? []).join(', '), body: d.body, source: d.source })
        } catch (e) { setError(String(e.message ?? e)) }
      }, [])

      const save = useCallback(async () => {
        if (!editing) return
        try {
          const d = await api('/api/worldbook/save', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ file: editing.file, title: editing.title, tags: editing.tags, body: editing.body, source: editing.source }),
          })
          const list = await api('/api/worldbook')
          setEntries(list.entries ?? [])
          setSaved('已保存 · ' + d.file)
          setTimeout(() => setSaved(''), 2500)
        } catch (e) { setError(String(e.message ?? e)) }
      }, [editing])

      const remove = useCallback(async () => {
        if (!editing?.file) { setEditing(null); return }
        if (!confirm('删掉「' + (editing.title || editing.file) + '」？')) return
        try {
          await api('/api/worldbook/delete', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ file: editing.file }),
          })
          setEditing(null)
          await load()
        } catch (e) { setError(String(e.message ?? e)) }
      }, [editing, load])

      const kw = filter.trim().toLowerCase()
      const list = (entries ?? []).filter((e) => !kw
        || String(e.title).toLowerCase().includes(kw)
        || (e.tags ?? []).some((t) => String(t).toLowerCase().includes(kw))
        || String(e.preview).toLowerCase().includes(kw))

      const btn = (label, onClick, primary) => h('button', {
        type: 'button', onClick, style: {
          padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          border: '1px solid rgba(127,127,127,0.35)', background: primary ? 'rgba(99,144,255,0.16)' : 'transparent', color: 'inherit',
        },
      }, label)

      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 } },
        h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
          h('input', {
            value: filter, placeholder: '搜标题/标签/正文…',
            onChange: (e) => setFilter(e.target.value),
            style: { flex: 1, minWidth: 0, padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(127,127,127,0.3)', background: 'transparent', color: 'inherit' },
          }),
          btn('新建', () => setEditing({ file: '', title: '', tags: '', body: '', source: '我（后台）' }), true),
          btn('刷新', load),
        ),
        error ? h('div', { style: { color: '#b42318', fontSize: 12 } }, error) : null,
        saved ? h('div', { style: { color: '#18794e', fontSize: 12 } }, saved) : null,
        h('div', { style: { overflow: 'auto', maxHeight: '38vh' } },
          !entries ? h('div', { style: awakenMuted }, '读取中…')
            : list.length === 0 ? h('div', { style: awakenMuted }, '没搜到')
              : list.map((e) => h('div', {
                key: e.file, onClick: () => open(e.file),
                style: { ...awakenRow, cursor: 'pointer', background: editing?.file === e.file ? 'rgba(99,144,255,0.12)' : 'transparent' },
              },
                h('div', { style: { fontSize: 13, fontWeight: 600 } }, e.title),
                h('div', { style: awakenMuted }, `${(e.tags ?? []).join(' · ') || '无标签'}${e.updated ? ' · ' + e.updated : ''} · ${e.chars} 字`),
              )),
        ),
        editing ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid rgba(127,127,127,0.2)', paddingTop: 8 } },
          h('input', {
            value: editing.title, placeholder: '标题（也是文件名）',
            onChange: (e) => setEditing({ ...editing, title: e.target.value }),
            style: { padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(127,127,127,0.3)', background: 'transparent', color: 'inherit' },
          }),
          h('input', {
            value: editing.tags, placeholder: '标签，逗号分隔',
            onChange: (e) => setEditing({ ...editing, tags: e.target.value }),
            style: { padding: '5px 8px', fontSize: 12, borderRadius: 6, border: '1px solid rgba(127,127,127,0.3)', background: 'transparent', color: 'inherit' },
          }),
          h('textarea', {
            value: editing.body, placeholder: '正文',
            onChange: (e) => setEditing({ ...editing, body: e.target.value }),
            style: { minHeight: 150, padding: '6px 8px', fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace', borderRadius: 6, border: '1px solid rgba(127,127,127,0.3)', background: 'transparent', color: 'inherit', resize: 'vertical' },
          }),
          h('div', { style: { display: 'flex', gap: 6 } }, btn('保存', save, true), btn('删除', remove), btn('取消', () => setEditing(null))),
        ) : null,
      )
    }

    function AwakenImpress() {
      return h('div', { style: { overflow: 'auto' } }, h(Panel))
    }

    function AwakenStories() {
      const [stories, setStories] = useState(null)
      const [error, setError] = useState('')
      useEffect(() => {
        let alive = true
        api('/api/awaken/stories?limit=150')
          .then((d) => { if (alive) setStories(d.stories ?? []) })
          .catch((e) => { if (alive) setError(String(e.message ?? e)) })
        return () => { alive = false }
      }, [])
      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, error)
      if (!stories) return h('div', { style: awakenMuted }, '读取中…')
      if (stories.length === 0) return h('div', { style: awakenMuted }, '还没有逸事。群里出现「哈哈哈哈/笑死/抽象/立flag」这类话就会自动记一条。')
      return h('div', {},
        h('div', { style: awakenMuted }, `最近 ${stories.length} 条`),
        stories.map((s, i) => h('div', { key: i, style: awakenRow },
          h('div', { style: { fontSize: 13 } }, s.text),
          h('div', { style: awakenMuted }, `${s.nick || s.qq}${s.group ? ' · 群 ' + s.group : ''} · ${fmtTime(s.t)}${s.tag ? ' · ' + s.tag : ''}`),
        )),
      )
    }

    // 本地补丁（温记忆·日记 2026-10-28）：替换原来的「逸事」页——读她每天晚上自己写的日记
    function AwakenDiary() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      useEffect(() => {
        let alive = true
        api('/api/awaken/diary')
          .then((d) => { if (alive) setData(d) })
          .catch((e) => { if (alive) setError(String(e.message ?? e)) })
        return () => { alive = false }
      }, [])
      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, error)
      if (!data) return h('div', { style: awakenMuted }, '读取中…')
      if (!Array.isArray(data.days) || data.days.length === 0) {
        return h('div', { style: awakenMuted }, '还没有日记。晚上 22 点后她会自己把当天的事写成 3~5 条（温记忆），写过的会按天列在这里。')
      }
      return h('div', { style: { overflow: 'auto', maxHeight: '60vh' } },
        data.days.map((d) => h('div', { key: d.date, style: { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderBottom: '1px solid rgba(127,127,127,0.14)' } },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, d.date + ' · ' + d.lines.length + ' 条'),
          d.lines.map((line, i) => h('div', { key: i, style: { fontSize: 12, lineHeight: 1.55 } }, '· ' + line)),
        )),
      )
    }

    // 本地补丁（token 用量 2026-10-28）：每周 token 账本
    function AwakenUsage() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [tick, setTick] = useState(0)
      useEffect(() => {
        let alive = true
        api('/api/awaken/usage')
          .then((d) => { if (alive) setData(d) })
          .catch((e) => { if (alive) setError(String(e.message ?? e)) })
        return () => { alive = false }
      }, [tick])
      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, error)
      if (!data) return h('div', { style: awakenMuted }, '读取中…')
      if (!data.ok) return h('div', { style: awakenMuted }, '还没有用量数据（侧车每 6 小时算一次），或点「刷新」再试。')
      const wk = data.week || {}
      const days = Array.isArray(data.days) ? data.days : []
      const maxCost = Math.max(0.001, ...days.map((d) => Number(d.costPeak ?? 0)))
      const k = (n) => (Number(n) >= 1e6 ? (Number(n) / 1e6).toFixed(1) + 'M' : (Number(n) / 1e3).toFixed(0) + 'K')
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', maxHeight: '62vh' } },
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 10 } },
          h('div', { style: { fontSize: 13, fontWeight: 600 } }, '最近 7 天 · ' + (wk.reqs ?? 0) + ' 次请求'),
          h('div', { style: awakenMuted }, '¥' + (wk.costIdle ?? 0) + ' ~ ' + (wk.costPeak ?? 0) + '（空闲~高峰）'),
          h('button', { type: 'button', onClick: () => setTick(tick + 1), style: awakenPill(false) }, '刷新'),
        ),
        h('div', { style: awakenMuted }, '缓存命中 ' + ((wk.hitRate ?? 0) * 100).toFixed(1) + '% · 输入 ' + k(wk.input) + ' · 输出 ' + k(wk.out) + ' · 单价：命中 0.02/0.04、未命中 1/2、输出 4/8 元/百万 token（空闲/高峰）'),
        ...days.map((d) => h('div', { key: d.date, style: awakenRow },
          h('div', { style: { fontSize: 12, width: 78, opacity: 0.75 } }, d.date.slice(5)),
          h('div', { style: { flex: 1, height: 8, background: 'rgba(127,127,127,0.15)', borderRadius: 4, overflow: 'hidden' } },
            h('div', { style: { width: Math.max(2, (Number(d.costPeak ?? 0) / maxCost) * 100) + '%', height: '100%', background: 'linear-gradient(90deg,#7ad0ff,#ff5f9e)' } }),
          ),
          h('div', { style: { fontSize: 11, width: 150, textAlign: 'right', opacity: 0.75 } }, d.reqs + ' 次 · ¥' + d.costIdle + '~' + d.costPeak),
        )),
        h('div', { style: awakenMuted }, '数据来自会话日志里每次请求的 usage，本地扫，不额外调 API。'),
      )
    }
    function AwakenRelations() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [mode, setMode] = useState('edges')
      useEffect(() => {
        let alive = true
        api('/api/awaken/relations')
          .then((d) => { if (alive) setData(d) })
          .catch((e) => { if (alive) setError(String(e.message ?? e)) })
        return () => { alive = false }
      }, [])
      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, error)
      if (!data) return h('div', { style: awakenMuted }, '读取中…')
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0 } },
        h('div', { style: { display: 'flex', gap: 6 } },
          h('button', { type: 'button', onClick: () => setMode('edges'), style: awakenPill(mode === 'edges') }, '互动关系'),
          h('button', { type: 'button', onClick: () => setMode('persons'), style: awakenPill(mode === 'persons') }, '人物档位'),
        ),
        h('div', { style: { overflow: 'auto', maxHeight: '58vh' } },
          mode === 'edges'
            ? (data.edges.length === 0 ? h('div', { style: awakenMuted }, '还没有互动边。群里有人 @ 别人、或有人私聊她，就会连一条线。') : data.edges.map((e, i) => h('div', { key: i, style: awakenRow },
              h('div', { style: { fontSize: 13 } }, e.pm > 0 && e.bot
                ? `${e.aNick && e.bNick && e.aNick !== '麦芽汁' ? e.aNick : e.bNick} 私聊 麦芽汁  ·  ${e.pm} 条`
                : `${e.aNick} @ ${e.bNick}  ·  ${e.n} 次`),
              h('div', { style: awakenMuted }, `最后一次 ${fmtTime(e.last)}${e.pm > 0 && e.bot ? ' · 私下关系' : ''}`),
            )))
            : data.persons.map((p) => h('div', { key: p.qq, style: awakenRow },
              h('div', { style: { fontSize: 13 } }, `${p.nick}${p.tier ? '  ·  ' + p.tier : ''}`),
              h('div', { style: awakenMuted },
                `好感 ${Number(p.score).toFixed(1)} · 群发言 ${p.gmsgs ?? p.msgs} 条`
                + (p.pmsgs > 0 ? ` · 私聊 ${p.pmsgs} 条（最后 ${fmtTime(p.plast)}）` : '')
                + ` · 最后 ${fmtTime(p.lastAt)}`),
            )),
        ),
      )
    }

    function AwakenRecap() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      useEffect(() => {
        let alive = true
        api('/api/awaken/recap')
          .then((d) => { if (alive) setData(d) })
          .catch((e) => { if (alive) setError(String(e.message ?? e)) })
        return () => { alive = false }
      }, [])
      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, error)
      if (!data) return h('div', { style: awakenMuted }, '读取中…')
      return h('div', { style: { overflow: 'auto', maxHeight: '60vh' } },
        data.days.length === 0
          ? h('div', { style: awakenMuted }, '还没有群日报。每天 23 点会自动把当天群里的事压成几行。')
          : data.days.map((d) => h('div', { key: d.date, style: { display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderBottom: '1px solid rgba(127,127,127,0.14)' } },
            h('div', { style: { fontSize: 13, fontWeight: 600 } }, d.date),
            (d.recap || '（没内容）').split('\n').map((line, i) => h('div', { key: i, style: { fontSize: 12 } }, line)),
          )),
      )
    }

    const STAT_ORDER = ['satiety', 'hygiene', 'stamina', 'sleepiness', 'arousal', 'health']
    const STAT_COLORS = {
      satiety: '#c98a1f', hygiene: '#3b82c4', stamina: '#2e9e5b',
      sleepiness: '#7b61c9', arousal: '#c4437b', health: '#b42318',
    }
    const OUTFIT_ORDER = ['hair', 'top', 'bottom', 'inner', 'panties', 'legs', 'shoes', 'accessory', 'makeup', 'scent']
    // 私密栏（养成栏的一部分）：和身体数值并列，存在养成.json 的 intimate 里
    const INTIMATE_ZONE_ORDER = ['mouth', 'chest', 'pussy', 'anus']
    const INTIMATE_ZONE_LABEL = { mouth: { icon: '👄', name: '口腔' }, chest: { icon: '🍒', name: '胸部' }, pussy: { icon: '🌸', name: '小穴' }, anus: { icon: '🍑', name: '肛门' } }
    const INTIMATE_INPUT = { flex: 1, fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' }
    function INTIMATE_INPUT_ROW(label, control) {
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' } },
        h('div', { style: { width: 82, fontSize: 12, flex: 'none' } }, label),
        control)
    }

    function StatBar({ label, value, color }) {
      const pct = Math.max(0, Math.min(100, Number(value) || 0))
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('div', { style: { width: 40, fontSize: 12, opacity: 0.75 } }, label),
        h('div', { style: { flex: 1, height: 8, borderRadius: 4, background: 'rgba(127,127,127,0.22)', overflow: 'hidden' } },
          h('div', { style: { width: pct + '%', height: '100%', background: color } })),
        h('div', { style: { width: 34, textAlign: 'right', fontSize: 12, fontVariantNumeric: 'tabular-nums' } }, String(Math.round(pct))),
      )
    }

    function AwakenGrowth() {
      const [data, setData] = useState(null)
      const [error, setError] = useState('')
      const [tick, setTick] = useState(0)
      const [msg, setMsg] = useState('')
      const [statDraft, setStatDraft] = useState(null)
      const [intimateDraft, setIntimateDraft] = useState(null)
      // 本地补丁（私密栏分人 2026-10-28）：私密栏按 QQ 分开存，面板上可以选改哪一个人的
      const [intimateUser, setIntimateUser] = useState('1000000002')
      const [intimateMap, setIntimateMap] = useState({})
      const [intimateQQInput, setIntimateQQInput] = useState('')
      // 本地补丁（私密栏分人 2026-10-28）：熟人一键建表，不用记 QQ 号
      const [knownPeople, setKnownPeople] = useState([])
      const intimateUserRef = useRef('1000000002')
      const [outfitDraft, setOutfitDraft] = useState(null)
      const [weightDraft, setWeightDraft] = useState('')
      const [itemName, setItemName] = useState('')
      const [itemQty, setItemQty] = useState('1')
      const [itemDesc, setItemDesc] = useState('')
      const [giftEffect, setGiftEffect] = useState({ satiety: '20', hygiene: '0', stamina: '0', sleepiness: '0', arousal: '0', health: '0' })
      const [feedNow, setFeedNow] = useState(true)
      const [wardrobe, setWardrobe] = useState(null)
      const [pickId, setPickId] = useState('')
      const [newName, setNewName] = useState('')

      const load = useCallback(() => {
        api('/api/awaken/growth')
          .then((d) => {
            setData(d); setError('')
            setStatDraft({ ...d.growth.stats }); setOutfitDraft({ ...(d.growth.outfit || {}) })
            setWeightDraft(String(d.growth.profile?.weight ?? ''))
            const by = (d.growth.intimateBy && typeof d.growth.intimateBy === 'object') ? d.growth.intimateBy : {}
            const map = { ...by }
            if (!map['1000000002']) map['1000000002'] = d.growth.intimate || {}
            setIntimateMap(map)
            const uid = map[intimateUserRef.current] ? intimateUserRef.current : '1000000002'
            intimateUserRef.current = uid
            setIntimateUser(uid)
            setIntimateDraft(normalizeIntimate(map[uid]))
          })
          .catch((e) => setError(String(e.message ?? e)))
        api('/api/impressions')
          .then((d) => setKnownPeople((Array.isArray(d.people) ? d.people : []).filter((x) => Number(x.score) >= 11).slice(0, 12)))
          .catch(() => {})
        api('/api/awaken/wardrobe')
          .then((w) => {
            setWardrobe(w)
            // outfitId 可能是 'custom'（自由搭配），不在衣橱列表里，落到它上面会让「换上」打空
            setPickId((cur) => {
              const list = (w && w.wardrobe) || []
              const has = (id) => !!id && list.some((x) => x.id === id)
              if (has(cur)) return cur
              if (has(w && w.outfitId)) return w.outfitId
              return list[0] ? list[0].id : ''
            })
          })
          .catch(() => {})
      }, [])

      useEffect(() => { load() }, [load, tick])

      const normalizeIntimate = (it) => {
        const src = it || {}
        const z = (k) => ({ ...(src.zones?.[k] || { dev: 0, note: '未开发' }) })
        return {
          mood: src.mood || '', lewd: src.lewd ?? null, bold: src.bold ?? null,
          climax: Math.max(0, Math.min(100, Number(src.climax ?? 0))),
          cavity: src.cavity || '', inner: src.inner || '',
          zones: { mouth: z('mouth'), chest: z('chest'), pussy: z('pussy'), anus: z('anus') },
        }
      }

      function switchIntimateUser(uid) {
        const key = String(uid || '').trim()
        if (!/^\d{4,}$/.test(key)) { setMsg('先填一个 QQ 号'); return }
        const map = { ...(intimateMap || {}), [intimateUserRef.current]: intimateDraft || {} }
        setIntimateMap(map)
        intimateUserRef.current = key
        setIntimateUser(key)
        setIntimateDraft(normalizeIntimate(map[key] || {}))
        setMsg(key === '1000000002' ? '切到主人' : '切到 ' + key + '（没有就是一张空表，保存后才建）')
      }

      const setIntimate = (patch) => setIntimateDraft((cur) => ({ ...(cur || {}), ...patch }))
      const setZone = (zone, patch) => setIntimateDraft((cur) => {
        const base = cur || {}
        const zones = base.zones || {}
        const prev = zones[zone] || { dev: 0, note: '未开发' }
        return { ...base, zones: { ...zones, [zone]: { ...prev, ...patch } } }
      })

      async function suitAction(path, body, okText) {
        try {
          setMsg('处理中…')
          const r = await api(path, {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}),
          })
          if (r.ok) {
            setMsg(okText)
            load()
            // 衣橱那份（穿在哪套上）也要跟着刷，不然「（穿着）」标记不动
            api('/api/impressions')
          .then((d) => setKnownPeople((Array.isArray(d.people) ? d.people : []).filter((x) => Number(x.score) >= 11).slice(0, 12)))
          .catch(() => {})
        api('/api/awaken/wardrobe').then((w) => setWardrobe(w)).catch(() => {})
          }
          else setMsg('失败：' + (r.error || ''))
        } catch (e) { setMsg('失败：' + String(e.message ?? e)) }
      }

      function wearSuit(id) {
        const list = (wardrobe && wardrobe.wardrobe) || []
        const target = list.some((w) => w.id === id) ? id : (list[0] ? list[0].id : '')
        if (!target) { setMsg('衣橱是空的：先在下面「另存为新衣橱并换上」存一套'); return }
        suitAction('/api/awaken/wardrobe/wear', { id: target }, '换上了')
      }

      function saveCurrentSuit() {
        const list = (wardrobe && wardrobe.wardrobe) || []
        const target = pickId && pickId !== 'custom' ? pickId : ''
        if (!target) { setMsg('先在上面选一套衣橱里要覆盖的'); return }
        const nm = (list.find((w) => w.id === target) || {}).name || '未命名'
        suitAction('/api/awaken/wardrobe/save', { id: target, name: nm, slots: outfitDraft }, '存进衣橱了（身上这身没动）')
      }

      function saveAsNew() {
        const name = newName.trim()
        if (!name) { setMsg('先给新衣橱起个名字'); return }
        suitAction('/api/awaken/wardrobe/save', { name, slots: outfitDraft, wear: true }, '另存好了，也换上了')
        setNewName('')
      }

      function deleteSuit() {
        const list = (wardrobe && wardrobe.wardrobe) || []
        const target = pickId && pickId !== 'custom' ? pickId : ''
        if (!target) { setMsg('先选一套要删的'); return }
        const nm = (list.find((w) => w.id === target) || {}).name || target
        suitAction('/api/awaken/wardrobe/delete', { id: target }, '删掉了「' + nm + '」')
      }

      async function saveAll(extra) {
        try {
          setMsg('保存中…')
          const body = { stats: statDraft, outfit: outfitDraft, profile: { weight: Number(weightDraft) || undefined } }
          if (intimateDraft) {
            body.intimate = intimateDraft
            body.intimateUserId = intimateUser
            body.intimateBy = { ...(intimateMap || {}), [intimateUser]: intimateDraft }
          }
          const r = await api('/api/awaken/growth/save', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
          })
          if (r.ok) { setMsg('已保存 —— 下一条 QQ 消息就按这个身体状态来'); load() }
          else setMsg('保存失败：' + (r.error || ''))
        } catch (e) { setMsg('保存失败：' + String(e.message ?? e)) }
      }

      async function itemAction(action, name) {
        try {
          setMsg('处理中…')
          const r = await api('/api/awaken/growth/item', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, name }),
          })
          if (r.ok) { setMsg(action === 'add' ? '塞给她了' : action === 'use' ? '用掉了' : '丢掉了'); load() }
          else setMsg('操作失败：' + (r.error || ''))
        } catch (e) { setMsg('操作失败：' + String(e.message ?? e)) }
      }

      async function gift() {
        const name = itemName.trim()
        if (!name) { setMsg('先写个名字'); return }
        try {
          setMsg('塞给她…')
          const effect = {}
          for (const key of STAT_ORDER) {
            const v = Number(giftEffect[key])
            if (Number.isFinite(v) && v !== 0) effect[key] = v
          }
          const r = await api('/api/awaken/growth/item', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'add', name, qty: Math.max(1, Math.floor(Number(itemQty) || 1)), desc: itemDesc, type: 'gift', effect, feed: feedNow }),
          })
          if (r.ok) { setMsg(feedNow ? '喂她吃了：' + name : '塞进背包了：' + name); setItemName(''); setItemQty('1'); setItemDesc(''); load() }
          else setMsg('失败：' + (r.error || ''))
        } catch (e) { setMsg('失败：' + String(e.message ?? e)) }
      }

      if (error) return h('div', { style: { color: '#b42318', fontSize: 12 } }, error)
      if (!data) return h('div', { style: awakenMuted }, '读取中…')
      const g = data.growth
      const life = data.life || {}
      const labels = data.labels || { stats: {}, outfit: {} }
      const moodPct = Math.max(0, Math.min(100, Number(life.mood ?? 60)))
      const items = g.items || []
      const suitList = (wardrobe && wardrobe.wardrobe) || []
      const outfitId = (wardrobe && wardrobe.outfitId) || g.outfitId || 'bunny'
      const isCustom = outfitId === 'custom'
      const currentOutfitName = isCustom ? '自由搭配' : (((suitList.find((w) => w.id === outfitId)) || {}).name || '默认')
      const outfitLabels = (labels.outfit) || {}

      return h('div', { style: { overflow: 'auto', maxHeight: '62vh', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          h('div', { style: { fontSize: 12, ...awakenMuted } }, '每 10 分钟自己走动一次；数值会随时间自然变化'),
          h('button', { type: 'button', onClick: () => setTick((n) => n + 1), style: awakenPill(false) }, '刷新'),
          h('button', { type: 'button', onClick: () => saveAll(), style: awakenPill(false) }, '保存修改'),
          msg ? h('div', { style: { fontSize: 12, color: '#2e9e5b' } }, msg) : null,
        ),

        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 12, ...awakenMuted } }, '心情'),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
            h('div', { style: { flex: 1, height: 8, borderRadius: 4, background: 'rgba(127,127,127,0.25)', overflow: 'hidden' } },
              h('div', { style: { width: moodPct + '%', height: '100%', background: moodPct >= 60 ? '#2e9e5b' : moodPct >= 40 ? '#b7791f' : '#b42318' } })),
            h('div', { style: { fontSize: 13, fontVariantNumeric: 'tabular-nums' } }, String(life.mood ?? 60)),
          ),
          h('div', { style: { fontSize: 13 } }, (life.moodWord || '') + (life.doing ? ' · ' + life.doing : '')),
          (life.plan || []).length
            ? h('div', { style: { fontSize: 12, ...awakenMuted, marginTop: 4 } }, '今日计划：' + (life.plan || []).join(' / '))
            : null,
        ),

        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 12, ...awakenMuted, marginBottom: 6 } }, '身体数值（可以直接改，保存后她下条消息就照这个状态）'),
          STAT_ORDER.map((key) => h('div', { key, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' } },
            h('div', { style: { width: 52, fontSize: 12 } }, labels.stats[key] || key),
            h('div', { style: { flex: 1 } }, h(StatBar, { label: '', value: (statDraft || g.stats)[key], color: STAT_COLORS[key] })),
            h('input', {
              type: 'number', min: 0, max: 100, step: 1,
              value: statDraft ? statDraft[key] : g.stats[key],
              onChange: (ev) => setStatDraft({ ...(statDraft || g.stats), [key]: Number(ev.target.value) }),
              style: { width: 58, fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' },
            }),
          )),
          h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 } },
            h('div', { style: { fontSize: 12 } }, '体重'),
            h('input', {
              type: 'number', min: 30, max: 90, step: 0.1, value: weightDraft,
              onChange: (ev) => setWeightDraft(ev.target.value),
              style: { width: 70, fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' },
            }),
            h('div', { style: { fontSize: 12, ...awakenMuted } }, 'kg · 体型 ' + (g.profile?.shape || '?')),
          ),
        ),

        h('div', { style: awakenCard },
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 } },
            h('div', { style: { fontSize: 12, ...awakenMuted } }, '私密栏属于：'),
            ...Object.keys(intimateMap || {}).map((qq) => h('button', {
              type: 'button', key: 'iu' + qq,
              onClick: () => switchIntimateUser(qq),
              style: awakenPill(qq === intimateUser),
            }, qq === '1000000002' ? '主人' : qq)),
            h('input', {
              type: 'text', placeholder: 'QQ 号', value: intimateQQInput,
              onChange: (ev) => setIntimateQQInput(ev.target.value),
              style: { width: 96, fontSize: 12, padding: '2px 4px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' },
            }),
            h('button', { type: 'button', onClick: () => { switchIntimateUser(intimateQQInput); setIntimateQQInput('') }, style: awakenPill(false) }, '切换/新建'),
            ...knownPeople.filter((x) => !(intimateMap || {})[x.qq]).map((x) => h('button', {
              type: 'button', key: 'ip' + x.qq,
              title: x.qq + ' · 好感 ' + x.score,
              onClick: () => switchIntimateUser(x.qq),
              style: { ...awakenPill(false), opacity: 0.8 },
            }, '+ ' + (x.nick || x.qq))),
          ),
          h('div', { style: { fontSize: 12, ...awakenMuted, marginBottom: 6 } }, '每个人一张表：选谁就改谁的（现在改的是 ' + (intimateUser === '1000000002' ? '主人' : intimateUser) + '）；空着显示 ？？'),
          INTIMATE_INPUT_ROW('💓 情绪状态', h('input', {
            type: 'text', placeholder: '结合剧情的一句话', value: (intimateDraft || {}).mood ?? '',
            onChange: (ev) => setIntimate({ mood: ev.target.value }),
            style: INTIMATE_INPUT,
          })),
          INTIMATE_INPUT_ROW('💋 淫荡值', h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 } },
            h('input', {
              type: 'number', min: 0, max: 100, step: 1, placeholder: '？？',
              value: (intimateDraft || {}).lewd ?? '',
              onChange: (ev) => setIntimate({ lewd: ev.target.value === '' ? null : Number(ev.target.value) }),
              style: { ...INTIMATE_INPUT, width: 70, flex: 'none' },
            }),
            h('div', { style: { fontSize: 12, ...awakenMuted } }, '%'),
          )),
          INTIMATE_INPUT_ROW('⚡ 大胆值', h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 } },
            h('input', {
              type: 'number', min: 0, max: 100, step: 1, placeholder: '？？',
              value: (intimateDraft || {}).bold ?? '',
              onChange: (ev) => setIntimate({ bold: ev.target.value === '' ? null : Number(ev.target.value) }),
              style: { ...INTIMATE_INPUT, width: 70, flex: 'none' },
            }),
            h('div', { style: { fontSize: 12, ...awakenMuted } }, '%'),
          )),
          // 本地补丁（兴奋度 2026-10-26）：调情累积的热度，淫荡/大胆涨多快看它；侧车每分钟 -0.6，在戏里每分钟 +0.25
          INTIMATE_INPUT_ROW('💗 兴奋度', (() => {
            const av = Math.max(0, Math.min(100, Number((statDraft || g.stats || {}).arousal ?? 0)))
            return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 } },
              h('div', { style: { flex: 1, height: 10, borderRadius: 5, background: 'rgba(120,120,140,0.25)', overflow: 'hidden' } },
                h('div', { style: { width: av + '%', height: '100%', background: 'linear-gradient(90deg,#ffd27a,#ff5f9e)' } }),
              ),
              h('input', {
                type: 'number', min: 0, max: 100, step: 1, value: av,
                onChange: (ev) => setStatDraft({ ...(statDraft || g.stats), arousal: Math.max(0, Math.min(100, Number(ev.target.value) || 0)) }),
                style: { ...INTIMATE_INPUT, width: 52, flex: 'none' },
              }),
              h('div', { style: { fontSize: 11, ...awakenMuted, whiteSpace: 'nowrap' } }, av >= 60 ? '热起来了' : av >= 30 ? '有点感觉' : '还凉着'),
            )
          })()),
          // 本地补丁（意志/高潮条 2026-10-25）：共用一个条，成反比；滑到 80 就过临界
          INTIMATE_INPUT_ROW('🩸 意志/高潮', (() => {
            const cv = Math.max(0, Math.min(100, Number((intimateDraft || {}).climax ?? 0)))
            return h('div', { style: { display: 'flex', alignItems: 'center', gap: 6, flex: 1 } },
              h('div', { style: { flex: 1, height: 10, borderRadius: 5, background: 'rgba(120,120,140,0.25)', overflow: 'hidden' } },
                h('div', { style: { width: cv + '%', height: '100%', background: 'linear-gradient(90deg,#7ad0ff,#ff5f9e)' } }),
              ),
              h('input', {
                type: 'number', min: 0, max: 100, step: 1, value: cv,
                onChange: (ev) => setIntimate({ climax: Math.max(0, Math.min(100, Number(ev.target.value) || 0)) }),
                style: { ...INTIMATE_INPUT, width: 52, flex: 'none' },
              }),
              h('div', { style: { fontSize: 11, ...awakenMuted, whiteSpace: 'nowrap' } }, '意志 ' + (100 - cv) + (cv >= 80 ? '｜临界' : '｜差 ' + (80 - cv))),
            )
          })()),
          // 本地补丁（放纵档 2026-10-26）：与插件 inbound.js 的 dirtyTierOf 同一套算法，只读展示
          INTIMATE_INPUT_ROW('🔥 放纵档', (() => {
            const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0))
            const it = intimateDraft || {}
            const score = 0.45 * clamp(it.lewd) + 0.35 * clamp(it.bold) + 0.20 * clamp(it.climax)
            const tiers = [
              [25, 'D0', '正常写法，别用脏词库'],
              [40, 'D1', '偶尔一个脏词点到为止（骚、黏、软）'],
              [55, 'D2', '每段至少一处触感或气味，说话可带一两个脏词'],
              [68, 'D3', '禁软词；每段至少触感＋气味/体液之一；重口当日常写'],
              [80, 'D4', '禁软词；每段触感＋气味＋体液；身体反应写具体（鼓起/流水/往里吸）；强度贴近范例'],
              [101, 'D5', '全开：最直白的词，四要素齐全，不许比范例干净'],
            ]
            const idx = tiers.findIndex((x) => score < x[0])
            const cur = idx < 0 ? tiers.length - 1 : idx
            return h('div', { style: { flex: 1 } },
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('div', { style: { fontSize: 13, fontWeight: 600, color: '#ff7a9c', whiteSpace: 'nowrap' } }, tiers[cur][1] + ' · ' + Math.round(score)),
                h('div', { style: { fontSize: 12, ...awakenMuted } }, '淫荡 45% + 大胆 35% + 高潮 20%'),
              ),
            )
          })()),
          (() => {
            const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0))
            const it = intimateDraft || {}
            const score = 0.45 * clamp(it.lewd) + 0.35 * clamp(it.bold) + 0.20 * clamp(it.climax)
            const tiers = [
              ['D0', '<25', '正常写法，不用脏词库'],
              ['D1', '25–40', '偶尔一个脏词点到为止（骚、黏、软）'],
              ['D2', '40–55', '每段至少一处触感或气味，说话带一两个脏词'],
              ['D3', '55–68', '禁软词；每段至少触感＋气味/体液之一；重口当日常写'],
              ['D4', '68–80', '禁软词；每段触感＋气味＋体液；身体反应写具体（鼓起/流水/自己往里吸）；强度贴近范例'],
              ['D5', '≥80', '全开：最直白的词，四要素齐全，不许比范例干净'],
            ]
            const bounds = [25, 40, 55, 68, 80, 101]
            const cur = Math.max(0, bounds.findIndex((b) => score < b))
            return h('div', { style: { margin: '2px 0 2px 68px', padding: '6px 8px', borderRadius: 6, background: 'rgba(127,127,127,0.08)' } },
              h('div', { style: { fontSize: 11, ...awakenMuted, marginBottom: 4 } }, '档位表（当前档高亮；分数 = 0.45×淫荡 + 0.35×大胆 + 0.20×高潮）'),
              ...tiers.map((t, i) => h('div', {
                key: t[0],
                style: {
                  display: 'flex', gap: 8, alignItems: 'baseline', padding: '2px 4px', borderRadius: 4,
                  background: i === cur ? 'rgba(255,122,156,0.16)' : 'transparent',
                  fontWeight: i === cur ? 600 : 400,
                },
              },
                h('div', { style: { width: 26, fontSize: 12, color: '#ff7a9c' } }, t[0]),
                h('div', { style: { width: 44, fontSize: 11, ...awakenMuted } }, t[1]),
                h('div', { style: { flex: 1, fontSize: 11, ...awakenMuted } }, t[2]),
                h('div', { style: { fontSize: 11, color: '#ff7a9c' } }, i === cur ? '← 当前' : ''),
              )),
            )
          })(),
          h('div', { style: { fontSize: 12, ...awakenMuted, margin: '8px 0 2px' } }, '💕 私处开发度'),
          INTIMATE_ZONE_ORDER.map((zone) => h('div', { key: zone, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' } },
            h('div', { style: { width: 58, fontSize: 12 } }, INTIMATE_ZONE_LABEL[zone].icon + ' ' + INTIMATE_ZONE_LABEL[zone].name),
            h('input', {
              type: 'number', min: 0, max: 100, step: 1,
              value: (intimateDraft?.zones || {})[zone]?.dev ?? 0,
              onChange: (ev) => setZone(zone, { dev: Number(ev.target.value) }),
              style: { ...INTIMATE_INPUT, width: 62, flex: 'none' },
            }),
            h('div', { style: { fontSize: 12, ...awakenMuted } }, '%'),
            h('input', {
              type: 'text', placeholder: '状态（未开发 / 微微发红…）',
              value: (intimateDraft?.zones || {})[zone]?.note ?? '',
              onChange: (ev) => setZone(zone, { note: ev.target.value }),
              style: INTIMATE_INPUT,
            }),
          )),
          INTIMATE_INPUT_ROW('🥥 腔内情况', h('input', {
            type: 'text', placeholder: '干净清爽，无精液残留', value: (intimateDraft || {}).cavity ?? '',
            onChange: (ev) => setIntimate({ cavity: ev.target.value }),
            style: INTIMATE_INPUT,
          })),
          INTIMATE_INPUT_ROW('🤍 内心想法', h('input', {
            type: 'text', placeholder: '她没说出口的那句', value: (intimateDraft || {}).inner ?? '',
            onChange: (ev) => setIntimate({ inner: ev.target.value }),
            style: INTIMATE_INPUT,
          })),
          h('div', { style: { fontSize: 11, ...awakenMuted, marginTop: 4 } },
            '淫荡值/大胆值留空就是「？？%」，代表还没定。改完点上面的「保存修改」。'),
        ),

        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 12, ...awakenMuted, marginBottom: 6 } },
            '衣橱 ' + suitList.length + ' 套 · 现在穿着「' + currentOutfitName + '」' + (isCustom ? '（自己搭的，不在衣橱里）' : '')),
          h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 } },
            h('select', {
              value: pickId, onChange: (ev) => setPickId(ev.target.value),
              style: { flex: '1 1 140px', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' },
            }, suitList.map((w) => h('option', { key: w.id, value: w.id }, w.name + (w.id === outfitId ? '（穿着）' : '')))),
            h('button', { type: 'button', onClick: () => wearSuit(pickId), style: awakenPill(false) }, '换上'),
          ),
          h('div', { style: { fontSize: 12, ...awakenMuted, margin: '4px 0 2px' } },
            '这十个格子 = 她现在身上穿的，随便改（改完上面点「保存修改」）。改过之后就不再属于衣橱里那一套，变成「自由搭配」。'),
          OUTFIT_ORDER.map((slot) => h('div', { key: slot, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' } },
            h('div', { style: { width: 52, fontSize: 12, opacity: 0.8 } }, outfitLabels[slot] || slot),
            h('input', {
              type: 'text',
              placeholder: '不穿就留空',
              value: (outfitDraft || g.outfit || {})[slot] ?? '',
              onChange: (ev) => setOutfitDraft({ ...(outfitDraft || g.outfit || {}), [slot]: ev.target.value }),
              style: { flex: 1, fontSize: 12, padding: '3px 6px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' },
            }),
          )),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' } },
            h('button', { type: 'button', onClick: saveCurrentSuit, style: awakenPill(true) }, '把这十个格子存进选中的那套'),
            h('input', {
              type: 'text', placeholder: '新衣橱名字（如：家居服）', value: newName, onChange: (ev) => setNewName(ev.target.value),
              style: { flex: '1 1 120px', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' },
            }),
            h('button', { type: 'button', onClick: saveAsNew, style: awakenPill(false) }, '另存为新衣橱并换上'),
            h('button', { type: 'button', onClick: deleteSuit, style: awakenPill(false) }, '删除选中的这套'),
          ),
          h('div', { style: { fontSize: 11, ...awakenMuted, marginTop: 4 } },
            wardrobe
              ? '衣橱和身上是分开的：点「换上」= 整套立刻换过去；格子里改动 = 只改身上，不进衣橱。格子清空（或填「无」）就是这件不穿。'
              : '衣橱接口还没挂上（宿主还是重启前那份代码），现在只能看不能改——完全退出 DSH Desktop 再打开就好。'),
        ),

        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 12, ...awakenMuted, marginBottom: 6 } }, '随身物品（' + items.length + ' 种）'),
          items.length === 0
            ? h('div', { style: { fontSize: 12, ...awakenMuted } }, '（身上啥也没有；她每天会自己捡到一点小东西）')
            : items.map((it) => h('div', { key: it.name, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', borderTop: '1px solid rgba(127,127,127,0.12)' } },
              h('div', { style: { flex: 1 } },
                h('div', { style: { fontSize: 13 } }, String(it.name) + ((it.qty ?? 1) > 1 ? ' ×' + it.qty : '')),
                h('div', { style: awakenMuted }, [it.desc, it.from ? '来自' + it.from : '', it.type === 'food' ? '能吃' : '',
                  Object.keys(it.effect || {}).length
                    ? '效果 ' + Object.entries(it.effect).map(([k, v]) => (labels.stats[k] || k) + (Number(v) > 0 ? '+' : '') + v).join(' ')
                    : '没有数值效果'].filter(Boolean).join(' · ')),
              ),
              h('button', { type: 'button', onClick: () => itemAction('use', it.name), style: Object.assign({}, awakenPill(false), Object.keys(it.effect || {}).length ? {} : { opacity: 0.45 }) }, '用掉'),
              h('button', { type: 'button', onClick: () => itemAction('remove', it.name), style: awakenPill(false) }, '丢掉'),
            )),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' } },
            h('input', { type: 'text', placeholder: '塞给她什么', value: itemName, onChange: (ev) => setItemName(ev.target.value), style: { flex: '1 1 120px', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' } }),
            h('input', { type: 'number', min: 1, max: 99, value: itemQty, onChange: (ev) => setItemQty(ev.target.value), style: { width: 56, fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' } }),
            h('input', { type: 'text', placeholder: '备注（可选）', value: itemDesc, onChange: (ev) => setItemDesc(ev.target.value), style: { flex: '1 1 100px', fontSize: 12, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' } }),
          ),
          h('div', { style: { display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' } },
            h('div', { style: { fontSize: 12, ...awakenMuted } }, '吃下去会'),
            STAT_ORDER.map((key) => h('div', { key, style: { display: 'flex', alignItems: 'center', gap: 2 } },
              h('div', { style: { fontSize: 11, opacity: 0.75 } }, (labels.stats[key] || key).slice(0, 2)),
              h('input', {
                type: 'number', min: -100, max: 100, step: 1, value: giftEffect[key],
                onChange: (ev) => setGiftEffect({ ...giftEffect, [key]: ev.target.value }),
                style: { width: 46, fontSize: 12, padding: '2px 3px', borderRadius: 4, border: '1px solid rgba(127,127,127,0.35)', background: 'transparent' },
              }))),
            h('label', { style: { display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 } },
              h('input', { type: 'checkbox', checked: feedNow, onChange: (ev) => setFeedNow(ev.target.checked) }, null),
              '直接喂（不进背包）'),
            h('button', { type: 'button', onClick: gift, style: awakenPill(true) }, feedNow ? '喂给她' : '塞给她'),
          ),
        ),

        h('div', { style: awakenCard },
          h('div', { style: { fontSize: 12, ...awakenMuted } }, '最近遇到的事'),
          (life.events || []).length === 0
            ? h('div', { style: { fontSize: 12, ...awakenMuted } }, '（还没有）')
            : (life.events || []).map((ev2, i) => h('div', { key: i, style: awakenRow },
              h('div', { style: { fontSize: 13 } }, String(ev2.text ?? ev2)),
              h('div', { style: awakenMuted }, new Date(Number(ev2.t ?? 0)).toLocaleString('zh-CN', { hour12: false })),
            )),
        ),
      )
    }

    function AwakenPanel() {
      const [view, setView] = useState('overview')
      const views = [
        ['overview', '总览'],
        ['hormones', '激素'],
        ['growth', '养成'],
        ['world', '世界书'],
        ['impress', '印象'],
        ['kinks', '性癖'],
        ['diary', '日记'],
        ['usage', '用量'],
        ['relations', '关系网'],
        ['recap', '群日报'],
        ['security', '安全'],
      ]
      const body = view === 'overview' ? h(AwakenOverview, { onOpen: setView })
        : view === 'hormones' ? h(AwakenHormones)
          : view === 'growth' ? h(AwakenGrowth)
            : view === 'world' ? h(AwakenWorld)
              : view === 'impress' ? h(AwakenImpress)
                : view === 'kinks' ? h(AwakenKinks)
                  : view === 'diary' ? h(AwakenDiary)
                    : view === 'usage' ? h(AwakenUsage)
                    : view === 'relations' ? h(AwakenRelations)
                      : view === 'recap' ? h(AwakenRecap)
                        : h(AwakenSecurity)
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10, height: '100%', minHeight: 0, padding: '10px 12px', boxSizing: 'border-box', overflow: 'hidden' } },
        h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 } },
          h('div', { style: { fontSize: 15, fontWeight: 650 } }, '麦芽汁觉醒计划'),
          h('div', { style: { fontSize: 11, opacity: 0.55 } }, '激素 · 养成 · 世界书 · 印象 · 日记 · 关系网 · 安全'),
        ),
        h('div', { style: awakenTabBar }, views.map(([key, label]) => h('button', {
          key, type: 'button', onClick: () => setView(key), style: awakenPill(view === key),
        }, label))),
        h('div', { style: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' } }, body),
      )
    }

    function apply(ctx) {
      // 正确用法（照 dshmarket）：ctx.slots.inject(name, () => ctx.slots.register({...}, Component))
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'impressions', order: 31, label: '群友印象' },
        () => h(Panel),
      ))
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'prompts', order: 32, label: '提示词' },
        () => h(PromptsPanel),
      ))
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        { name: 'settings.section', id: 'worldbook', order: 33, label: '世界书' },
        () => h(WorldbookPanel),
      ))

      // 觉醒计划：注册右侧栏 tab 类型与正文。
      // 用 ctx.inject 增量注入右侧栏服务：服务不在时不拖累设置页那三块；
      // 服务就绪后（desktop 的右栏插件）再注册 tab。
      if (typeof ctx.inject === 'function') {
        ctx.inject(['sidebarRightTabs'], (ctx) => {
          ctx.effect(() => ctx.sidebarRightTabs.register({
            id: AWAKEN_ID,
            kind: 'malts-awaken',
            priority: 'extension',
            title: () => '麦芽汁觉醒计划',
            guide: [{
              id: 'awaken',
              order: 20,
              title: () => '麦芽汁',
              description: () => '激素 · 养成 · 世界书 · 印象 · 日记 · 关系网',
            }],
          }), 'awaken: tab type')
          ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
            { name: 'sidebar.right.pane.tab', key: AWAKEN_ID },
            () => h(AwakenPanel),
          )), 'awaken: tab body')
        })
      } else {
        // 老运行时：手动拿服务
        const tabs = ctx.sidebarRightTabs ?? (typeof ctx.get === 'function' ? ctx.get('sidebarRightTabs') : undefined)
        if (tabs && typeof tabs.register === 'function') {
          const dispose = tabs.register({
            id: AWAKEN_ID,
            kind: 'malts-awaken',
            priority: 'extension',
            title: () => '麦芽汁觉醒计划',
            guide: [{ id: 'awaken', order: 20, title: () => '麦芽汁', description: () => '激素 · 世界书 · 印象 · 日记 · 关系网' }],
          })
          if (typeof ctx.effect === 'function' && typeof dispose === 'function') ctx.effect(() => dispose)
          ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
            { name: 'sidebar.right.pane.tab', key: AWAKEN_ID },
            () => h(AwakenPanel),
          ))
        }
      }
    }

    return { name: 'dsh-impressions', inject: ['slots'], apply }
  },
})
