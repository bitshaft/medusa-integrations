import { clx, Text, Tooltip } from "@medusajs/ui"
import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

/**
 * Text fields where `{{variables}}` show as chips with a readable name
 * ("Store name" instead of `{{store_name}}`). The value stays plain text
 * with `{{name}}` placeholders, exactly what the server stores and checks.
 *
 * - Chips are atomic: Backspace removes a whole chip, a click selects it,
 *   its × removes it.
 * - Typing `{{name}}` by hand turns into a chip.
 * - The palette (`VariablePalette`) inserts a chip where the caret was in the
 *   field last focused.
 */

const VARIABLE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g
const HAS_VARIABLE = /\{\{\s*[a-zA-Z0-9_.]+\s*\}\}/

type Segment = { text: string } | { variable: string }

export function parseSegments(value: string): Segment[] {
  const segments: Segment[] = []
  let last = 0
  for (const match of value.matchAll(VARIABLE)) {
    if (match.index > last) segments.push({ text: value.slice(last, match.index) })
    segments.push({ variable: match[1] })
    last = match.index + match[0].length
  }
  if (last < value.length) segments.push({ text: value.slice(last) })
  return segments
}

/** Human name of a variable, from the translations, else the raw name. */
export function useVariableLabel() {
  const { t } = useTranslation()
  return useCallback((name: string) => t(`emails.variables.${name}`, { defaultValue: name.replace(/_/g, " ") }), [t])
}

const CHIP_CLASS =
  "mx-0.5 inline-flex select-none items-center gap-x-0.5 rounded-md border px-1.5 align-baseline txt-compact-xsmall-plus cursor-pointer"
const CHIP_OK = "border-ui-border-base bg-ui-bg-component text-ui-fg-base hover:bg-ui-bg-component-hover"
const CHIP_UNKNOWN = "border-ui-tag-red-border bg-ui-tag-red-bg text-ui-tag-red-text"

function chipNode(name: string, label: string, known: boolean, removeLabel: string): HTMLSpanElement {
  const chip = document.createElement("span")
  chip.contentEditable = "false"
  chip.dataset.variable = name
  chip.className = `${CHIP_CLASS} ${known ? CHIP_OK : CHIP_UNKNOWN}`
  chip.title = `{{${name}}}`
  const text = document.createElement("span")
  text.textContent = label
  const remove = document.createElement("span")
  remove.dataset.remove = "true"
  remove.textContent = "×"
  remove.setAttribute("aria-label", removeLabel)
  remove.className = "ml-0.5 text-ui-fg-muted hover:text-ui-fg-base"
  chip.append(text, remove)
  return chip
}

/** The DOM of the field back to text with `{{name}}` placeholders. */
function serialize(root: HTMLElement): string {
  let out = ""
  const walk = (node: Node, isFirstBlock: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += (node.textContent ?? "").replace(/ /g, " ")
      return
    }
    if (!(node instanceof HTMLElement)) return
    if (node.dataset.variable) {
      out += `{{${node.dataset.variable}}}`
      return
    }
    if (node.tagName === "BR") {
      out += "\n"
      return
    }
    // Browsers wrap new lines in <div> or <p> when Enter is pressed.
    const block = node !== root && (node.tagName === "DIV" || node.tagName === "P")
    if (block && !isFirstBlock && !out.endsWith("\n")) out += "\n"
    node.childNodes.forEach((child, index) => walk(child, index === 0))
  }
  root.childNodes.forEach((child, index) => walk(child, index === 0))
  return out.replace(/\n$/, "")
}

type Handle = { insert: (name: string) => void }
type Registry = { active: { current: Handle | null } }

const VariablesContext = createContext<Registry | null>(null)

/** Wrap a form so its palette knows which field to insert into. */
export const VariablesProvider = ({ children }: { children: ReactNode }) => {
  const active = useRef<Handle | null>(null)
  return <VariablesContext.Provider value={{ active }}>{children}</VariablesContext.Provider>
}

type Props = {
  id?: string
  value: string
  onChange: (value: string) => void
  /** Variables the text may use; `null` allows any. Others show in red. */
  variables: string[] | null
  multiline?: boolean
  placeholder?: string
  "aria-invalid"?: boolean
}

