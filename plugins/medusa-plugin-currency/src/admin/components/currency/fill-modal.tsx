import { Button, FocusModal, Heading, Text } from "@medusajs/ui"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import type { FillScope } from "../../lib/currency/api"
import { DemoBar } from "./demo-bar"
import { FillPanel } from "./fill-panel"

/** A button that opens "Fill prices" for a scope (a product, a collection, a category) over Medusa's page. */
export const FillModalButton = ({
  scope,
  title,
  subtitle,
  label,
  demo,
  variant = "secondary",
}: {
  scope: FillScope
  title: string
  subtitle?: string
  label: ReactNode
  demo: boolean
  variant?: "primary" | "secondary"
}) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <FocusModal open={open} onOpenChange={setOpen}>
      <FocusModal.Trigger asChild>
        <Button size="small" variant={variant}>
          {label}
        </Button>
      </FocusModal.Trigger>
      <FocusModal.Content>
        <FocusModal.Header>
          <FocusModal.Title asChild>
            <Heading>{title}</Heading>
          </FocusModal.Title>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col items-center overflow-y-auto py-6">
          <div className="flex w-full max-w-6xl flex-col gap-y-3 px-4">
            {demo && <DemoBar />}
            {subtitle && (
              <Text size="small" className="text-ui-fg-subtle">
                {subtitle}
              </Text>
            )}
            <div className="shadow-elevation-card-rest bg-ui-bg-base rounded-lg">
              {open && <FillPanel scope={scope} onSaved={() => setOpen(false)} />}
            </div>
            <FocusModal.Description className="sr-only">{t("currency.fill.subtitle")}</FocusModal.Description>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
