import { Button, Checkbox, FocusModal, Heading, Input, Label, Select, Switch, Text, Textarea } from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import {
  type Advert,
  type AdvertInput,
  type Issue,
  type ProductVariant,
  usePublish,
  useSettings,
  useUpdateAdvert,
} from "../../lib/olx/api"
import { looksLikePhone } from "../../../lib/olx/validation"
import { AttributeFields, CategoryPicker, CityPicker, useMissingAttributes } from "./pickers"
import { issueText, showResult } from "./shared"

const LIMITS = { titleMin: 16, titleMax: 150, descriptionMin: 80, descriptionMax: 9000 }

const Counter = ({ value, min, max }: { value: number; min: number; max: number }) => (
  <Text size="xsmall" className={value < min || value > max ? "text-ui-fg-error" : "text-ui-fg-muted"}>
    {value} / {max}
  </Text>
)

/** Publishing or editing one variant's advert. Nothing reaches OLX before the button. */
export const AdvertForm = ({
  open,
  onClose,
  productTitle,
  images,
  variant,
  advert,
}: {
  open: boolean
  onClose: () => void
  productTitle: string
  images: Array<{ url: string; usable: boolean }>
  variant: ProductVariant
  advert: Advert | null
}) => {
  const { t } = useTranslation()
  const settings = useSettings(open)
  const publish = usePublish()
  const update = useUpdateAdvert()
  const initial = advert?.payload ?? variant.draft
  const [form, setForm] = useState<AdvertInput>(initial)
  const [categoryName, setCategoryName] = useState("")
  const [cityName, setCityName] = useState("")
  const [issues, setIssues] = useState<Issue[]>([])
  const [refused, setRefused] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setForm(advert?.payload ?? variant.draft)
    setIssues([])
    setRefused(null)
  }, [open, advert?.id])

  useEffect(() => {
    if (!open || !settings.data) return
    if (form.category_id && form.category_id === settings.data.category_id) {
      setCategoryName(settings.data.category_name)
    }
    if (form.city_id && form.city_id === settings.data.city_id) {
      setCityName(settings.data.city_name)
    }
  }, [open, settings.data, form.category_id, form.city_id])

  const set = <K extends keyof AdvertInput>(key: K, value: AdvertInput[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const missing = useMissingAttributes(form.category_id || null, form.attributes)
  const gallery = useMemo(() => {
    const known = new Set(images.map((image) => image.url))
    return [...images, ...form.images.filter((url) => !known.has(url)).map((url) => ({ url, usable: true }))]
  }, [images, form.images])
  const pending = publish.isPending || update.isPending

  const submit = async () => {
    setIssues([])
    setRefused(null)
    try {
      const result = advert?.olx_advert_id
        ? await update.mutateAsync({ id: advert.id, advert: form })
        : await publish.mutateAsync({ variant_id: variant.variant_id, advert: form })
      if (result.result === "invalid") {
        setIssues(result.issues)
      } else if (result.result === "refused") {
        setRefused(result.message)
      }
      if (showResult(t, result)) {
        onClose()
      }
    } catch (error) {
      setRefused((error as Error).message)
    }
  }

  const fieldErrors = (field: string) =>
    issues
      .filter((issue) => issue.field === field)
      .map((issue) => (
        <Text key={issue.code} size="xsmall" className="text-ui-fg-error">
          {issueText(t, issue)}
        </Text>
      ))

  return (
    <FocusModal open={open} onOpenChange={(next) => !next && onClose()}>
      <FocusModal.Content>
        <FocusModal.Header>
          <Button size="small" isLoading={pending} disabled={missing.length > 0} onClick={submit}>
            {advert?.olx_advert_id ? t("olx.form.save") : t("olx.form.publish")}
          </Button>
        </FocusModal.Header>
        <FocusModal.Body className="flex flex-col items-center overflow-y-auto">
          <div className="flex w-full max-w-3xl flex-col gap-y-6 px-6 py-8">
            <div>
              <Heading>{advert?.olx_advert_id ? t("olx.form.editTitle") : t("olx.form.publishTitle")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {[productTitle, variant.variant_title, variant.sku].filter(Boolean).join(" · ")}
              </Text>
            </div>

            {refused && (
              <div className="rounded-md border border-ui-tag-red-border bg-ui-tag-red-bg px-4 py-3">
                <Text size="small" className="text-ui-tag-red-text">
                  {refused}
                </Text>
              </div>
            )}

            <div className="flex flex-col gap-y-2">
              <div className="flex items-center justify-between">
                <Label size="small" weight="plus">
                  {t("olx.field.title")}
                </Label>
                <Counter value={form.title.trim().length} min={LIMITS.titleMin} max={LIMITS.titleMax} />
              </div>
              <Input size="small" value={form.title} onChange={(event) => set("title", event.target.value)} />
              {fieldErrors("title")}
            </div>

            <div className="flex flex-col gap-y-2">
              <div className="flex items-center justify-between">
                <Label size="small" weight="plus">
                  {t("olx.field.description")}
                </Label>
                <Counter
                  value={form.description.trim().length}
                  min={LIMITS.descriptionMin}
                  max={LIMITS.descriptionMax}
                />
              </div>
              <Textarea
                rows={8}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
              />
              <Text size="xsmall" className="text-ui-fg-subtle">
                {t("olx.form.textRules")}
              </Text>
              {looksLikePhone(`${form.title}\n${form.description}`) && (
                <Text size="xsmall" className="text-ui-tag-orange-text">
                  {t("olx.form.phoneWarning")}
                </Text>
              )}
              {fieldErrors("description")}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus">
                  {t("olx.field.price")}
                </Label>
                <Input
                  size="small"
                  inputMode="decimal"
                  value={form.price}
                  onChange={(event) => set("price", event.target.value.replace(",", "."))}
                />
                {variant.store_price && (
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {t("olx.form.storePrice", { price: variant.store_price })}
                  </Text>
                )}
                {fieldErrors("price")}
              </div>
              <div className="flex items-center gap-x-2 pt-6">
                <Switch checked={form.negotiable} onCheckedChange={(value) => set("negotiable", value)} />
                <Label size="small">{t("olx.form.negotiable")}</Label>
              </div>
            </div>

            <div className="flex flex-col gap-y-2">
              <CategoryPicker
                id={form.category_id || null}
                name={categoryName}
                suggestFrom={form.title}
                onChange={(category) => {
                  setCategoryName(category?.name ?? "")
                  setForm((current) => ({ ...current, category_id: category?.id ?? 0, attributes: [] }))
                }}
              />
              {fieldErrors("category")}
            </div>

            <AttributeFields
              categoryId={form.category_id || null}
              value={form.attributes}
              onChange={(next) => set("attributes", next)}
            />
            {missing.length > 0 && (
              <Text size="xsmall" className="text-ui-fg-error">
                {t("olx.form.missingAttributes", { names: missing.join(", ") })}
              </Text>
            )}

            <div className="flex flex-col gap-y-2">
              <Label size="small" weight="plus">
                {t("olx.field.images")}
              </Label>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
                {gallery.map((image) => {
                  const checked = form.images.includes(image.url)
                  return (
                    <label
                      key={image.url}
                      title={image.usable ? undefined : t("olx.issue.not_public")}
                      className={`relative block overflow-hidden rounded-md border border-ui-border-base ${
                        image.usable ? "cursor-pointer" : "opacity-40"
                      }`}
                    >
                      <img src={image.url} alt="" className="aspect-square w-full object-cover" />
                      <span className="absolute left-1 top-1">
                        <Checkbox
                          disabled={!image.usable}
                          checked={checked}
                          onCheckedChange={(value) =>
                            set(
                              "images",
                              value ? [...form.images, image.url] : form.images.filter((url) => url !== image.url)
                            )
                          }
                        />
                      </span>
                    </label>
                  )
                })}
              </div>
              {gallery.some((image) => !image.usable) && (
                <Text size="xsmall" className="text-ui-fg-subtle">
                  {t("olx.form.imagesHint")}
                </Text>
              )}
              {fieldErrors("images")}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-y-2">
                <CityPicker
                  cityId={form.city_id || null}
                  cityName={cityName}
                  districtId={form.district_id}
                  onCity={(city) => {
                    setCityName(city?.name ?? "")
                    set("city_id", city?.id ?? 0)
                  }}
                  onDistrict={(id) => set("district_id", id)}
                />
                {fieldErrors("city")}
              </div>
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus">
                  {t("olx.settings.advertiser")}
                </Label>
                <Select
                  size="small"
                  value={form.advertiser_type}
                  onValueChange={(value) => set("advertiser_type", value as AdvertInput["advertiser_type"])}
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
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus">
                  {t("olx.field.contact")}
                </Label>
                <Input
                  size="small"
                  value={form.contact_name}
                  onChange={(event) => set("contact_name", event.target.value)}
                />
                {fieldErrors("contact")}
              </div>
              <div className="flex flex-col gap-y-2">
                <Label size="small" weight="plus">
                  {t("olx.settings.phone")}
                </Label>
                <Input
                  size="small"
                  value={form.contact_phone ?? ""}
                  onChange={(event) => set("contact_phone", event.target.value || null)}
                />
              </div>
            </div>

            <Text size="xsmall" className="text-ui-fg-subtle">
              {t("olx.form.paidNotice")}
            </Text>
          </div>
        </FocusModal.Body>
      </FocusModal.Content>
    </FocusModal>
  )
}