export const VariableInput = ({ id, value, onChange, variables, multiline = false, placeholder, ...rest }: Props) => {
  const { t } = useTranslation()
  const label = useVariableLabel()
  const ref = useRef<HTMLDivElement>(null)
  const lastValue = useRef<string | null>(null)
  const savedRange = useRef<Range | null>(null)
  const registry = useContext(VariablesContext)

  const known = useCallback((name: string) => variables === null || variables.includes(name), [variables])

  const render = useCallback(
    (text: string) => {
      const root = ref.current
      if (!root) return
      root.replaceChildren()
      for (const segment of parseSegments(text)) {
        if ("variable" in segment) {
          root.append(
            chipNode(segment.variable, label(segment.variable), known(segment.variable), t("emails.variables.remove"))
          )
          continue
        }
        const lines = segment.text.split("\n")
        lines.forEach((line, index) => {
          if (index > 0) root.append(document.createElement("br"))
          if (line) root.append(document.createTextNode(line))
        })
      }
      // A trailing <br> is not shown by browsers unless something follows it.
      if (text.endsWith("\n")) root.append(document.createElement("br"))
      lastValue.current = text
    },
    [known, label, t]
  )

  // Rebuild only when the value changed from outside (load, restore, discard), not while typing.
  useLayoutEffect(() => {
    if (value !== lastValue.current) render(value)
  }, [value, render])

  // Labels and colours follow the language and the allowed list.
  useEffect(() => {
    if (lastValue.current !== null) render(lastValue.current)
  }, [render])

  const caretToEnd = () => {
    const root = ref.current
    if (!root) return
    const range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(false)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }

  const commit = () => {
    const root = ref.current
    if (!root) return
    const text = serialize(root)
    lastValue.current = text
    // Placeholders typed by hand become chips.
    if (
      Array.from(root.childNodes).some(
        (node) => node.nodeType === Node.TEXT_NODE && HAS_VARIABLE.test(node.textContent ?? "")
      )
    ) {
      render(text)
      caretToEnd()
    }
    if (!multiline && text.includes("\n")) {
      const single = text.replace(/\n+/g, " ")
      render(single)
      caretToEnd()
      onChange(single)
      return
    }
    onChange(text)
  }

  const remember = () => {
    const selection = window.getSelection()
    if (selection?.rangeCount && ref.current?.contains(selection.anchorNode)) {
      savedRange.current = selection.getRangeAt(0).cloneRange()
    }
  }

  const insert = (name: string) => {
    const root = ref.current
    if (!root) return
    root.focus()
    const range = savedRange.current && root.contains(savedRange.current.startContainer) ? savedRange.current : null
    const chip = chipNode(name, label(name), known(name), t("emails.variables.remove"))
    if (range) {
      range.deleteContents()
      range.insertNode(chip)
    } else {
      root.append(chip)
    }
    // The caret goes after the chip, with a space so typing continues naturally.
    const space = document.createTextNode(" ")
    chip.after(space)
    const after = document.createRange()
    after.setStartAfter(space)
    after.collapse(true)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(after)
    savedRange.current = after.cloneRange()
    commit()
  }

  // The palette calls the latest `insert`, which sees the current props.
  const handle = useRef<Handle>({ insert })
  handle.current.insert = insert

  return (
    <div
      ref={ref}
      id={id}
      role="textbox"
      aria-multiline={multiline}
      aria-invalid={rest["aria-invalid"]}
      aria-placeholder={placeholder}
      data-placeholder={placeholder}
      contentEditable
      suppressContentEditableWarning
      spellCheck
      className={clx(
        "bg-ui-bg-field shadow-borders-base txt-compact-small text-ui-fg-base w-full rounded-md px-2 py-1.5 outline-none",
        "focus-visible:shadow-borders-interactive-with-active hover:bg-ui-bg-field-hover transition-fg",
        "empty:before:pointer-events-none empty:before:text-ui-fg-muted empty:before:content-[attr(data-placeholder)]",
        "break-words",
        multiline
          ? "min-h-[120px] whitespace-pre-wrap leading-6"
          : "min-h-8 whitespace-nowrap overflow-x-auto leading-5",
        rest["aria-invalid"] && "shadow-borders-error"
      )}
      onFocus={() => {
        if (registry) registry.active.current = handle.current
      }}
      onInput={commit}
      onKeyUp={remember}
      onMouseUp={remember}
      onBlur={remember}
      onKeyDown={(event) => {
        if (!multiline && event.key === "Enter") event.preventDefault()
      }}
      onPaste={(event) => {
        // Plain text only: formatting from elsewhere would not survive in an email anyway.
        event.preventDefault()
        const text = event.clipboardData.getData("text/plain")
        document.execCommand("insertText", false, multiline ? text : text.replace(/\s*\n\s*/g, " "))
      }}
      onClick={(event) => {
        const target = event.target as HTMLElement
        const chip = target.closest<HTMLElement>("[data-variable]")
        if (!chip) return
        if (target.dataset.remove) {
          chip.remove()
          commit()
          return
        }
        // Select the chip, so Backspace or typing replaces it.
        const range = document.createRange()
        range.selectNode(chip)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        savedRange.current = range.cloneRange()
      }}
    />
  )
}

/** Clickable chips of the variables a text may use; a click inserts one into the field last focused. */
export const VariablePalette = ({ variables }: { variables: string[] }) => {
  const { t } = useTranslation()
  const label = useVariableLabel()
  const registry = useContext(VariablesContext)
  return (
    <div className="flex flex-col gap-y-2">
      <div className="flex flex-wrap gap-1.5">
        {variables.map((name) => (
          <Tooltip key={name} content={<span className="font-mono">{`{{${name}}}`}</span>}>
            <button
              type="button"
              // Keep the caret in the field: the click must not take the focus away first.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => registry?.active.current?.insert(name)}
              className={clx(CHIP_CLASS, CHIP_OK, "mx-0 py-0.5")}
            >
              {label(name)}
            </button>
          </Tooltip>
        ))}
      </div>
      <Text size="xsmall" className="text-ui-fg-subtle">
        {t("emails.variables.paletteHint")}
      </Text>
    </div>
  )
}

/** Read-only text with its variables as chips (lists, previews of the saved text). */
export const VariableText = ({ value, variables = null }: { value: string; variables?: string[] | null }) => {
  const label = useVariableLabel()
  return (
    <span className="whitespace-pre-wrap">
      {parseSegments(value).map((segment, index) =>
        "variable" in segment ? (
          <span
            key={index}
            title={`{{${segment.variable}}}`}
            className={clx(
              CHIP_CLASS,
              "cursor-default",
              variables === null || variables.includes(segment.variable) ? CHIP_OK : CHIP_UNKNOWN
            )}
          >
            {label(segment.variable)}
          </span>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  )
}
