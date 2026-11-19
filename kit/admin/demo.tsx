import { ArrowPath, ExclamationCircle } from "@medusajs/icons"
import { Button, Text, toast, usePrompt } from "@medusajs/ui"
import { type ReactNode, useState } from "react"

import { useKitText } from "./texts"

/**
 * Demo mode looks the same in every integration: this bar above the page
 * header (the title is shared, the hint says what the plugin's demo does),
 * and, where the demo has data to restore, `DemoResetButton` at the right
 * end of the tab row.
 */
export const DemoBar = ({ children }: { children?: ReactNode }) => {
  const k = useKitText()
  return (
    <div
      role="status"
      className="flex items-start gap-x-3 rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3"
    >
      <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-orange-icon" />
      <div className="min-w-0 flex-1">
        <Text size="small" weight="plus" className="text-ui-tag-orange-text">
          {k("demoTitle")}
        </Text>
        {children && (
          <Text size="xsmall" className="text-ui-tag-orange-text">
            {children}
          </Text>
        )}
      </div>
    </div>
  )
}

/**
 * "Restore test data", after a confirmation. `description` says what will be
 * replaced; `onReset` does it and may return a line for the success toast.
 */
export const DemoResetButton = ({
  description,
  onReset,
}: {
  description: string
  onReset: () => Promise<string | void>
}) => {
  const k = useKitText()
  const prompt = usePrompt()
  const [pending, setPending] = useState(false)
  const run = async () => {
    const confirmed = await prompt({
      title: k("demoResetTitle"),
      description,
      confirmText: k("demoReset"),
      cancelText: k("cancel"),
    })
    if (!confirmed) return
    setPending(true)
    try {
      const detail = await onReset()
      toast.success(k("demoRestored"), detail ? { description: detail } : undefined)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <Button size="small" variant="secondary" isLoading={pending} onClick={run}>
      <ArrowPath />
      {k("demoReset")}
    </Button>
  )
}
