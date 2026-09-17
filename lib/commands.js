/**
 * One slash command per role.
 *
 * Typing `/reviewer look at lib/index.js` in a dsh input box queues a follow-up
 * turn that asks the calling agent to delegate that task to the `reviewer` role
 * through the `delegate` tool. The command registry (`@deepseek-ai/dsh-commands`)
 * is a host service that every interactive surface lists from, so the roster
 * appears in the Web client's `/` menu without a browser module of its own.
 *
 * The command does not start the child itself. A command handler runs outside
 * any model turn, and a delegation whose result never reaches the model is a
 * result nobody reports on; queuing a turn keeps the tool call, the child's
 * output, and the relay in the ordinary transcript, where the built-in `/plan`
 * puts its message too.
 *
 * Registrations follow the live roster: a role added, renamed, or removed
 * re-registers the set, and the registry's own change event refreshes the menu.
 *
 * @module dsh-roles-zeta/commands
 */

import { createUserMessage } from '@deepseek-ai/dsh-llm'

/**
 * The turn text a role command queues.
 * @param role - the resolved role.
 * @param task - the text typed after the command name.
 * @param toolName - the delegation tool's registered name.
 * @returns the user-role message text.
 */
export function buildDelegationPrompt(role, task, toolName) {
  return [
    `/${role.id}: delegate the task below to the "${role.id}" role.`,
    '',
    `Call the \`${toolName}\` tool with role "${role.id}", passing the task as a self-contained prompt.`,
    'Run it in the foreground (run_in_background: false) unless the task itself asks for background work,',
    'then relay the result to the user, adding only a short summary of your own.',
    '',
    'Task:',
    task,
  ].join('\n')
}

/** Lowercase command name for one role, with the configured prefix. */
export function commandNameFor(role, prefix) {
  return `${prefix}${role.id}`.toLowerCase()
}

/**
 * Register the roster as slash commands and keep it registered as it changes.
 * @param ctx - a context whose `commands` service is present.
 * @param library - the live role library.
 * @param options - `toolName`, `prefix`, optional `logger`.
 * @returns a disposer that unregisters everything.
 */
export function installRoleCommands(ctx, library, { toolName, prefix = '', logger }) {
  let disposers = []

  const clear = () => {
    for (const dispose of disposers) {
      try {
        dispose()
      } catch {
        // A registration already torn down by the registry is fine.
      }
    }
    disposers = []
  }

  const sync = () => {
    clear()
    const registered = []
    const skipped = []
    for (const role of library.roles.values()) {
      const name = commandNameFor(role, prefix)
      try {
        disposers.push(
          ctx.commands.register({
            name,
            description: role.when,
            input: { hint: '<task>' },
            handler: ({ agent, rawInput }) => {
              const task = rawInput.trim()
              if (task === '') {
                return { kind: 'error', text: `Usage: /${name} <task> — delegates the task to the "${role.id}" role.` }
              }
              agent.followup(
                createUserMessage({
                  content: [{ type: 'text', text: buildDelegationPrompt(role, task, toolName) }],
                  source: { kind: 'user' },
                }),
              )
              return { kind: 'success', text: `Delegating to ${role.id}.` }
            },
          }),
        )
        registered.push(name)
      } catch (error) {
        // Most likely a name another plugin owns (`/plan`, `/goal`, ...); the
        // role still works through the tool, it just has no shortcut.
        skipped.push(`${name} (${error?.message ?? error})`)
      }
    }
    logger?.info?.(
      `roles-zeta: ${registered.length} slash command(s) registered` +
        (skipped.length === 0 ? '' : `; skipped: ${skipped.join(', ')}`),
    )
  }

  sync()
  const unsubscribe = library.onChange(sync)
  return () => {
    unsubscribe()
    clear()
  }
}
