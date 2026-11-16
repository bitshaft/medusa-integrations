import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Switch,
  Tabs,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { type ReactNode, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type BackInStockStatus,
  type Settings as SettingsValues,
  type SettingsResponse,
  useDeleteDemo,
  useSaveSettings,
  useSeedDemo,
  useSettings,
} from "../../lib/back-in-stock/api"
import { errorMessage } from "../../lib/back-in-stock/kit/format"
import { TAB_CLASS } from "../../lib/back-in-stock/kit/ui"

type EnabledStatus = Extract<BackInStockStatus, { enabled: true }>
type NumberField = "minQuantity" | "delayMinutes" | "minGapHours" | "maxNotifications"
type RetentionField = "unconfirmedDays" | "endedDays" | "activeDays"

export const Settings = ({ status }: { status: EnabledStatus }) => {
  const settings = useSettings(true)
  return (
    <div className="flex flex-col gap-y-3">
      {settings.data && <SettingsForm data={settings.data} />}
      <Sending status={status} />
      <DemoTools demoCount={status.counts.demo} />
    </div>
  )
}

const SettingsForm = ({ data }: { data: SettingsResponse }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const save = useSaveSettings()
  const [values, setValues] = useState<SettingsValues>(data.settings)
  const [locale, setLocale] = useState<"en" | "pl">("pl")
  const [consent, setConsent] = useState<{ en: string; pl: string }>({
    en: data.settings.consentText.en ?? "",
    pl: data.settings.consentText.pl ?? "",
  })

  useEffect(() => {
    setValues(data.settings)
    setConsent({ en: data.settings.consentText.en ?? "", pl: data.settings.consentText.pl ?? "" })
  }, [data])

  const numberInput = (field: NumberField) => (
    <Field
      id={`bis-${field}`}
      label={t(`back-in-stock.settings.${field}`)}
      hint={t(`back-in-stock.settings.${field}Hint`)}
      changed={data.overridden.includes(field)}
    >
      <Input
        id={`bis-${field}`}
        type="number"
        min={field === "delayMinutes" || field === "minGapHours" ? 0 : 1}
        value={String(values[field])}
        onChange={(event) => setValues({ ...values, [field]: Number(event.target.value) })}
      />
    </Field>
  )

  const retentionInput = (field: RetentionField) => (
    <Field id={`bis-${field}`} label={t(`back-in-stock.settings.${field}`)}>
      <Input
        id={`bis-${field}`}
        type="number"
        min={1}
        value={String(values.retention[field])}
        onChange={(event) =>
          setValues({ ...values, retention: { ...values.retention, [field]: Number(event.target.value) } })
        }
      />
    </Field>
  )

  // Only what the admin changed is sent, so untouched settings keep following medusa-config.ts.
  const changes = (): Partial<SettingsValues> => {
    const current = data.settings
    const body: Partial<SettingsValues> = {}
    for (const key of ["minQuantity", "delayMinutes", "minGapHours", "maxNotifications", "doubleOptIn"] as const) {
      if (values[key] !== current[key]) {
        ;(body as Record<string, unknown>)[key] = values[key]
      }
    }
    const retention = Object.fromEntries(
      Object.entries(values.retention).filter(
        ([key, value]) => value !== current.retention[key as keyof SettingsValues["retention"]]
      )
    )
    if (Object.keys(retention).length) {
      body.retention = retention as SettingsValues["retention"]
    }
    const consentChanges = Object.fromEntries(
      (["en", "pl"] as const)
        .filter((locale) => consent[locale] !== (current.consentText[locale] ?? ""))
        .map((locale) => [locale, consent[locale]])
    )
    if (Object.keys(consentChanges).length) {
      body.consentText = consentChanges
    }
    return body
  }

  const onSave = () =>
    save.mutate(changes(), {
      onSuccess: () => toast.success(t("back-in-stock.settings.saved")),
      onError: (error) => toast.error(t("back-in-stock.settings.saveFailed", { error: errorMessage(error) })),
    })

  const onReset = async () => {
    const confirmed = await prompt({
      title: t("back-in-stock.settings.resetTitle"),
      description: t("back-in-stock.settings.resetText"),
      confirmText: t("back-in-stock.settings.reset"),
      cancelText: t("back-in-stock.settings.cancel"),
      variant: "danger",
    })
    if (confirmed) {
      save.mutate(
        { reset: true },
        {
          onSuccess: () => toast.success(t("back-in-stock.settings.resetDone")),
          onError: (error) => toast.error(t("back-in-stock.settings.saveFailed", { error: errorMessage(error) })),
        }
      )
    }
  }

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("back-in-stock.settings.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("back-in-stock.settings.subtitle")}
        </Text>
      </div>

      <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
        {numberInput("minQuantity")}
        {numberInput("delayMinutes")}
        {numberInput("minGapHours")}
        {numberInput("maxNotifications")}
      </div>

      <div className="flex items-start justify-between gap-x-4 px-6 py-4">
        <div>
          <div className="flex items-center gap-x-2">
            <Label size="small" htmlFor="bis-double-opt-in">
              {t("back-in-stock.settings.doubleOptIn")}
            </Label>
            {data.overridden.includes("doubleOptIn") && (
              <Badge size="2xsmall">{t("back-in-stock.settings.changed")}</Badge>
            )}
          </div>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("back-in-stock.settings.doubleOptInHint")}
          </Text>
        </div>
        <Switch
          id="bis-double-opt-in"
          checked={values.doubleOptIn}
          onCheckedChange={(checked) => setValues({ ...values, doubleOptIn: checked })}
        />
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <Text size="small" weight="plus">
          {t("back-in-stock.settings.retention")}
        </Text>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {retentionInput("unconfirmedDays")}
          {retentionInput("endedDays")}
          {retentionInput("activeDays")}
        </div>
      </div>

      <div className="flex flex-col gap-y-2 px-6 py-4">
        <div className="flex items-center justify-between gap-x-4">
          <Label size="small" htmlFor="bis-consent">
            {t("back-in-stock.settings.consent")}
          </Label>
          <Tabs value={locale} onValueChange={(value) => setLocale(value as "en" | "pl")}>
            <Tabs.List>
              <Tabs.Trigger className={TAB_CLASS} value="pl">
                PL
              </Tabs.Trigger>
              <Tabs.Trigger className={TAB_CLASS} value="en">
                EN
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs>
        </div>
        <Textarea
          id="bis-consent"
          rows={4}
          maxLength={2000}
          value={consent[locale]}
          placeholder={data.defaults.consentText[locale]}
          onChange={(event) => setConsent({ ...consent, [locale]: event.target.value })}
        />
        <Text size="xsmall" className="text-ui-fg-subtle">
          {t("back-in-stock.settings.consentHint")}
        </Text>
      </div>

      <div className="flex items-center justify-between px-6 py-4">
        <Button size="small" variant="danger" disabled={!data.overridden.length} onClick={onReset}>
          {t("back-in-stock.settings.reset")}
        </Button>
        <Button size="small" isLoading={save.isPending} onClick={onSave}>
          {t("back-in-stock.settings.save")}
        </Button>
      </div>
    </Container>
  )
}

