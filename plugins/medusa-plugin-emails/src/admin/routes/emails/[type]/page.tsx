import {
  Badge,
  Button,
  Container,
  Heading,
  Input,
  Label,
  Select,
  Skeleton,
  Switch,
  Text,
  Textarea,
  toast,
  usePrompt,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"
import { Trans, useTranslation } from "react-i18next"
import { Link, useParams } from "react-router-dom"

import { formatRecipients, parseRecipients } from "../../../components/emails/recipients"
import {
  type CopyDraft,
  type EmailLocale,
  type EmailTypeDetail,
  useEmailPreview,
  useEmailType,
  useRecentOrders,
  useResetEmailType,
  useSendTestEmail,
  useUpdateEmailType,
} from "../../../lib/emails/api"
import { errorMessage } from "../../../lib/emails/kit/format"
import { languageName } from "../../../lib/emails/languages"

const COMMON = "common"
const LATEST = "latest"

type Draft = Record<EmailLocale, Record<string, string>>

const toDraft = (detail: EmailTypeDetail): Draft =>
  Object.fromEntries(
    detail.locales.map((locale) => [
      locale,
      Object.fromEntries(detail.fields.map(({ key }) => [key, detail.copy[locale]?.[key]?.value ?? ""])),
    ])
  ) as Draft

/** Fields of a translation that would be sent in the base language, as the draft stands. */
const countMissing = (detail: EmailTypeDetail, draft: Draft, locale: EmailLocale) =>
  locale === detail.base_locale
    ? 0
    : detail.fields.filter(({ key }) => {
        const field = detail.copy[locale]?.[key]
        return !draft[locale]?.[key]?.trim() && !field?.default.trim() && Boolean(field?.original.trim())
      }).length

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Editor of one email type: toggle, text per language, live preview, test send and reset. */
const EmailTypePage = () => {
  const { t } = useTranslation()
  const { type = "" } = useParams()
  const query = useEmailType(type)
  const detail = query.data?.email_type

  if (query.isLoading) {
    return (
      <Container className="p-6">
        <Skeleton className="h-48 w-full" />
      </Container>
    )
  }
  if (!detail) {
    return (
      <Container className="flex flex-col gap-y-3 p-6">
        <Text size="small" className="text-ui-fg-error">
          {query.error ? errorMessage(query.error) : t("emails.editor.notFound")}
        </Text>
        <div>
          <Button size="small" variant="secondary" asChild>
            <Link to="/emails">{t("emails.editor.back")}</Link>
          </Button>
        </div>
      </Container>
    )
  }
  // Remount when the server copy changes, so the draft starts from what is saved.
  return <Editor key={`${type}:${query.dataUpdatedAt}`} type={type} detail={detail} />
}

const Editor = ({ type, detail }: { type: string; detail: EmailTypeDetail }) => {
  const { t, i18n } = useTranslation()
  const prompt = usePrompt()
  const isCommon = type === COMMON
  const summary = "audience" in detail ? detail : null
  const name = t(`emails.types.${type}.name`, { defaultValue: type })
  const languageLabel = (code: EmailLocale) => languageName(code, detail.locales, i18n.language)

  const saved = useMemo(() => toDraft(detail), [detail])
  const [draft, setDraft] = useState<Draft>(saved)
  const [locale, setLocale] = useState<EmailLocale>(detail.base_locale)
  const [orderId, setOrderId] = useState<string>(LATEST)
  const isOriginal = locale === detail.base_locale

  const update = useUpdateEmailType(type)
  const reset = useResetEmailType(type)

  const dirty = detail.locales.some((l) => detail.fields.some(({ key }) => draft[l][key] !== saved[l][key]))
  const debouncedDraft = useDebounced(draft, 500)
  const preview = useEmailPreview(
    type,
    {
      locale,
      order_id: orderId === LATEST ? undefined : orderId,
      copy: dirty ? (debouncedDraft as CopyDraft) : undefined,
    },
    !isCommon
  )
  const orders = useRecentOrders()

  const setField = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [locale]: { ...current[locale], [key]: value } }))

  const onSave = () =>
    update.mutate(
      { copy: draft },
      {
        onSuccess: () => toast.success(t("emails.editor.saved")),
        onError: (error) => toast.error(`${t("emails.editor.saveError")} ${errorMessage(error)}`),
      }
    )

  const onReset = async () => {
    const confirmed = await prompt({
      title: t("emails.reset.copyTitle"),
      description: t("emails.reset.copyDescription", { name }),
      verificationText: type,
      confirmText: t("emails.reset.confirm"),
      cancelText: t("emails.reset.cancel"),
      variant: "danger",
    })
    if (!confirmed) {
      return
    }
    reset.mutate("copy", {
      onSuccess: () => toast.success(t("emails.reset.done")),
      onError: (error) => toast.error(`${t("emails.reset.error")} ${errorMessage(error)}`),
    })
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Container className="divide-y p-0">
        <div className="flex items-center justify-between gap-x-4 px-6 py-4">
          <div className="min-w-0">
            <Link to="/emails" className="text-ui-fg-subtle txt-small hover:text-ui-fg-base">
              ← {t("emails.editor.back")}
            </Link>
            <div className="mt-1 flex flex-wrap items-center gap-x-2">
              <Heading>{name}</Heading>
              {summary?.custom && <Badge size="2xsmall">{t("emails.list.custom")}</Badge>}
              {detail.edited && <Badge size="2xsmall">{t("emails.list.edited")}</Badge>}
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {t(`emails.types.${type}.description`, { defaultValue: "" })}
            </Text>
          </div>
          {summary && (
            <div className="flex shrink-0 items-center gap-x-2">
              <Label size="small" htmlFor="emails-type-enabled">
                {t("emails.editor.enabled")}
              </Label>
              <Switch
                id="emails-type-enabled"
                checked={summary.enabled}
                disabled={update.isPending}
                onCheckedChange={(checked) =>
                  update.mutate(
                    { enabled: checked },
                    { onError: (error) => toast.error(`${t("emails.list.toggleError")} ${errorMessage(error)}`) }
                  )
                }
              />
            </div>
          )}
        </div>
        {summary?.audience === "team" && <TypeRecipients type={type} recipients={summary.recipients} />}
      </Container>

      <div className={isCommon ? "flex flex-col gap-y-3" : "grid grid-cols-1 items-start gap-3 xl:grid-cols-2"}>
        <Container className="divide-y p-0">
          <div className="flex items-center justify-between gap-x-4 px-6 py-4">
            <div>
              <Heading level="h2">{t("emails.editor.text")}</Heading>
              <Text size="small" className="text-ui-fg-subtle">
                {dirty
                  ? t("emails.editor.unsaved")
                  : isOriginal
                    ? t("emails.editor.textHint")
                    : t("emails.editor.textHintTranslation", { language: languageLabel(detail.base_locale) })}
              </Text>
            </div>
            <LanguagePicker
              detail={detail}
              locale={locale}
              onChange={setLocale}
              label={languageLabel}
              missing={(code) => countMissing(detail, draft, code)}
            />
          </div>
          {detail.translation_enabled && detail.locales.length < 2 && (
            <div className="px-6 py-3">
              <Text size="small" className="text-ui-fg-subtle">
                <Trans
                  i18nKey="emails.editor.noLanguages"
                  components={{
                    link: (
                      <Link
                        to="/settings/store"
                        className="text-ui-fg-interactive hover:text-ui-fg-interactive-hover"
                      />
                    ),
                  }}
                />
              </Text>
            </div>
          )}

          <div className="flex flex-col gap-y-4 px-6 py-4">
            {detail.fields.map(({ key, multiline }) => {
              const field = detail.copy[locale]?.[key]
              const value = draft[locale][key] ?? ""
              const isDefault = value === (field?.default ?? "") || value.trim() === ""
              // A language without text of its own shows the original it falls back to.
              const placeholder = field?.default || field?.original
              const id = `emails-copy-${locale}-${key}`
              return (
                <div key={`${locale}:${key}`} className="flex flex-col gap-y-1">
                  <div className="flex items-center justify-between gap-x-2">
                    <Label size="small" htmlFor={id}>
                      {t(`emails.copyKeys.${key}`, { defaultValue: key })}
                    </Label>
                    {!isDefault && (
                      <div className="flex items-center gap-x-2">
                        <Badge size="2xsmall">{t("emails.editor.fieldEdited")}</Badge>
                        <Button size="small" variant="transparent" onClick={() => setField(key, field?.default ?? "")}>
                          {field?.default ? t("emails.editor.restoreField") : t("emails.editor.useOriginal")}
                        </Button>
                      </div>
                    )}
                  </div>
                  {multiline ? (
                    <Textarea
                      id={id}
                      rows={5}
                      maxLength={2000}
                      value={value}
                      placeholder={placeholder}
                      onChange={(event) => setField(key, event.target.value)}
                    />
                  ) : (
                    <Input
                      id={id}
                      maxLength={2000}
                      value={value}
                      placeholder={placeholder}
                      onChange={(event) => setField(key, event.target.value)}
                    />
                  )}
                </div>
              )
            })}
          </div>

          <div className="px-6 py-4">
            <Text size="small" weight="plus">
              {t("emails.editor.variables")}
            </Text>
            <Text size="small" className="text-ui-fg-subtle">
              {detail.variables ? t("emails.editor.variablesHint") : t("emails.editor.anyVariables")}
            </Text>
            {detail.variables && (
              <div className="mt-2 flex flex-wrap gap-1">
                {detail.variables.map((variable) => (
                  <Badge key={variable} size="2xsmall" className="font-mono">{`{{${variable}}}`}</Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-x-2 px-6 py-4">
            <Button
              size="small"
              variant="danger"
              disabled={!detail.edited}
              isLoading={reset.isPending}
              onClick={onReset}
            >
              {t("emails.reset.copy")}
            </Button>
            <div className="flex items-center gap-x-2">
              <Button size="small" variant="secondary" disabled={!dirty} onClick={() => setDraft(saved)}>
                {t("emails.editor.discard")}
              </Button>
              <Button size="small" disabled={!dirty} isLoading={update.isPending} onClick={onSave}>
                {t("emails.editor.save")}
              </Button>
            </div>
          </div>
        </Container>

        {!isCommon && (
          <div className="flex flex-col gap-y-3">
            <Container className="divide-y p-0">
              <div className="flex items-center justify-between gap-x-4 px-6 py-4">
                <div>
                  <Heading level="h2">{t("emails.editor.preview")}</Heading>
                  <Text size="small" className="text-ui-fg-subtle">
                    {dirty
                      ? t("emails.editor.previewUnsaved")
                      : preview.data && !preview.data.preview.order
                        ? t("emails.editor.previewSample")
                        : languageLabel(locale)}
                  </Text>
                </div>
                {(orders.data?.orders.length ?? 0) > 0 && (
                  <div className="w-56">
                    <Select size="small" value={orderId} onValueChange={setOrderId}>
                      <Select.Trigger aria-label={t("emails.editor.previewOrder")}>
                        <Select.Value />
                      </Select.Trigger>
                      <Select.Content>
                        <Select.Item value={LATEST}>{t("emails.editor.previewLatest")}</Select.Item>
                        {orders.data?.orders.map((order) => (
                          <Select.Item key={order.id} value={order.id}>
                            #{order.display_id}
                            {order.email ? ` · ${order.email}` : ""}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select>
                  </div>
                )}
              </div>

              {preview.isError && (
                <Text size="small" className="text-ui-fg-error px-6 py-4">
                  {t("emails.editor.previewError")} {errorMessage(preview.error)}
                </Text>
              )}
              {preview.isLoading && (
                <div className="px-6 py-4">
                  <Skeleton className="h-96 w-full" />
                </div>
              )}
              {preview.data && (
                <>
                  <div className="px-6 py-3">
                    <Text size="xsmall" className="text-ui-fg-subtle">
                      {t("emails.editor.subject")}
                    </Text>
                    <Text size="small" weight="plus">
                      {preview.data.preview.subject}
                    </Text>
                    {preview.data.preview.to && (
                      <Text size="xsmall" className="text-ui-fg-subtle">
                        {t("emails.editor.to")}: {preview.data.preview.to}
                      </Text>
                    )}
                  </div>
                  {/* The email is shown as mail clients would: no scripts, no access to the admin. */}
                  <iframe
                    title={t("emails.editor.preview")}
                    sandbox=""
                    srcDoc={preview.data.preview.html}
                    className="h-[720px] w-full rounded-b-lg border-0 bg-white"
                  />
                </>
              )}
            </Container>

            <TestSend type={type} locale={locale} orderId={orderId === LATEST ? undefined : orderId} />
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The language being edited: a select of the store's languages (the original
 * first, the others with what they still miss), or just the language's name
 * when there is only one.
 */
const LanguagePicker = ({
  detail,
  locale,
  onChange,
  label,
  missing,
}: {
  detail: EmailTypeDetail
  locale: EmailLocale
  onChange: (locale: EmailLocale) => void
  label: (code: EmailLocale) => string
  missing: (code: EmailLocale) => number
}) => {
  const { t } = useTranslation()
  const itemLabel = (code: EmailLocale) =>
    code === detail.base_locale ? t("emails.editor.languageOriginal", { language: label(code) }) : label(code)

  if (detail.locales.length < 2) {
    return (
      <Text size="small" className="text-ui-fg-subtle shrink-0">
        {itemLabel(detail.base_locale)}
      </Text>
    )
  }
  return (
    <div className="w-64 shrink-0">
      <Select size="small" value={locale} onValueChange={onChange}>
        <Select.Trigger aria-label={t("emails.editor.language")}>
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          {detail.locales.map((code) => {
            const count = missing(code)
            return (
              <Select.Item key={code} value={code}>
                {itemLabel(code)}
                {count > 0 && <span className="text-ui-fg-subtle"> · {t("emails.editor.missing", { count })}</span>}
              </Select.Item>
            )
          })}
        </Select.Content>
      </Select>
    </div>
  )
}

/** Recipients of one store team alert, when they differ from the general list. */
const TypeRecipients = ({ type, recipients }: { type: string; recipients: string[] | null }) => {
  const { t } = useTranslation()
  const update = useUpdateEmailType(type)
  const [text, setText] = useState(formatRecipients(recipients))
  const parsed = parseRecipients(text)
  const dirty = formatRecipients(parsed.valid) !== formatRecipients(recipients)

  return (
    <div className="flex flex-col gap-y-1 px-6 py-4">
      <Label size="small" htmlFor="emails-type-recipients">
        {t("emails.editor.recipients")}
      </Label>
      <Textarea id="emails-type-recipients" rows={2} value={text} onChange={(event) => setText(event.target.value)} />
      <Text size="xsmall" className={parsed.invalid.length ? "text-ui-fg-error" : "text-ui-fg-subtle"}>
        {parsed.invalid.length
          ? t("emails.general.recipientsInvalid", { addresses: parsed.invalid.join(", ") })
          : t("emails.editor.recipientsHint")}
      </Text>
      <div>
        <Button
          size="small"
          variant="secondary"
          disabled={!dirty || parsed.invalid.length > 0}
          isLoading={update.isPending}
          onClick={() =>
            update.mutate(
              { recipients: parsed.valid },
              {
                onSuccess: () => toast.success(t("emails.general.saved")),
                onError: (error) => toast.error(`${t("emails.general.saveError")} ${errorMessage(error)}`),
              }
            )
          }
        >
          {t("emails.editor.recipientsSave")}
        </Button>
      </div>
    </div>
  )
}

const TestSend = ({ type, locale, orderId }: { type: string; locale: EmailLocale; orderId?: string }) => {
  const { t } = useTranslation()
  const send = useSendTestEmail(type)
  const [to, setTo] = useState("")
  const valid = parseRecipients(to).valid.length === 1 && parseRecipients(to).invalid.length === 0

  const onSend = () =>
    send.mutate(
      { to: to.trim(), locale, order_id: orderId },
      {
        onSuccess: (outcome) => {
          if (outcome.status === "sent") {
            toast.success(t("emails.test.sent", { to: to.trim() }))
          } else if (outcome.status === "demo") {
            toast.info(t("emails.test.demo"))
          } else {
            toast.error(t("emails.test.failed", { error: outcome.error ?? outcome.reason ?? outcome.status }))
          }
        },
        onError: (error) => toast.error(t("emails.test.failed", { error: errorMessage(error) })),
      }
    )

  return (
    <Container className="flex flex-col gap-y-3 px-6 py-4">
      <div>
        <Heading level="h2">{t("emails.test.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("emails.test.hint")}
        </Text>
      </div>
      <div className="flex items-center gap-x-2">
        <div className="flex-1">
          <Input
            type="email"
            aria-label={t("emails.editor.to")}
            placeholder={t("emails.test.placeholder")}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && valid && !send.isPending) {
                onSend()
              }
            }}
          />
        </div>
        <Button size="small" disabled={!valid} isLoading={send.isPending} onClick={onSend}>
          {t("emails.test.send")}
        </Button>
      </div>
    </Container>
  )
}

export default EmailTypePage
