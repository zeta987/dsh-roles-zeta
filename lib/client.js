/*
 * dsh-roles-zeta — browser half.
 *
 * One settings section, "Role agents", over the host API in `lib/api.js`. The
 * page lists the roster, edits one role at a time, and offers the two
 * operations a role library needs beyond editing: removing a role and restoring
 * the shipped ones. Every write goes through the host, which owns the files and
 * the reload, and answers with the fresh state the page then renders.
 *
 * This file is served as-is by `@deepseek-ai/dsh-client-modules`, in the lazy
 * CommonJS factory shape the loader expects. It uses only `React` from the
 * platform seed table, so it needs no bundler and no `dsh.client.external`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-roles-zeta',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement

    const PREFIX = '/__dsh/roles-zeta'
    const STYLE_ID = 'dsh-roles-zeta-style'
    const NEW_ID = '__new__' // never a valid role id, so it cannot collide

    const STRINGS = {
      en: {
        title: 'Role agents',
        subtitle: 'Roles the delegate tool can start. Each role is one Markdown file; edits apply to new calls at once.',
        directory: 'Role directory',
        loading: 'Loading roles…',
        newRole: 'New role',
        restoreAll: 'Restore the shipped roles',
        restoreAllConfirm: 'Overwrite the shipped roles with the package copies? Roles you added stay untouched.',
        restoreOne: 'Restore this role',
        restoreOneConfirm: (id) => `Overwrite "${id}" with the package copy?`,
        deleteRole: 'Delete',
        deleteConfirm: (id, shipped) =>
          shipped
            ? `Remove "${id}"? A shipped role is disabled by a stub file and can be restored later.`
            : `Delete "${id}"? The file is removed from the role directory.`,
        save: 'Save',
        create: 'Create role',
        discard: 'Discard changes',
        shipped: 'shipped',
        custom: 'yours',
        modified: 'edited',
        disabledShipped: 'Disabled shipped roles',
        restore: 'Restore',
        fieldId: 'Role id',
        fieldIdHint: 'Lowercase letters, digits, and hyphens. Also the slash command.',
        fieldWhen: 'When to use',
        fieldWhenHint: 'One line. The model reads it as the menu entry for this role.',
        fieldRoute: 'Model route',
        fieldRouteHint: 'A model id or provider/model. Leave empty to inherit the caller\'s model.',
        fieldEffort: 'Reasoning effort',
        effortDefault: '(route default)',
        fieldTools: 'Tools',
        toolsInherit: 'Inherit every tool the caller has',
        toolsList: 'Only these tools',
        toolsNone: 'No tools are registered right now; the names are kept as typed.',
        toolsUnavailable: 'not registered here',
        fieldDelegation: 'May start further agents (keeps the delegation tools)',
        fieldPersona: 'Persona',
        fieldPersonaHint: 'The child agent\'s instructions. Replaces the deployment persona prefix for that child only.',
        command: 'Slash command',
        commandsOff: 'Slash commands are disabled in this profile.',
        saved: 'Saved.',
        created: 'Role created.',
        deleted: 'Role removed.',
        restored: 'Restored.',
        errorPrefix: 'Error: ',
        unsavedTitle: 'Unsaved changes',
        allowedRoutes: 'Allowed for subagents in this session',
        registeredRoutes: 'Registered',
        warnings: 'Warnings from the last load',
        selectPrompt: 'Select a role on the left, or create a new one.',
        untitledWhen: '',
      },
      zh: {
        title: '角色代理',
        subtitle: 'delegate 工具可以啟動的角色。每個角色是一個 Markdown 檔，修改後下一次呼叫立即生效。',
        directory: '角色目錄',
        loading: '正在讀取角色…',
        newRole: '新增角色',
        restoreAll: '恢復內建角色',
        restoreAllConfirm: '要用套件內的版本覆蓋內建角色嗎？你自己新增的角色不會受影響。',
        restoreOne: '恢復此角色',
        restoreOneConfirm: (id) => `要用套件內的版本覆蓋「${id}」嗎？`,
        deleteRole: '刪除',
        deleteConfirm: (id, shipped) =>
          shipped
            ? `要移除「${id}」嗎？內建角色會以停用檔停用，之後可以再恢復。`
            : `要刪除「${id}」嗎？檔案會從角色目錄移除。`,
        save: '儲存',
        create: '建立角色',
        discard: '放棄修改',
        shipped: '內建',
        custom: '自訂',
        modified: '已修改',
        disabledShipped: '已停用的內建角色',
        restore: '恢復',
        fieldId: '角色 id',
        fieldIdHint: '小寫字母、數字與連字號；同時也是斜線指令的名稱。',
        fieldWhen: '適用時機',
        fieldWhenHint: '一行文字，模型會把它當成這個角色的選單說明。',
        fieldRoute: '模型路由',
        fieldRouteHint: '模型 id 或 provider/model；留空則沿用呼叫者的模型。',
        fieldEffort: '推理強度',
        effortDefault: '（路由預設）',
        fieldTools: '可用工具',
        toolsInherit: '沿用呼叫者的全部工具',
        toolsList: '只允許這些工具',
        toolsNone: '目前沒有已註冊的工具，名稱會照原樣保留。',
        toolsUnavailable: '此處未註冊',
        fieldDelegation: '可以再派出子代理（保留委派工具）',
        fieldPersona: '角色指示',
        fieldPersonaHint: '子代理的人設與指示，只替換該子代理的 persona prefix。',
        command: '斜線指令',
        commandsOff: '這個 profile 已停用斜線指令。',
        saved: '已儲存。',
        created: '已建立角色。',
        deleted: '已移除角色。',
        restored: '已恢復。',
        errorPrefix: '錯誤：',
        unsavedTitle: '尚未儲存',
        allowedRoutes: '本 session 允許子代理使用',
        registeredRoutes: '已註冊',
        warnings: '上次載入的警告',
        selectPrompt: '從左側選擇角色，或新增一個。',
        untitledWhen: '',
      },
    }

    const CSS = `
.rz{display:flex;flex-direction:column;gap:16px;min-width:0;padding:2px 0 28px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.5;container-type:inline-size}
.rz *{box-sizing:border-box}
.rz_header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.rz_title{margin:0;font-size:20px;line-height:28px;font-weight:650}
.rz_subtitle{margin:3px 0 0;max-width:72ch;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.rz_path{margin-top:4px;color:var(--dsw-alias-label-tertiary);font-family:var(--dsw-font-mono);font-size:12px;overflow-wrap:anywhere}
.rz_message{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:13px;overflow-wrap:anywhere}
.rz_message[data-error="true"]{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger)}
.rz_layout{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:16px;align-items:start}
.rz_list{display:flex;flex-direction:column;gap:8px;min-width:0}
.rz_listTools{display:flex;gap:6px;flex-wrap:wrap}
.rz_rows{display:flex;flex-direction:column;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.rz_row{display:flex;flex-direction:column;gap:2px;width:100%;padding:9px 12px;border:0;border-bottom:1px solid var(--dsw-alias-border-l1);background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.rz_row:last-child{border-bottom:0}
.rz_row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.rz_row[aria-current="true"]{background:var(--dsw-alias-bg-layer-2)}
.rz_row:focus-visible,.rz_button:focus-visible,.rz_input:focus-visible,.rz_select:focus-visible,.rz_text:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}
.rz_rowHead{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0}
.rz_rowId{font-family:var(--dsw-font-mono);font-size:13px;font-weight:600;overflow-wrap:anywhere}
.rz_rowWhen{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rz_badge{display:inline-flex;align-items:center;min-height:18px;padding:0 7px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.rz_badge[data-kind="modified"]{color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary)}
.rz_badge[data-kind="custom"]{color:var(--dsw-alias-brand-primary)}
.rz_disabled{display:flex;flex-direction:column;gap:6px;padding:10px 12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px}
.rz_disabledTitle{color:var(--dsw-alias-label-tertiary);font-size:12px}
.rz_disabledRow{display:flex;align-items:center;justify-content:space-between;gap:8px}
.rz_editor{display:flex;flex-direction:column;gap:14px;min-width:0;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.rz_editorHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.rz_editorTitle{margin:0;font-size:16px;line-height:22px;font-weight:650;font-family:var(--dsw-font-mono);overflow-wrap:anywhere}
.rz_editorMeta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;color:var(--dsw-alias-label-tertiary);font-size:12px}
.rz_field{display:flex;flex-direction:column;gap:5px;min-width:0}
.rz_label{font-size:13px;font-weight:600}
.rz_hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px}
.rz_input,.rz_select,.rz_text{width:100%;min-height:34px;padding:6px 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px}
.rz_input[data-mono="true"],.rz_text{font-family:var(--dsw-font-mono)}
.rz_text{min-height:220px;resize:vertical;line-height:19px}
.rz_grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.rz_radio,.rz_check{display:flex;align-items:flex-start;gap:8px;min-width:0;padding:3px 0;cursor:pointer;font-size:13px}
.rz_radio input,.rz_check input{margin:3px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.rz_toolGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:2px 14px;padding:10px 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;max-height:260px;overflow:auto}
.rz_toolName{font-family:var(--dsw-font-mono);font-size:12px;overflow-wrap:anywhere}
.rz_muted{color:var(--dsw-alias-label-tertiary)}
.rz_actions{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;padding-top:4px;border-top:1px solid var(--dsw-alias-border-l1)}
.rz_actionsGroup{display:flex;gap:6px;flex-wrap:wrap}
.rz_button{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:5px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:18px;cursor:pointer;transition:background .16s ease,color .16s ease,border-color .16s ease,opacity .16s ease}
.rz_button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.rz_button:disabled{opacity:.5;cursor:default}
.rz_button[data-primary="true"]{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted)}
.rz_button[data-primary="true"]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}
.rz_button[data-danger="true"]{color:var(--dsw-alias-state-error-primary)}
.rz_empty{padding:32px 16px;color:var(--dsw-alias-label-tertiary);font-size:13px;text-align:center;border:1px dashed var(--dsw-alias-border-l2);border-radius:12px}
.rz_routes{display:flex;flex-direction:column;gap:2px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:17px}
.rz_routes code{font-family:var(--dsw-font-mono);color:var(--dsw-alias-label-secondary)}
.rz_warnings{margin:0;padding:8px 12px 8px 26px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:12px}
@container (max-width:720px){.rz_layout{grid-template-columns:1fr}.rz_rows{max-height:320px;overflow:auto}}
@media(max-width:760px){.rz_button{min-height:38px}}
@media(prefers-reduced-motion:reduce){.rz_button{transition:none}}
`

    function adoptStyles(doc) {
      if (!doc || typeof doc.getElementById !== 'function' || doc.getElementById(STYLE_ID)) return
      const style = doc.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      doc.head.appendChild(style)
    }

    /** Pick the dictionary for the active locale; anything not Chinese reads English. */
    function pickStrings(localeId) {
      return String(localeId || '').toLowerCase().startsWith('zh') ? STRINGS.zh : STRINGS.en
    }

    /** Subscribe to the locale runtime when it exists; otherwise stay English. */
    function useStrings(ctx) {
      const locale = ctx && ctx.locale
      const subscribe = React.useCallback(
        (listener) => (locale && typeof locale.subscribe === 'function' ? locale.subscribe(listener) : () => {}),
        [locale],
      )
      const getSnapshot = React.useCallback(
        () => (locale && typeof locale.getSnapshot === 'function' ? locale.getSnapshot().active : 'en'),
        [locale],
      )
      const active = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      return pickStrings(active)
    }

    async function api(path, body) {
      const init = body === undefined
        ? { method: 'GET', credentials: 'same-origin' }
        : {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }
      const response = await fetch(PREFIX + path, init)
      let payload
      try {
        payload = await response.json()
      } catch {
        throw new Error(`${response.status} ${response.statusText}`)
      }
      if (!response.ok || !payload || payload.ok !== true) {
        throw new Error((payload && payload.error) || `${response.status} ${response.statusText}`)
      }
      return payload
    }

    /** The editable shape of one role, from the host's view of it. */
    function draftFrom(role) {
      if (!role) {
        return { id: '', when: '', route: '', effort: '', allowMode: 'inherit', allow: [], delegation: false, persona: '' }
      }
      return {
        id: role.id,
        when: role.when,
        route: role.route || '',
        effort: role.effort || '',
        allowMode: Array.isArray(role.allow) ? 'list' : 'inherit',
        allow: Array.isArray(role.allow) ? role.allow.slice() : [],
        delegation: role.delegation === true,
        persona: role.persona,
      }
    }

    function sameDraft(a, b) {
      return JSON.stringify(a) === JSON.stringify(b)
    }

    /** The request body for one draft. */
    function roleFromDraft(draft) {
      return {
        id: draft.id.trim(),
        when: draft.when,
        route: draft.route.trim(),
        effort: draft.effort,
        allow: draft.allowMode === 'list' ? draft.allow : null,
        delegation: draft.allowMode === 'inherit' ? draft.delegation : false,
        persona: draft.persona,
      }
    }

    function Button({ children, onClick, disabled, primary, danger, title }) {
      return h('button', {
        type: 'button',
        className: 'rz_button',
        disabled,
        title,
        'data-primary': primary ? 'true' : undefined,
        'data-danger': danger ? 'true' : undefined,
        onClick,
      }, children)
    }

    function Badge({ kind, children }) {
      return h('span', { className: 'rz_badge', 'data-kind': kind }, children)
    }

    function Field({ label, hint, htmlFor, children }) {
      return h('div', { className: 'rz_field' },
        h('label', { className: 'rz_label', htmlFor }, label),
        children,
        hint ? h('div', { className: 'rz_hint' }, hint) : null)
    }

    function RoleRow({ role, t, current, onSelect }) {
      return h('button', {
        type: 'button',
        className: 'rz_row',
        'aria-current': current ? 'true' : undefined,
        onClick: () => onSelect(role.id),
      },
        h('div', { className: 'rz_rowHead' },
          h('span', { className: 'rz_rowId' }, role.id),
          role.shipped
            ? h(Badge, { kind: 'shipped' }, t.shipped)
            : h(Badge, { kind: 'custom' }, t.custom),
          role.shipped && !role.managed ? h(Badge, { kind: 'modified' }, t.modified) : null),
        h('div', { className: 'rz_rowWhen' }, role.when))
    }

    function createSettingsSection(ctx) {
      function RolesSettings() {
        const t = useStrings(ctx)
        const [view, setView] = React.useState({ status: 'loading', data: null })
        const [message, setMessage] = React.useState(null)
        const [busy, setBusy] = React.useState(null)
        const [selectedId, setSelectedId] = React.useState(null)
        const [draft, setDraft] = React.useState(null)

        const data = view.data
        const roles = data ? data.roles : []
        const selected = selectedId === NEW_ID ? null : roles.find((role) => role.id === selectedId) || null
        const original = React.useMemo(() => (selectedId === NEW_ID ? draftFrom(null) : draftFrom(selected)), [selectedId, selected])
        const dirty = draft !== null && !sameDraft(draft, original)
        const isNew = selectedId === NEW_ID

        const refresh = React.useCallback(async () => {
          try {
            const payload = await api('/state')
            setView({ status: 'ready', data: payload.state })
          } catch (error) {
            setView((current) => ({ status: 'error', data: current.data }))
            setMessage({ error: true, text: t.errorPrefix + error.message })
          }
        }, [])

        React.useEffect(() => {
          void refresh()
        }, [refresh])

        // Keep the draft aligned with what the host says whenever the selection
        // or the underlying role changes and nothing is being edited.
        React.useEffect(() => {
          if (selectedId === null) {
            setDraft(null)
            return
          }
          if (selectedId === NEW_ID) {
            setDraft((current) => current ?? draftFrom(null))
            return
          }
          if (selected === null) {
            setSelectedId(null)
            setDraft(null)
            return
          }
          setDraft(draftFrom(selected))
        }, [selectedId, selected])

        const select = (id) => {
          if (dirty && !window.confirm(`${t.unsavedTitle}: ${t.discard}?`)) return
          setMessage(null)
          setSelectedId(id)
          if (id === NEW_ID) setDraft(draftFrom(null))
        }

        const run = async (label, work, doneText) => {
          setBusy(label)
          setMessage(null)
          try {
            const payload = await work()
            setView({ status: 'ready', data: payload.state })
            if (doneText) setMessage({ error: false, text: doneText })
            return payload
          } catch (error) {
            setMessage({ error: true, text: t.errorPrefix + error.message })
            return undefined
          } finally {
            setBusy(null)
          }
        }

        const save = async () => {
          if (!draft) return
          const body = { role: roleFromDraft(draft), ...(isNew ? {} : { originalId: selected ? selected.id : draft.id }) }
          const payload = await run('save', () => api('/save', body), isNew ? t.created : t.saved)
          if (payload) setSelectedId(payload.id)
        }

        const remove = async () => {
          if (!selected) return
          if (!window.confirm(t.deleteConfirm(selected.id, selected.shipped))) return
          const payload = await run('delete', () => api('/delete', { id: selected.id }), t.deleted)
          if (payload) setSelectedId(null)
        }

        const restoreOne = async (id) => {
          if (dirty && !window.confirm(`${t.unsavedTitle}: ${t.discard}?`)) return
          if (!window.confirm(t.restoreOneConfirm(id))) return
          const payload = await run(`restore-${id}`, () => api('/restore', { id }), t.restored)
          if (payload) setSelectedId(id)
        }

        const restoreAll = async () => {
          if (dirty && !window.confirm(`${t.unsavedTitle}: ${t.discard}?`)) return
          if (!window.confirm(t.restoreAllConfirm)) return
          await run('restore-all', () => api('/restore', {}), t.restored)
        }

        const patch = (fields) => setDraft((current) => ({ ...current, ...fields }))
        const toggleTool = (name, checked) =>
          setDraft((current) => ({
            ...current,
            allow: checked
              ? [...new Set([...current.allow, name])]
              : current.allow.filter((entry) => entry !== name),
          }))

        const header = h('header', { className: 'rz_header' },
          h('div', null,
            h('h2', { className: 'rz_title' }, t.title),
            h('p', { className: 'rz_subtitle' }, t.subtitle),
            data ? h('div', { className: 'rz_path' }, `${t.directory}: ${data.rolesDir}`) : null))

        const messageRow = message
          ? h('div', { className: 'rz_message', 'data-error': String(message.error), role: message.error ? 'alert' : 'status', 'aria-live': 'polite' }, message.text)
          : null

        if (!data) {
          return h('section', { className: 'rz' }, header, messageRow,
            view.status === 'loading' ? h('div', { className: 'rz_message', role: 'status', 'aria-busy': 'true' }, t.loading) : null)
        }

        const tools = data.tools || []
        const knownTools = new Set(tools)
        const extraAllowed = draft ? draft.allow.filter((name) => !knownTools.has(name)) : []
        const routeOptions = [...new Set([...(data.routes.allowed || []), ...(data.routes.registered || [])])]

        const list = h('div', { className: 'rz_list' },
          h('div', { className: 'rz_listTools' },
            h(Button, { primary: true, disabled: busy !== null, onClick: () => select(NEW_ID) }, t.newRole),
            h(Button, { disabled: busy !== null, onClick: restoreAll }, t.restoreAll)),
          h('div', { className: 'rz_rows' },
            roles.map((role) => h(RoleRow, { key: role.id, role, t, current: role.id === selectedId, onSelect: select }))),
          data.disabledShipped.length > 0
            ? h('div', { className: 'rz_disabled' },
                h('div', { className: 'rz_disabledTitle' }, t.disabledShipped),
                data.disabledShipped.map((id) => h('div', { className: 'rz_disabledRow', key: id },
                  h('span', { className: 'rz_rowId' }, id),
                  h(Button, { disabled: busy !== null, onClick: () => restoreOne(id) }, t.restore))))
            : null,
          data.warnings && data.warnings.length > 0
            ? h('div', null,
                h('div', { className: 'rz_disabledTitle' }, t.warnings),
                h('ul', { className: 'rz_warnings' }, data.warnings.map((warning, index) => h('li', { key: index }, warning))))
            : null)

        let editor
        if (!draft) {
          editor = h('div', { className: 'rz_empty' }, t.selectPrompt)
        } else {
          const idField = `rz-id-${selectedId === NEW_ID ? 'new' : selectedId}`
          const commandName = data.commands.enabled
            ? `/${`${data.commands.prefix || ''}${draft.id.trim() || '…'}`.toLowerCase()}`
            : null
          editor = h('div', { className: 'rz_editor' },
            h('div', { className: 'rz_editorHead' },
              h('div', null,
                h('h3', { className: 'rz_editorTitle' }, isNew ? t.newRole : selected.id),
                h('div', { className: 'rz_editorMeta' },
                  !isNew && selected.shipped ? h(Badge, { kind: 'shipped' }, t.shipped) : null,
                  !isNew && !selected.shipped ? h(Badge, { kind: 'custom' }, t.custom) : null,
                  !isNew && selected.shipped && !selected.managed ? h(Badge, { kind: 'modified' }, t.modified) : null,
                  commandName
                    ? h('span', null, `${t.command}: `, h('code', null, commandName))
                    : h('span', null, t.commandsOff))),
              dirty ? h(Badge, { kind: 'modified' }, t.unsavedTitle) : null),

            h('div', { className: 'rz_grid2' },
              h(Field, { label: t.fieldId, hint: t.fieldIdHint, htmlFor: idField },
                h('input', { id: idField, className: 'rz_input', 'data-mono': 'true', value: draft.id, spellCheck: false, autoComplete: 'off',
                  onChange: (e) => patch({ id: e.target.value }) })),
              h(Field, { label: t.fieldWhen, hint: t.fieldWhenHint, htmlFor: `${idField}-when` },
                h('input', { id: `${idField}-when`, className: 'rz_input', value: draft.when, onChange: (e) => patch({ when: e.target.value }) }))),

            h('div', { className: 'rz_grid2' },
              h(Field, { label: t.fieldRoute, hint: t.fieldRouteHint, htmlFor: `${idField}-route` },
                h('input', { id: `${idField}-route`, className: 'rz_input', 'data-mono': 'true', list: `${idField}-routes`, value: draft.route, spellCheck: false, autoComplete: 'off',
                  onChange: (e) => patch({ route: e.target.value }) }),
                h('datalist', { id: `${idField}-routes` }, routeOptions.map((route) => h('option', { key: route, value: route }))),
                h('div', { className: 'rz_routes' },
                  data.routes.allowed
                    ? h('div', null, `${t.allowedRoutes}: `, data.routes.allowed.map((route, index) => h(React.Fragment, { key: route }, index > 0 ? ', ' : '', h('code', null, route))))
                    : null,
                  data.routes.registered.length > 0 && !data.routes.allowed
                    ? h('div', null, `${t.registeredRoutes}: `, data.routes.registered.map((route, index) => h(React.Fragment, { key: route }, index > 0 ? ', ' : '', h('code', null, route))))
                    : null)),
              h(Field, { label: t.fieldEffort, htmlFor: `${idField}-effort` },
                h('select', { id: `${idField}-effort`, className: 'rz_select', value: draft.effort, onChange: (e) => patch({ effort: e.target.value }) },
                  h('option', { value: '' }, t.effortDefault),
                  data.efforts.map((effort) => h('option', { key: effort, value: effort }, effort))))),

            h('div', { className: 'rz_field' },
              h('div', { className: 'rz_label' }, t.fieldTools),
              h('label', { className: 'rz_radio' },
                h('input', { type: 'radio', name: `${idField}-allow`, checked: draft.allowMode === 'inherit', onChange: () => patch({ allowMode: 'inherit' }) }),
                h('span', null, t.toolsInherit)),
              draft.allowMode === 'inherit'
                ? h('label', { className: 'rz_check', style: { paddingLeft: 24 } },
                    h('input', { type: 'checkbox', checked: draft.delegation, onChange: (e) => patch({ delegation: e.target.checked }) }),
                    h('span', null, t.fieldDelegation))
                : null,
              h('label', { className: 'rz_radio' },
                h('input', { type: 'radio', name: `${idField}-allow`, checked: draft.allowMode === 'list', onChange: () => patch({ allowMode: 'list' }) }),
                h('span', null, t.toolsList)),
              draft.allowMode === 'list'
                ? h('div', { className: 'rz_toolGrid' },
                    tools.length === 0 ? h('div', { className: 'rz_hint' }, t.toolsNone) : null,
                    tools.map((name) => h('label', { className: 'rz_check', key: name },
                      h('input', { type: 'checkbox', checked: draft.allow.includes(name), onChange: (e) => toggleTool(name, e.target.checked) }),
                      h('span', { className: 'rz_toolName' }, name))),
                    extraAllowed.map((name) => h('label', { className: 'rz_check', key: `extra-${name}` },
                      h('input', { type: 'checkbox', checked: true, onChange: (e) => toggleTool(name, e.target.checked) }),
                      h('span', { className: 'rz_toolName' }, name, ' ', h('span', { className: 'rz_muted' }, `(${t.toolsUnavailable})`)))))
                : null),

            h(Field, { label: t.fieldPersona, hint: t.fieldPersonaHint, htmlFor: `${idField}-persona` },
              h('textarea', { id: `${idField}-persona`, className: 'rz_text', value: draft.persona, spellCheck: false,
                onChange: (e) => patch({ persona: e.target.value }) })),

            h('div', { className: 'rz_actions' },
              h('div', { className: 'rz_actionsGroup' },
                h(Button, { primary: true, disabled: busy !== null || (!isNew && !dirty), onClick: save }, isNew ? t.create : t.save),
                dirty ? h(Button, { disabled: busy !== null, onClick: () => setDraft(original) }, t.discard) : null),
              h('div', { className: 'rz_actionsGroup' },
                !isNew && selected.shipped && !selected.managed
                  ? h(Button, { disabled: busy !== null, onClick: () => restoreOne(selected.id) }, t.restoreOne)
                  : null,
                !isNew ? h(Button, { danger: true, disabled: busy !== null, onClick: remove }, t.deleteRole) : null)))
        }

        return h('section', { className: 'rz', 'aria-labelledby': 'rz-title' },
          header,
          messageRow,
          h('div', { className: 'rz_layout' }, list, editor))
      }
      return RolesSettings
    }

    exports.inject = ['slots', 'locale']
    exports.apply = (ctx) => {
      adoptStyles(typeof document === 'undefined' ? undefined : document)
      const Section = createSettingsSection(ctx)
      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'roles-zeta',
        order: 55,
        label: () => pickStrings(ctx.locale && typeof ctx.locale.getSnapshot === 'function' ? ctx.locale.getSnapshot().active : 'en').title,
        inject: () => ({}),
      }, Section))
    }

    exports.pickStrings = pickStrings
    return module.exports
  },
})
