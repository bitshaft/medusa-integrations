import { Badge, Button, Container, Heading, Input, Label, Select, Switch, Text, toast, usePrompt } from "@medusajs/ui"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"

import {
  type ConnectionInfo,
  type Settings,
  useConnect,
  useDisconnect,
  useSaveSettings,
  useSettings,
} from "../../lib/olx/api"
import { LoadingBlock } from "../../lib/olx/kit/page"
import { CategoryPicker, CityPicker } from "./pickers"

const ConnectionCard = ({ connection, demo }: { connection: ConnectionInfo; demo: boolean }) => {
  const { t } = useTranslation()
  const prompt = usePrompt()
  const connect = useConnect()
  const disconnect = useDisconnect()
  const [params, setParams] = useSearchParams()
  const outcome = params.get("connected")

  useEffect(() => {
    if (!outcome) return
    if (outcome === "ok") toast.success(t("olx.connection.ok"))
    else toast.error(t(`olx.connection.${outcome}`, { defaultValue: t("olx.connection.failed") }))
    setParams(
      (current) => {
        const copy = new URLSearchParams(current)
        copy.delete("connected")
        return copy
      },
      { replace: true }
    )
  }, [outcome])

  const start = async () => {
    try {
      const { url } = await connect.mutateAsync()
      window.location.assign(url)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  const stop = async () => {
    const confirmed = await prompt({
      title: t("olx.connection.disconnectTitle"),
      description: t("olx.connection.disconnectBody"),
      confirmText: t("olx.connection.disconnect"),
      cancelText: t("olx.form.cancel"),
    })
    if (confirmed) disconnect.mutate()
  }

  const healthy = connection.connected && !connection.needs_reconnect
  return (
    <Container className="overflow-hidden flex flex-wrap items-center justify-between gap-4 px-6 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-x-2">
          <Heading level="h2">{t("olx.connection.title")}</Heading>
          <Badge size="2xsmall" color={healthy ? "green" : connection.connected ? "red" : "orange"}>
            {t(healthy ? "olx.connection.on" : connection.connected ? "olx.connection.expired" : "olx.connection.off")}
          </Badge>
        </div>
        <Text size="small" className="text-ui-fg-subtle">
          {healthy ? (connection.user_name ?? t("olx.connection.unnamed")) : t("olx.connection.hint")}
        </Text>
        {connection.last_error && (
          <Text size="xsmall" className="text-ui-fg-error">
            {connection.last_error}
          </Text>
        )}
      </div>
      {!demo && (
        <div className="flex items-center gap-x-2">
          {connection.connected && (
            <Button size="small" variant="secondary" isLoading={disconnect.isPending} onClick={stop}>
              {t("olx.connection.disconnect")}
            </Button>
          )}
          {!healthy && (
            <Button size="small" isLoading={connect.isPending} onClick={start}>
              {t("olx.connection.connect")}
            </Button>
          )}
        </div>
      )}
    </Container>
  )
}

const Field = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <div className="flex flex-col gap-y-2">
    <Label size="small" weight="plus">
      {label}
    </Label>
    <Input size="small" value={value} onChange={(event) => onChange(event.target.value)} />
  </div>
)

const DefaultsCard = () => {
  const { t } = useTranslation()
  const { data, isLoading } = useSettings()
  const save = useSaveSettings()
  const [form, setForm] = useState<Settings | null>(null)
  useEffect(() => {
    if (data) setForm(data)
  }, [data])
  if (isLoading || !form) return <LoadingBlock />

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setForm((current) => (current ? { ...current, [key]: value } : current))
  const maker = form.safety.manufacturer ?? {}
  const setMaker = (key: keyof typeof maker, value: string) =>
    set("safety", { ...form.safety, manufacturer: { ...maker, [key]: value } })

  const submit = async () => {
    const manufacturer = Object.fromEntries(Object.entries(maker).filter(([, value]) => value?.trim()))
    const safety = {
      ...(form.safety.placed_before_2024 ? { placed_before_2024: true } : {}),
      ...(Object.keys(manufacturer).length ? { manufacturer } : {}),
      ...(form.safety.warning_and_safety?.trim() ? { warning_and_safety: form.safety.warning_and_safety.trim() } : {}),
    }
    try {
      await save.mutateAsync({ ...form, safety })
      toast.success(t("olx.settings.saved"))
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("olx.settings.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("olx.settings.hint")}
        </Text>
      </div>
      <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
        <Field label={t("olx.field.contact")} value={form.contact_name} onChange={(v) => set("contact_name", v)} />
        <Field label={t("olx.settings.phone")} value={form.contact_phone} onChange={(v) => set("contact_phone", v)} />
        <CityPicker
          cityId={form.city_id}
          cityName={form.city_name}
          districtId={form.district_id}
          onCity={(city) =>
            setForm((current) =>
              current ? { ...current, city_id: city?.id ?? null, city_name: city?.name ?? "" } : current
            )
          }
          onDistrict={(id) => set("district_id", id)}
        />
        <CategoryPicker
          id={form.category_id}
          name={form.category_name}
          onChange={(category) =>
            setForm((current) =>
              current ? { ...current, category_id: category?.id ?? null, category_name: category?.name ?? "" } : current
            )
          }
        />
        <div className="flex flex-col gap-y-2">
          <Label size="small" weight="plus">
            {t("olx.settings.advertiser")}
          </Label>
          <Select
            size="small"
            value={form.advertiser_type}
            onValueChange={(value) => set("advertiser_type", value as Settings["advertiser_type"])}
          >
            <Select.Trigger>
              <Select.Value />
            </Select.Trigger>
            <Select.Content>
              <Select.Item value="business">{t("olx.settings.business")}</Select.Item>
              <Select.Item value="private">{t("olx.settings.private")}</Select.Item>
            </Select.Content>
          </Select>
        </div>
        <div className="flex items-center gap-x-2 pt-6">
          <Switch checked={form.negotiable} onCheckedChange={(value) => set("negotiable", value)} />
          <Label size="small">{t("olx.form.negotiable")}</Label>
        </div>
      </div>
      <div className="flex flex-col gap-y-4 px-6 py-4">
        <div>
          <Text size="small" weight="plus">
            {t("olx.settings.safetyTitle")}
          </Text>
          <Text size="xsmall" className="text-ui-fg-subtle">
            {t("olx.settings.safetyHint")}
          </Text>
        </div>
        <div className="flex items-center gap-x-2">
          <Switch
            checked={Boolean(form.safety.placed_before_2024)}
            onCheckedChange={(value) => set("safety", { ...form.safety, placed_before_2024: value })}
          />
          <Label size="small">{t("olx.settings.placedBefore")}</Label>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t("olx.settings.makerName")} value={maker.name ?? ""} onChange={(v) => setMaker("name", v)} />
          <Field
            label={t("olx.settings.makerCountry")}
            value={maker.country ?? ""}
            onChange={(v) => setMaker("country", v)}
          />
          <Field
            label={t("olx.settings.makerAddress")}
            value={maker.address ?? ""}
            onChange={(v) => setMaker("address", v)}
          />
          <Field
            label={t("olx.settings.makerEmail")}
            value={maker.email ?? ""}
            onChange={(v) => setMaker("email", v)}
          />
        </div>
        <Field
          label={t("olx.settings.warning")}
          value={form.safety.warning_and_safety ?? ""}
          onChange={(v) => set("safety", { ...form.safety, warning_and_safety: v })}
        />
      </div>
      <div className="flex justify-end px-6 py-4">
        <Button size="small" isLoading={save.isPending} onClick={submit}>
          {t("olx.settings.save")}
        </Button>
      </div>
    </Container>
  )
}

/** The connected account and the defaults for new adverts. */
export const SettingsTab = ({ connection, demo }: { connection: ConnectionInfo; demo: boolean }) => (
  <>
    <ConnectionCard connection={connection} demo={demo} />
    <DefaultsCard />
  </>
)
