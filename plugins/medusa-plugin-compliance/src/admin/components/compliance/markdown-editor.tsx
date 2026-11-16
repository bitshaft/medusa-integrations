import { Button, Label, Text, Textarea } from "@medusajs/ui"
import { type ReactNode, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

/**
 * A text field for safety warnings with a small toolbar (bold, italic,
 * heading, list) and a preview. The text is stored as simple Markdown; the
 * Store API returns safe HTML made from it.
 */
export const MarkdownEditor = ({
  label,
  badge,
  value,
  onChange,
  placeholder,
}: {
  label: string
  /** Shown next to the label, e.g. "required". */
  badge?: ReactNode
  value: string
  onChange: (value: string) => void
  /** Shown while empty, e.g. the text the store falls back to. */
  placeholder?: string
}) => {
  const { t } = useTranslation()
  const ref = useRef<HTMLTextAreaElement>(null)
  const [preview, setPreview] = useState(false)

  const wrap = (before: string, after = before) => {
    const el = ref.current
    if (!el) return
    const { selectionStart: start, selectionEnd: end } = el
    const selected = value.slice(start, end) || t("compliance.editor.text")
    onChange(value.slice(0, start) + before + selected + after + value.slice(end))
  }
  const prefixLines = (prefix: string) => {
    const el = ref.current
    if (!el) return
    const start = value.lastIndexOf("\n", el.selectionStart - 1) + 1
    const end = el.selectionEnd
    const block = value.slice(start, end) || t("compliance.editor.text")
    onChange(
      value.slice(0, start) +
        block
          .split("\n")
          .map((line) => `${prefix}${line}`)
          .join("\n") +
        value.slice(end)
    )
  }

  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-x-2">
          <Label size="xsmall" weight="plus">
            {label}
          </Label>
          {badge}
        </div>
        <div className="flex gap-x-1">
          <Button size="small" variant="transparent" type="button" onClick={() => wrap("**")} disabled={preview}>
            <strong>B</strong>
          </Button>
          <Button size="small" variant="transparent" type="button" onClick={() => wrap("*")} disabled={preview}>
            <em>I</em>
          </Button>
          <Button
            size="small"
            variant="transparent"
            type="button"
            onClick={() => prefixLines("## ")}
            disabled={preview}
          >
            H
          </Button>
          <Button size="small" variant="transparent" type="button" onClick={() => prefixLines("- ")} disabled={preview}>
            • {t("compliance.editor.list")}
          </Button>
          <Button size="small" variant="secondary" type="button" onClick={() => setPreview((p) => !p)}>
            {preview ? t("compliance.editor.edit") : t("compliance.editor.preview")}
          </Button>
        </div>
      </div>
      {preview ? (
        <div className="min-h-[96px] rounded-md border border-ui-border-base bg-ui-bg-subtle px-3 py-2 text-ui-fg-base [&_h3]:font-medium [&_h4]:font-medium [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-5">
          <MarkdownPreview source={value} />
        </div>
      ) : (
        <Textarea
          ref={ref}
          aria-label={label}
          rows={5}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <Text size="xsmall" className="text-ui-fg-muted">
        {t("compliance.editor.hint")}
      </Text>
    </div>
  )
}

/** Same subset as the server renderer, rendered with React elements (no HTML strings). */
const MarkdownPreview = ({ source }: { source: string }) => {
  const blocks: JSX.Element[] = []
  let paragraph: string[] = []
  let list: { kind: "ul" | "ol"; items: string[] } | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    const lines = paragraph
    blocks.push(
      <p key={blocks.length}>
        {lines.map((line, i) => (
          <span key={i}>
            {i > 0 && <br />}
            <Inline text={line} />
          </span>
        ))}
      </p>
    )
    paragraph = []
  }
  const flushList = () => {
    if (!list) return
    const items = list.items.map((item, i) => (
      <li key={i}>
        <Inline text={item} />
      </li>
    ))
    blocks.push(list.kind === "ul" ? <ul key={blocks.length}>{items}</ul> : <ol key={blocks.length}>{items}</ol>)
    list = null
  }

  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd()
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    const item = /^\s*[-*]\s+(.+)$/.exec(line) ?? /^\s*\d+[.)]\s+(.+)$/.exec(line)
    const kind = /^\s*[-*]\s+/.test(line) ? "ul" : "ol"
    if (!line.trim()) {
      flushParagraph()
      flushList()
    } else if (heading) {
      flushParagraph()
      flushList()
      blocks.push(
        <h3 key={blocks.length}>
          <Inline text={heading[2]} />
        </h3>
      )
    } else if (item) {
      flushParagraph()
      if (list && list.kind !== kind) flushList()
      list ??= { kind, items: [] }
      list.items.push(item[1])
    } else {
      flushList()
      paragraph.push(line.trim())
    }
  }
  flushParagraph()
  flushList()
  return <>{blocks}</>
}

const Inline = ({ text }: { text: string }) => {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("*") && part.endsWith("*") && part.length > 2 ? (
          <em key={i}>{part.slice(1, -1)}</em>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}