const Field = ({
  id,
  label,
  hint,
  changed,
  children,
}: {
  id: string
  label: string
  hint?: string
  changed?: boolean
  children: ReactNode
}) => {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-y-1">
      <div className="flex items-center gap-x-2">
        <Label size="small" htmlFor={id}>
          {label}
        </Label>
        {changed && <Badge size="2xsmall">{t("back-in-stock.settings.changed")}</Badge>}
      </div>
      {children}
      {hint && (
        <Text size="xsmall" className="text-ui-fg-subtle">
          {hint}
        </Text>
      )}
    </div>
  )
}

const Sending = ({ status }: { status: EnabledStatus }) => {
  const { t } = useTranslation()
  const row = (label: string, value: ReactNode) => (
    <div className="grid grid-cols-3 gap-x-4 py-1">
      <Text size="small" className="text-ui-fg-subtle">
        {label}
      </Text>
      <Text size="small" className="col-span-2 break-all">
        {value}
      </Text>
    </div>
  )
  const notSet = t("back-in-stock.sending.notSet")
  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("back-in-stock.sending.title")}</Heading>
      </div>
      <div className="px-6 py-4">
        {row(t("back-in-stock.sending.restock"), t(`back-in-stock.sending.${status.sending.restock}`))}
        {row(t("back-in-stock.sending.confirm"), t(`back-in-stock.sending.${status.sending.confirm}`))}
        {status.sending.restock === "notification" && status.sending.emails_option === "auto" && (
          <Text size="xsmall" className="text-ui-fg-subtle mt-1">
            {t("back-in-stock.sending.emailsHint")}
          </Text>
        )}
      </div>
      <div className="px-6 py-4">
        <Text size="small" weight="plus" className="mb-1">
          {t("back-in-stock.sending.links")}
        </Text>
        {row(t("back-in-stock.sending.backendUrl"), status.links.backend_url ?? notSet)}
        {row(t("back-in-stock.sending.storefrontUrl"), status.links.storefront_url ?? notSet)}
        {row(t("back-in-stock.sending.productUrl"), <span className="font-mono">{status.links.product}</span>)}
        {row(t("back-in-stock.sending.confirmUrl"), status.links.confirm ?? t("back-in-stock.sending.builtInPage"))}
        {row(
          t("back-in-stock.sending.unsubscribeUrl"),
          status.links.unsubscribe ?? t("back-in-stock.sending.builtInPage")
        )}
        {row(t("back-in-stock.sending.version"), status.version)}
      </div>
    </Container>
  )
}

