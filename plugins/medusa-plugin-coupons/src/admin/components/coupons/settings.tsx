import { Button, Container, Heading, Input, Label, Select, Text, toast } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { type Settings as SettingsValues, type SettingsResponse, useSaveSettings } from "../../lib/coupons/api"
import { errorMessage } from "../../lib/coupons/kit/format"

/** "Settings" tab: what the plugin runs with, and the few things the owner can change. */
export const Settings = ({ status }: { status: Extract<SettingsResponse, { enabled: true }> }) => {
  const { t } = useTranslation()
  const save = useSaveSettings()
  const [form, setForm] = useState<SettingsValues>(status.settings)
  useEffect(() => setForm(status.settings), [status.settings])

  // Only changed values are stored; the rest keep following the plugin options.
  const changes = Object.fromEntries(
    (Object.keys(form) as Array<keyof SettingsValues>)
      .filter((key) => form[key] !== status.defaults[key])
      .map((key) => [key, form[key]])
  ) as Partial<SettingsValues>

  const onSave = (body: Partial<SettingsValues>) =>
    save.mutate(body, {
      onSuccess: () => toast.success(t("coupons.settings.saved")),
      onError: (error) => toast.error(t("coupons.settings.saveFailed", { error: errorMessage(error) })),
    })

  const option = (key: string, value: string | number) => (
    <div key={key} className="flex flex-col">
      <Text size="xsmall" className="text-ui-fg-subtle">
        {t(`coupons.settings.options.${key}`)}
      </Text>
      <Text size="small" weight="plus">
        {value}
      </Text>
    </div>
  )

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="flex flex-col gap-y-4 px-6 py-6">
        <div>
          <Heading level="h2">{t("coupons.settings.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("coupons.settings.subtitle")}
          </Text>
        </div>
        <div className="grid max-w-xl grid-cols-1 gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus" htmlFor="currency">
              {t("coupons.settings.currency")}
            </Label>
            <Input
              id="currency"
              size="small"
              maxLength={3}
              className="uppercase"
              value={form.currencyCode}
              onChange={(e) => setForm({ ...form, currencyCode: e.target.value.toLowerCase() })}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus" htmlFor="code-length">
              {t("coupons.settings.codeLength")}
            </Label>
            <Input
              id="code-length"
              size="small"
              type="number"
              min={6}
              max={20}
              value={form.codeLength}
              onChange={(e) => setForm({ ...form, codeLength: Number(e.target.value) })}
            />
          </div>
          <div className="flex flex-col gap-y-1">
            <Label size="xsmall" weight="plus">
              {t("coupons.settings.exportLocale")}
            </Label>
            <Select
              size="small"
              value={form.exportLocale}
              onValueChange={(value) => setForm({ ...form, exportLocale: value as "pl" | "en" })}
            >
              <Select.Trigger>
                <Select.Value />
              </Select.Trigger>
              <Select.Content>
                <Select.Item value="pl">{t("coupons.settings.polish")}</Select.Item>
                <Select.Item value="en">{t("coupons.settings.english")}</Select.Item>
              </Select.Content>
            </Select>
          </div>
        </div>
        <div className="flex gap-x-2">
          <Button size="small" onClick={() => onSave(changes)} isLoading={save.isPending}>
            {t("coupons.settings.save")}
          </Button>
          <Button size="small" variant="secondary" onClick={() => onSave({})} disabled={save.isPending}>
            {t("coupons.settings.reset")}
          </Button>
        </div>
      </Container>

      <Container className="flex flex-col gap-y-4 px-6 py-6">
        <div>
          <Heading level="h2">{t("coupons.settings.optionsTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("coupons.settings.optionsHint")}
          </Text>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {option("version", status.version)}
          {option("timeZone", status.options.timeZone)}
          {option("defaultLocale", status.options.defaultLocale.toUpperCase())}
          {option("maxBatchSize", status.options.maxBatchSize)}
          {option("checkRateLimitPerMinute", status.options.checkRateLimitPerMinute)}
        </div>
      </Container>
    </div>
  )
}
