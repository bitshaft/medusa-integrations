/**
 * A small, safe Markdown subset for safety warnings: paragraphs, line
 * breaks, `**bold**`, `*italic*`, `#`/`##`/`###` headings and `-` or `1.`
 * lists. Everything is HTML-escaped first, so the output contains only the
 * tags this function writes; no links, images or raw HTML.
 */
export function renderMarkdown(source: string | null | undefined): string {
  if (!source || !source.trim()) return ""
  const lines = escapeHtml(source.replace(/\r\n?/g, "\n")).split("\n")
  const html: string[] = []
  let list: "ul" | "ol" | null = null
  let paragraph: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) html.push(`<p>${paragraph.map(inline).join("<br>")}</p>`)
    paragraph = []
  }
  const closeList = () => {
    if (list) html.push(`</${list}>`)
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const heading = /^(#{1,3})\s+(.+)$/.exec(line)
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line)
    if (!line.trim()) {
      flushParagraph()
      closeList()
    } else if (heading) {
      flushParagraph()
      closeList()
      const level = heading[1].length + 2 // # → h3: the product page already has h1/h2
      html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
    } else if (bullet || numbered) {
      flushParagraph()
      const kind = bullet ? "ul" : "ol"
      if (list !== kind) {
        closeList()
        html.push(`<${kind}>`)
        list = kind
      }
      html.push(`<li>${inline((bullet ?? numbered)![1])}</li>`)
    } else {
      closeList()
      paragraph.push(line.trim())
    }
  }
  flushParagraph()
  closeList()
  return html.join("")
}

/** Plain text without Markdown marks, for places that cannot show HTML. */
export function markdownToText(source: string | null | undefined): string {
  if (!source) return ""
  return source
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/^#{1,3}\s+/, "")
        .replace(/^\s*[-*]\s+/, "• ")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
    )
    .join("\n")
    .trim()
}

function inline(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>")
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