const DemoTools = ({ demoCount }: { demoCount: number }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const seed = useSeedDemo()
  const remove = useDeleteDemo()
  const [emails, setEmails] = useState("")
  const [count, setCount] = useState("3")
  const addresses = emails
    .split(/[\s,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)

  const onSeed = () =>
    seed.mutate(
      { emails: addresses, count: Math.max(1, Math.min(20, Number(count) || 3)) },
      {
        onSuccess: (result) => toast.success(t("back-in-stock.demoTools.seeded", { count: result.created })),
        onError: (error) => toast.error(t("back-in-stock.demoTools.seedFailed", { error: errorMessage(error) })),
      }
    )

  const onDelete = async () => {
    const confirmed = await prompt({
      title: t("back-in-stock.demoTools.deleteTitle"),
      description: t("back-in-stock.demoTools.deleteText"),
      confirmText: t("back-in-stock.demoTools.delete"),
      cancelText: t("back-in-stock.settings.cancel"),
      variant: "danger",
    })
    if (confirmed) {
      remove.mutate(undefined, {
        onSuccess: (result) => toast.success(t("back-in-stock.demoTools.deleted", { count: result.deleted })),
      })
    }
  }

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="flex items-center justify-between gap-x-4 px-6 py-4">
        <div>
          <Heading level="h2">{t("back-in-stock.demoTools.title")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("back-in-stock.demoTools.subtitle")}
          </Text>
        </div>
        {demoCount > 0 && <Badge size="2xsmall">{t("back-in-stock.demoTools.existing", { count: demoCount })}</Badge>}
      </div>
      <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-3">
        <div className="flex flex-col gap-y-1 md:col-span-2">
          <Label size="small" htmlFor="bis-demo-emails">
            {t("back-in-stock.demoTools.emails")}
          </Label>
          <Textarea id="bis-demo-emails" rows={2} value={emails} onChange={(event) => setEmails(event.target.value)} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label size="small" htmlFor="bis-demo-count">
            {t("back-in-stock.demoTools.count")}
          </Label>
          <Input
            id="bis-demo-count"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4">
        <Text size="xsmall" className="text-ui-fg-subtle">
          {t("back-in-stock.demoTools.hint")}
        </Text>
        <div className="flex items-center gap-x-2">
          <Button size="small" variant="danger" disabled={!demoCount} isLoading={remove.isPending} onClick={onDelete}>
            {t("back-in-stock.demoTools.delete")}
          </Button>
          <Button size="small" disabled={!addresses.length} isLoading={seed.isPending} onClick={onSeed}>
            {t("back-in-stock.demoTools.seed")}
          </Button>
        </div>
      </div>
    </Container>
  )
}
