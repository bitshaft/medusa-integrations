import { defineWidgetConfig } from "@medusajs/admin-sdk"
import type { AdminProductVariant, DetailWidgetProps } from "@medusajs/framework/types"
import { Plus, Trash } from "@medusajs/icons"
import { Button, Container, Heading, IconButton, Input, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { useErrorText } from "../components/negotiations/shared"
import { useFloors, useSaveFloors, useSettings } from "../lib/negotiations/api"
import { moneyInput, parseMoney } from "../lib/negotiations/format"

type Row = { currency_code: string; amount: string }

/**
 * The variant's minimum price for negotiations, per currency. Internal: it
 * never leaves through the Store API; a lower counter-offer or acceptance
 * shows a warning and needs a confirmation.
 */
const VariantFloorWidget = ({ data: variant }: DetailWidgetProps<AdminProductVariant>) => {
  const { t } = useTranslation()
  const settings = useSettings()
  const floors = useFloors(variant.id)
  const save = useSaveFloors(variant.id)
  const errorText = useErrorText()
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => {
    if (floors.data)
      setRows(
        floors.data.floors.map((f) => ({
          currency_code: f.currency_code,
          amount: moneyInput(f.amount, f.currency_code),
        }))
      )
  }, [floors.data])
  if (!settings.data?.enabled) return null

  const submit = () => {
    const parsed = rows
      .filter((r) => r.currency_code.trim() || r.amount.trim())
      .map((r) => ({
        currency_code: r.currency_code.trim().toLowerCase(),
        amount: parseMoney(r.amount, r.currency_code.trim() || "pln"),
      }))
    if (parsed.some((p) => p.currency_code.length !== 3 || p.amount === null))
      return toast.error(t("negotiations.floorWidget.invalid"))
    save.mutate(parsed as Array<{ currency_code: string; amount: number }>, {
      onSuccess: () => toast.success(t("negotiations.settings.saved")),
      onError: (e) => toast.error(errorText(e)),
    })
  }

  return (
    <Container className="flex flex-col gap-y-3 p-6">
      <div>
        <Heading level="h2">{t("negotiations.floorWidget.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("negotiations.floorWidget.hint")}
        </Text>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="grid grid-cols-[90px_1fr_auto] items-center gap-2">
          <Input
            size="small"
            placeholder="PLN"
            maxLength={3}
            value={row.currency_code.toUpperCase()}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, currency_code: e.target.value } : r)))}
          />
          <Input
            size="small"
            inputMode="decimal"
            placeholder="0,00"
            value={row.amount}
            onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))}
          />
          <IconButton size="small" variant="transparent" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
            <Trash />
          </IconButton>
        </div>
      ))}
      <div className="flex justify-between gap-2">
        <Button
          size="small"
          variant="secondary"
          onClick={() => setRows([...rows, { currency_code: "pln", amount: "" }])}
        >
          <Plus />
          {t("negotiations.floorWidget.add")}
        </Button>
        <Button size="small" onClick={submit} isLoading={save.isPending}>
          {t("negotiations.save")}
        </Button>
      </div>
    </Container>
  )
}

export const config = defineWidgetConfig({ zone: "product_variant.details.after" })

export default VariantFloorWidget
