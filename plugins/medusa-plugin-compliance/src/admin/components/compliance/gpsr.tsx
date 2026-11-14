import { ArrowPath, PencilSquare, Plus, Trash } from "@medusajs/icons"
import {
  Badge,
  Button,
  Container,
  Drawer,
  Heading,
  IconButton,
  Input,
  Select,
  Skeleton,
  Table,
  Text,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import {
  type Manufacturer,
  useDeleteManufacturer,
  useGpsrProducts,
  useManufacturers,
  useRecomputeGpsr,
  useSaveManufacturer,
} from "../../lib/compliance/api"
import { errorMessage, shortDate } from "../../lib/compliance/format"
import { PartyFields } from "./product-safety-form"
import { Empty, Gaps, Pager, Section, TextField, Toggle } from "./shared"

const LIMIT = 25

/** The GPSR tab: products with missing data and manufacturer profiles. */
export const Gpsr = ({ demo }: { demo: boolean }) => (
  <div className="flex flex-col gap-y-3">
    <Products demo={demo} />
    <Manufacturers demo={demo} />
  </div>
)

const Products = ({ demo }: { demo: boolean }) => {
  const { t, i18n } = useTranslation()
  const [filter, setFilter] = useState<"false" | "all">("false")
  const [q, setQ] = useState("")
  const [offset, setOffset] = useState(0)
  const products = useGpsrProducts({ complete: filter === "all" ? undefined : filter, q, limit: LIMIT, offset })
  const recompute = useRecomputeGpsr()

  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{t("compliance.gpsr.productsTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("compliance.gpsr.productsHint")}
          </Text>
        </div>
        <Button
          size="small"
          variant="secondary"
          disabled={demo}
          isLoading={recompute.isPending}
          onClick={() =>
            recompute.mutate(undefined, {
              onSuccess: (r) =>
                toast.success(t("compliance.gpsr.rechecked", { checked: r.checked, incomplete: r.incomplete })),
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          <ArrowPath />
          {t("compliance.gpsr.recheck")}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Select size="small" value={filter} onValueChange={(v) => (setFilter(v as "false" | "all"), setOffset(0))}>
          <Select.Trigger className="w-56">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value="false">{t("compliance.gpsr.filterIncomplete")}</Select.Item>
            <Select.Item value="all">{t("compliance.gpsr.filterAll")}</Select.Item>
          </Select.Content>
        </Select>
        <Input
          size="small"
          type="search"
          className="w-64"
          placeholder={t("compliance.gpsr.search")}
          value={q}
          onChange={(e) => (setQ(e.target.value), setOffset(0))}
        />
      </div>
      {products.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !products.data?.products.length ? (
        <Empty>{filter === "false" ? t("compliance.gpsr.allComplete") : t("compliance.gpsr.noProducts")}</Empty>
      ) : (
        <>
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>{t("compliance.gpsr.product")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gpsr.missing")}</Table.HeaderCell>
                <Table.HeaderCell>{t("compliance.gpsr.checked")}</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {products.data.products.map((p) => (
                <Table.Row key={p.product_id}>
                  <Table.Cell>
                    <div className="flex items-center gap-x-2">
                      {demo ? (
                        <Text size="small">{p.title}</Text>
                      ) : (
                        <Link
                          to={`/products/${p.product_id}`}
                          className="txt-compact-small text-ui-fg-interactive hover:underline"
                        >
                          {p.title ?? p.product_id}
                        </Link>
                      )}
                      {p.status && p.status !== "published" && <Badge size="2xsmall">{p.status}</Badge>}
                    </div>
                  </Table.Cell>
                  <Table.Cell className="py-2">
                    <Gaps gaps={p.gaps} />
                  </Table.Cell>
                  <Table.Cell>{shortDate(p.checked_at, i18n.language)}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
          <Pager offset={offset} limit={LIMIT} count={products.data.count} onChange={setOffset} />
        </>
      )}
    </Container>
  )
}

type Draft = Omit<Manufacturer, "products" | "id"> & { id?: string }

const emptyDraft = (): Draft => ({ name: "", manufacturer: {}, outside_eu: false, responsible: {} })

const Manufacturers = ({ demo }: { demo: boolean }) => {
  const { t } = useTranslation()
  const list = useManufacturers()
  const save = useSaveManufacturer()
  const remove = useDeleteManufacturer()
  const prompt = usePrompt()
  const [draft, setDraft] = useState<Draft | null>(null)

  const submit = () => {
    if (!draft) return
    const { id, name, manufacturer, outside_eu, responsible } = draft
    const full = (p: Draft["manufacturer"]) => ({
      name: p.name ?? null,
      trade_name: p.trade_name ?? null,
      postal_address: p.postal_address ?? null,
      electronic_address: p.electronic_address ?? null,
    })
    save.mutate(
      { id, name, manufacturer: full(manufacturer), outside_eu, responsible: full(responsible) },
      {
        onSuccess: () => {
          toast.success(t("compliance.gpsr.profileSaved"))
          setDraft(null)
        },
        onError: (error) => toast.error(errorMessage(error)),
      }
    )
  }

  const destroy = async (m: Manufacturer) => {
    const ok = await prompt({
      title: t("compliance.gpsr.deleteProfile"),
      description: t("compliance.gpsr.deleteProfileHint", { name: m.name }),
      confirmText: t("compliance.delete"),
      cancelText: t("compliance.cancel"),
    })
    if (!ok) return
    remove.mutate(m.id, {
      onSuccess: () => toast.success(t("compliance.gpsr.profileDeleted")),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <Container className="flex flex-col gap-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading level="h2">{t("compliance.gpsr.profilesTitle")}</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            {t("compliance.gpsr.profilesHint")}
          </Text>
        </div>
        <Button size="small" variant="secondary" disabled={demo} onClick={() => setDraft(emptyDraft())}>
          <Plus />
          {t("compliance.gpsr.newProfile")}
        </Button>
      </div>
      {list.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !list.data?.manufacturers.length ? (
        <Empty>{t("compliance.gpsr.noProfiles")}</Empty>
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell>{t("compliance.gpsr.profile")}</Table.HeaderCell>
              <Table.HeaderCell>{t("compliance.gpsr.fields.electronic_address")}</Table.HeaderCell>
              <Table.HeaderCell>{t("compliance.gpsr.outsideEu")}</Table.HeaderCell>
              <Table.HeaderCell>{t("compliance.gpsr.products")}</Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {list.data.manufacturers.map((m) => (
              <Table.Row key={m.id}>
                <Table.Cell>
                  <Text size="small" weight="plus">
                    {m.name}
                  </Text>
                  <Text size="xsmall" className="text-ui-fg-subtle">
                    {m.manufacturer.name ?? "—"}
                  </Text>
                </Table.Cell>
                <Table.Cell>{m.manufacturer.electronic_address ?? "—"}</Table.Cell>
                <Table.Cell>{m.outside_eu ? t("compliance.yes") : t("compliance.no")}</Table.Cell>
                <Table.Cell>{m.products}</Table.Cell>
                <Table.Cell className="text-right">
                  <IconButton size="small" variant="transparent" disabled={demo} onClick={() => setDraft(m)}>
                    <PencilSquare />
                  </IconButton>
                  <IconButton
                    size="small"
                    variant="transparent"
                    disabled={demo || m.products > 0}
                    onClick={() => void destroy(m)}
                  >
                    <Trash />
                  </IconButton>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}

      <Drawer open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>
              {draft?.id ? t("compliance.gpsr.editProfile") : t("compliance.gpsr.newProfile")}
            </Drawer.Title>
          </Drawer.Header>
          {draft && (
            <Drawer.Body className="flex flex-col gap-y-4 overflow-y-auto">
              <TextField
                label={t("compliance.gpsr.profileName")}
                hint={t("compliance.gpsr.profileNameHint")}
                value={draft.name}
                onChange={(name) => setDraft({ ...draft, name })}
              />
              <Section title={t("compliance.gpsr.manufacturer")}>
                <PartyFields
                  value={draft.manufacturer}
                  onChange={(manufacturer) => setDraft({ ...draft, manufacturer })}
                />
              </Section>
              <Toggle
                label={t("compliance.gpsr.outsideEuToggle")}
                hint={t("compliance.gpsr.outsideEuToggleHint")}
                checked={draft.outside_eu}
                onChange={(outside_eu) => setDraft({ ...draft, outside_eu })}
              />
              {draft.outside_eu && (
                <Section title={t("compliance.gpsr.responsible")} hint={t("compliance.gpsr.responsibleHint")}>
                  <PartyFields
                    value={draft.responsible}
                    onChange={(responsible) => setDraft({ ...draft, responsible })}
                  />
                </Section>
              )}
            </Drawer.Body>
          )}
          <Drawer.Footer>
            <Drawer.Close asChild>
              <Button size="small" variant="secondary">
                {t("compliance.cancel")}
              </Button>
            </Drawer.Close>
            <Button size="small" onClick={submit} isLoading={save.isPending} disabled={!draft?.name.trim()}>
              {t("compliance.save")}
            </Button>
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer>
    </Container>
  )
}
