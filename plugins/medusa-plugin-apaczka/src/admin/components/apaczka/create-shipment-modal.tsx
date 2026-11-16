import { ExclamationCircle, Plus, Trash } from "@medusajs/icons"
import { Button, FocusModal, Heading, IconButton, Input, Label, Select, Switch, Text, toast } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  type ParcelInput,
  type ShipmentOverrides,
  useApaczkaServices,
  useCreateShipment,
  usePickupHours,
  useValuation,
} from "../../lib/apaczka/api"
import { errorMessage, formatGrosze } from "../../lib/apaczka/format"

type Props = {
  fulfillmentId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type FormState = {
  service_id: number
  parcels: ParcelInput[]
  pickup_type: "SELF" | "COURIER"
  pickup_date: string
  hours_from: string
  hours_to: string
  cod_amount: string
  declared_value: string
  point_id: string
  content: string
  comment: string
}

const EMPTY_PARCEL: ParcelInput = { weight: 1, length: 30, width: 20, height: 10 }

export const CreateShipmentModal = ({ fulfillmentId, open, onOpenChange }: Props) => {
  const { t, i18n } = useTranslation()
  const services = useApaczkaServices()
  const valuation = useValuation(fulfillmentId)
  const create = useCreateShipment(fulfillmentId)
  const [form, setForm] = useState<FormState | null>(null)

  // Load defaults and a first quote when the modal opens.
  useEffect(() => {
    if (!open) {
      setForm(null)
      valuation.reset()
      return
    }
    valuation.mutate(undefined, {
      onSuccess: (data) =>
        setForm({
          service_id: data.service_id,
          parcels: data.defaults.parcels.length ? data.defaults.parcels : [EMPTY_PARCEL],
          pickup_type: data.option.pickup_courier === 2 ? "COURIER" : "SELF",
          pickup_date: "",
          hours_from: "09:00",
          hours_to: "16:00",
          cod_amount: data.defaults.cod_amount ? String(data.defaults.cod_amount) : "",
          declared_value: data.defaults.declared_value ? String(data.defaults.declared_value) : "",
          point_id: data.defaults.point_id ?? "",
          content: "",
          comment: "",
        }),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }, [open])

  const option = valuation.data?.option
  const isReturn = option?.is_return ?? false
  const serviceList = useMemo(
    () => (services.data?.services ?? []).filter((s) => !s.is_return && !s.cod),
    [services.data]
  )
  const selectedService = serviceList.find((s) => s.service_id === form?.service_id) ?? option
  const courierAllowed = (selectedService?.pickup_courier ?? 1) !== 0
  const needsPoint = !isReturn && selectedService?.destination === "point"

  const pickupHours = usePickupHours(
    form?.pickup_type === "COURIER" ? valuation.data?.sender_postal_code : undefined,
    form?.service_id
  )
  useEffect(() => {
    const first = pickupHours.data?.days?.[0]?.date
    if (form && form.pickup_type === "COURIER" && !form.pickup_date && first) {
      setForm({ ...form, pickup_date: first })
    }
  }, [pickupHours.data, form])

  const update = (patch: Partial<FormState>) => setForm((current) => (current ? { ...current, ...patch } : current))
  const updateParcel = (index: number, patch: Partial<ParcelInput>) =>
    setForm((current) =>
      current ? { ...current, parcels: current.parcels.map((p, i) => (i === index ? { ...p, ...patch } : p)) } : current
    )

  const overrides = (): ShipmentOverrides | undefined => {
    if (!form) {
      return undefined
    }
    return {
      service_id: form.service_id,
      parcels: form.parcels,
      pickup:
        form.pickup_type === "COURIER" && form.pickup_date
          ? { type: "COURIER", date: form.pickup_date, hours_from: form.hours_from, hours_to: form.hours_to }
          : { type: "SELF" },
      ...(form.cod_amount !== "" ? { cod_amount: Number(form.cod_amount) } : {}),
      ...(form.declared_value !== "" ? { declared_value: Number(form.declared_value) } : {}),
      ...(form.point_id ? { point_id: form.point_id.trim() } : {}),
      ...(form.content ? { content: form.content } : {}),
      ...(form.comment ? { comment: form.comment } : {}),
    }
  }

  const quote = () => valuation.mutate(overrides(), { onError: (error) => toast.error(errorMessage(error)) })

  const submit = () =>
    create.mutate(overrides(), {
      onSuccess: () => {
        toast.success(t("apaczka.toast.created"))
        onOpenChange(false)
      },
      onError: (error) => toast.error(errorMessage(error)),
    })

  return (
    <FocusModal open={open} onOpenChange={onOpenChange}>
      <FocusModal.Content>
        <FocusModal.Header>
          <div className="flex items-center justify-end gap-x-2">
            <FocusModal.Close asChild>
              <Button size="small" variant="secondary">
                {t("apaczka.actions.cancel")}
              </Button>
            </FocusModal.Close>
            <Button size="small" variant="secondary" onClick={quote} isLoading={valuation.isPending} disabled={!form}>
              {t("apaczka.actions.getPrice")}
            </Button>
            <Button
              size="small"
              onClick={submit}
              isLoading={create.isPending}
              disabled={!form || (needsPoint && !form.point_id)}
            >
              {t("apaczka.actions.create")}
            </Button>
          </div>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-1 flex-col items-center overflow-y-auto py-16">
          <div className="flex w-full max-w-[720px] flex-col gap-y-8 px-4">
            <div>
              <FocusModal.Title asChild>
                <Heading>{t("apaczka.create.title")}</Heading>
              </FocusModal.Title>
              <FocusModal.Description asChild>
                <Text className="text-ui-fg-subtle">{t("apaczka.create.description")}</Text>
              </FocusModal.Description>
            </div>

            {valuation.data && (
              <div className="bg-ui-bg-subtle shadow-borders-base flex items-center justify-between rounded-lg px-4 py-3">
                <div>
                  <Text size="small" weight="plus">
                    {t("apaczka.create.quote")}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {t("apaczka.create.quoteHint", { net: formatGrosze(valuation.data.price_net, i18n.language) })}
                  </Text>
                </div>
                <Heading level="h2">{formatGrosze(valuation.data.price_gross, i18n.language)}</Heading>
              </div>
            )}

            {(valuation.data?.missing_weight.length ?? 0) > 0 && (
              <div className="flex items-start gap-x-3 rounded-lg border border-ui-tag-orange-border bg-ui-tag-orange-bg px-4 py-3">
                <ExclamationCircle className="mt-0.5 shrink-0 text-ui-tag-orange-icon" />
                <div className="flex flex-col gap-y-1">
                  <Text size="small" weight="plus" className="text-ui-tag-orange-text">
                    {t("apaczka.weight.warningTitle", {
                      count: valuation.data!.missing_weight.length,
                      weight: valuation.data!.default_item_weight_kg,
                    })}
                  </Text>
                  <ul className="flex flex-col gap-y-0.5">
                    {valuation.data!.missing_weight.map((item, index) => (
                      <li key={`${item.variant_id ?? index}`}>
                        <Text size="small" className="text-ui-tag-orange-text">
                          {item.product_id ? (
                            <Link to={`/products/${item.product_id}`} target="_blank" className="underline">
                              {item.title}
                            </Link>
                          ) : (
                            item.title
                          )}{" "}
                          × {item.quantity}
                        </Text>
                      </li>
                    ))}
                  </ul>
                  <Text size="xsmall" className="text-ui-tag-orange-text">
                    {t("apaczka.weight.warningHint")}
                  </Text>
                </div>
              </div>
            )}

            {form && (
              <>
                <div className="flex flex-col gap-y-2">
                  <Label size="small" weight="plus">
                    {t("apaczka.fields.service")}
                  </Label>
                  <Select value={String(form.service_id)} onValueChange={(v) => update({ service_id: Number(v) })}>
                    <Select.Trigger>
                      <Select.Value />
                    </Select.Trigger>
                    <Select.Content>
                      {(serviceList.length ? serviceList : option ? [option] : []).map((service) => (
                        <Select.Item key={service.service_id} value={String(service.service_id)}>
                          {service.name}
                        </Select.Item>
                      ))}
                    </Select.Content>
                  </Select>
                </div>

                <div className="flex flex-col gap-y-3">
                  <div className="flex items-center justify-between">
                    <Label size="small" weight="plus">
                      {t("apaczka.create.parcels")}
                    </Label>
                    <Button
                      size="small"
                      variant="transparent"
                      onClick={() => update({ parcels: [...form.parcels, { ...EMPTY_PARCEL }] })}
                    >
                      <Plus />
                      {t("apaczka.actions.addParcel")}
                    </Button>
                  </div>
                  {form.parcels.map((parcel, index) => (
                    <div key={index} className="grid grid-cols-[repeat(4,1fr)_auto_auto] items-end gap-x-3">
                      {(["weight", "length", "width", "height"] as const).map((field) => (
                        <div key={field} className="flex flex-col gap-y-1">
                          <Label size="xsmall" className="text-ui-fg-subtle">
                            {t(`apaczka.create.${field}`)}
                          </Label>
                          <Input
                            size="small"
                            type="number"
                            min={0}
                            step={field === "weight" ? 0.01 : 1}
                            value={parcel[field]}
                            onChange={(e) => updateParcel(index, { [field]: Number(e.target.value) })}
                          />
                        </div>
                      ))}
                      <div className="flex flex-col items-center gap-y-1 pb-1">
                        <Label size="xsmall" className="text-ui-fg-subtle">
                          {t("apaczka.create.nonStandard")}
                        </Label>
                        <Switch
                          checked={Boolean(parcel.non_standard)}
                          onCheckedChange={(checked) => updateParcel(index, { non_standard: checked })}
                        />
                      </div>
                      <IconButton
                        size="small"
                        variant="transparent"
                        aria-label={t("apaczka.actions.removeParcel")}
                        disabled={form.parcels.length === 1}
                        onClick={() => update({ parcels: form.parcels.filter((_, i) => i !== index) })}
                      >
                        <Trash />
                      </IconButton>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-y-2">
                    <Label size="small" weight="plus">
                      {t("apaczka.fields.pickup")}
                    </Label>
                    <Select
                      value={form.pickup_type}
                      onValueChange={(v) => update({ pickup_type: v as FormState["pickup_type"] })}
                    >
                      <Select.Trigger>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value="SELF" disabled={selectedService?.pickup_courier === 2}>
                          {t("apaczka.pickupType.SELF")}
                        </Select.Item>
                        <Select.Item value="COURIER" disabled={!courierAllowed}>
                          {t("apaczka.pickupType.COURIER")}
                        </Select.Item>
                      </Select.Content>
                    </Select>
                  </div>
                  {form.pickup_type === "COURIER" && (
                    <div className="flex flex-col gap-y-2">
                      <Label size="small" weight="plus">
                        {t("apaczka.create.pickupDate")}
                      </Label>
                      <Input
                        type="date"
                        value={form.pickup_date}
                        onChange={(e) => update({ pickup_date: e.target.value })}
                      />
                      {pickupHours.isSuccess && !pickupHours.data.days.length && (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {t("apaczka.create.noPickupDays")}
                        </Text>
                      )}
                    </div>
                  )}
                  {form.pickup_type === "COURIER" && (
                    <>
                      <div className="flex flex-col gap-y-2">
                        <Label size="small">{t("apaczka.create.hoursFrom")}</Label>
                        <Input
                          type="time"
                          value={form.hours_from}
                          onChange={(e) => update({ hours_from: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-y-2">
                        <Label size="small">{t("apaczka.create.hoursTo")}</Label>
                        <Input
                          type="time"
                          value={form.hours_to}
                          onChange={(e) => update({ hours_to: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {!isReturn && (
                    <div className="flex flex-col gap-y-2">
                      <Label size="small" weight="plus">
                        {t("apaczka.fields.codAmount")}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={form.cod_amount}
                        onChange={(e) => update({ cod_amount: e.target.value })}
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-y-2">
                    <Label size="small" weight="plus">
                      {t("apaczka.fields.declaredValue")}
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={form.declared_value}
                      onChange={(e) => update({ declared_value: e.target.value })}
                    />
                  </div>
                  {!isReturn && (
                    <div className="col-span-2 flex flex-col gap-y-2">
                      <Label size="small" weight="plus">
                        {t("apaczka.fields.point")}
                      </Label>
                      <Input value={form.point_id} onChange={(e) => update({ point_id: e.target.value })} />
                      {needsPoint && (
                        <Text size="xsmall" className="text-ui-fg-subtle">
                          {t("apaczka.create.pointRequired")}
                        </Text>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-y-2">
                    <Label size="small" weight="plus">
                      {t("apaczka.fields.content")}
                    </Label>
                    <Input value={form.content} maxLength={255} onChange={(e) => update({ content: e.target.value })} />
                  </div>
                  <div className="flex flex-col gap-y-2">
                    <Label size="small" weight="plus">
                      {t("apaczka.fields.comment")}
                    </Label>
                    <Input value={form.comment} maxLength={255} onChange={(e) => update({ comment: e.target.value })} />
                  </div>
                </div>
              </>
            )}
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
