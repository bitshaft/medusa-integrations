/**
 * Building blocks of the built-in emails. Custom templates can import them
 * from `@bitshaft/medusa-plugin-emails/templates` to match the look:
 *
 * ```tsx
 * import { StandardEmail, type EmailTemplateProps } from "@bitshaft/medusa-plugin-emails/templates"
 *
 * export const AbandonedCart = (props: EmailTemplateProps) => (
 *   <StandardEmail {...props}>…</StandardEmail>
 * )
 * ```
 */
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components"
import type { CSSProperties, ReactNode } from "react"

import type { Brand, EmailTemplateProps, OrderView, QuantityLine } from "../types"

export type {
  Brand,
  EmailData,
  EmailFormatters,
  EmailTemplate,
  EmailTemplateProps,
  OrderItemView,
  OrderView,
  QuantityLine,
} from "../types"

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif"

const text = (brand: Brand, extra: CSSProperties = {}): CSSProperties => ({
  color: brand.colors.text,
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 16px",
  ...extra,
})

const small = (brand: Brand, extra: CSSProperties = {}): CSSProperties => ({
  color: brand.colors.muted,
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 8px",
  ...extra,
})

const label = (brand: Brand): CSSProperties => ({
  color: brand.colors.muted,
  fontSize: "12px",
  lineHeight: "16px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  margin: "0 0 4px",
})

/** Text with blank lines between paragraphs; single line breaks are kept. */
export function Paragraphs({ children, style }: { children?: string | null; style: CSSProperties }) {
  if (!children?.trim()) {
    return null
  }
  return (
    <>
      {children
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean)
        .map((paragraph, index) => (
          <Text key={index} style={{ ...style, whiteSpace: "pre-line" }}>
            {paragraph}
          </Text>
        ))}
    </>
  )
}

/** Page frame: logo or store name, a card with the content, and the footer. */
export function EmailLayout({
  brand,
  locale,
  common,
  audience,
  preview,
  unsubscribeUrl,
  children,
}: Pick<EmailTemplateProps, "brand" | "locale" | "common" | "audience"> & {
  preview?: string
  /** Shown as an "Unsubscribe" link in the footer (http and https links only). */
  unsubscribeUrl?: string | null
  children: ReactNode
}) {
  const footerLinks = [
    { href: brand.links.terms, text: common.terms },
    { href: brand.links.returns, text: common.returns },
    { href: brand.links.privacy, text: common.privacy },
  ].filter((link): link is { href: string; text: string } => Boolean(link.href && link.text))
  const company = [
    brand.company?.name,
    brand.company?.address,
    brand.company?.taxId,
    brand.company?.phone,
    brand.company?.email,
  ].filter(Boolean)

  const align = brand.style?.headerAlign ?? "center"
  return (
    <Html lang={locale}>
      <Head />
      {preview ? <Preview>{preview}</Preview> : null}
      <Body
        style={{
          backgroundColor: brand.colors.background,
          fontFamily: brand.style?.fontFamily ?? FONT,
          margin: 0,
          padding: "24px 0",
        }}
      >
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "0 12px" }}>
          <Section style={{ padding: "8px 0 24px", textAlign: align }}>
            {brand.logoUrl ? (
              <Img
                src={brand.logoUrl}
                alt={brand.name}
                width={brand.logoWidth}
                style={{ margin: align === "center" ? "0 auto" : "0" }}
              />
            ) : (
              <Text style={{ color: brand.colors.text, fontSize: "20px", fontWeight: 700, margin: 0 }}>
                {brand.name}
              </Text>
            )}
          </Section>

          <Section
            style={{
              backgroundColor: brand.colors.card,
              border: `1px solid ${brand.colors.border}`,
              borderRadius: `${brand.style?.cardRadius ?? 8}px`,
              padding: "32px 28px 16px",
            }}
          >
            {children}
          </Section>

          <Section style={{ padding: "20px 12px 0", textAlign: "center" }}>
            {audience === "team" ? (
              <Text style={small(brand)}>{common.team_footer}</Text>
            ) : (
              <>
                {brand.supportEmail && common.contact ? <Text style={small(brand)}>{common.contact}</Text> : null}
                {footerLinks.length ? (
                  <Text style={small(brand)}>
                    {footerLinks.map((link, index) => (
                      <span key={link.href}>
                        {index > 0 ? " · " : ""}
                        <Link href={link.href} style={{ color: brand.colors.muted, textDecoration: "underline" }}>
                          {link.text}
                        </Link>
                      </span>
                    ))}
                  </Text>
                ) : null}
                {brand.footerText ? <Text style={small(brand)}>{brand.footerText}</Text> : null}
                {company.length ? <Text style={small(brand)}>{company.join(" · ")}</Text> : null}
              </>
            )}
            {unsubscribeUrl && /^https?:\/\//i.test(unsubscribeUrl) && common.unsubscribe ? (
              <Text style={small(brand)}>
                <Link href={unsubscribeUrl} style={{ color: brand.colors.muted, textDecoration: "underline" }}>
                  {common.unsubscribe}
                </Link>
              </Text>
            ) : null}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export function PrimaryButton({ href, brand, children }: { href: string; brand: Brand; children: ReactNode }) {
  return (
    <Section style={{ margin: "8px 0 24px" }}>
      <Button
        href={href}
        style={{
          backgroundColor: brand.colors.primary,
          color: brand.colors.primaryText,
          borderRadius: `${brand.style?.buttonRadius ?? 6}px`,
          fontSize: "15px",
          fontWeight: 600,
          padding: "12px 20px",
          textDecoration: "none",
        }}
      >
        {children}
      </Button>
    </Section>
  )
}

/**
 * The shape every built-in email shares: heading, greeting, body, the
 * email's own content (`children`), button, footnote and sign-off. The
 * button shows only when the copy has a `button` text and the data has an
 * `action_url`.
 */
export function StandardEmail(props: EmailTemplateProps & { children?: ReactNode }) {
  const { brand, copy, common, data, audience, children } = props
  const firstName = data.customer?.first_name ?? data.order?.customer.first_name
  const greeting = firstName ? common.greeting : common.greeting_anonymous
  return (
    <EmailLayout
      brand={brand}
      locale={props.locale}
      common={common}
      audience={audience}
      preview={copy.preview || copy.subject}
      unsubscribeUrl={data.unsubscribe_url}
    >
      {copy.heading ? (
        <Heading as="h1" style={{ color: brand.colors.text, fontSize: "22px", lineHeight: "30px", margin: "0 0 20px" }}>
          {copy.heading}
        </Heading>
      ) : null}
      {audience !== "team" && greeting ? <Text style={text(brand)}>{greeting}</Text> : null}
      <Paragraphs style={text(brand)}>{copy.body}</Paragraphs>
      {children}
      {copy.button && data.action_url ? (
        <PrimaryButton href={data.action_url} brand={brand}>
          {copy.button}
        </PrimaryButton>
      ) : null}
      <Paragraphs style={small(brand, { margin: "0 0 16px" })}>{copy.footnote}</Paragraphs>
      {audience !== "team" ? <Paragraphs style={text(brand)}>{common.signoff}</Paragraphs> : null}
    </EmailLayout>
  )
}

export function Divider({ brand }: { brand: Brand }) {
  return <Hr style={{ borderColor: brand.colors.border, margin: "8px 0 16px" }} />
}

/** Label and value pairs, one per row. Rows without a value are skipped. */
export function InfoRows({ brand, rows }: { brand: Brand; rows: Array<[string, string | null | undefined]> }) {
  const visible = rows.filter((row): row is [string, string] => Boolean(row[1]))
  if (!visible.length) {
    return null
  }
  return (
    <Section style={{ margin: "0 0 16px" }}>
      {visible.map(([name, value]) => (
        <Row key={name}>
          <Column style={{ width: "40%", verticalAlign: "top" }}>
            <Text style={small(brand, { margin: "0 0 6px" })}>{name}</Text>
          </Column>
          <Column style={{ verticalAlign: "top" }}>
            <Text style={text(brand, { fontSize: "14px", lineHeight: "20px", margin: "0 0 6px" })}>{value}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  )
}

/** Titles with quantities, for shipments and returns. */
export function QuantityList({ brand, items }: { brand: Brand; items: QuantityLine[] }) {
  if (!items.length) {
    return null
  }
  return (
    <Section style={{ margin: "0 0 16px" }}>
      {items.map((item, index) => (
        <Row key={index}>
          <Column>
            <Text style={text(brand, { fontSize: "14px", lineHeight: "20px", margin: "0 0 6px" })}>
              {item.title}
              {item.subtitle ? <span style={{ color: brand.colors.muted }}> · {item.subtitle}</span> : null}
            </Text>
          </Column>
          <Column style={{ width: "60px", textAlign: "right", verticalAlign: "top" }}>
            <Text style={text(brand, { fontSize: "14px", lineHeight: "20px", margin: "0 0 6px" })}>
              × {item.quantity}
            </Text>
          </Column>
        </Row>
      ))}
    </Section>
  )
}

type OrderBlockProps = Pick<EmailTemplateProps, "brand" | "common" | "format"> & { order: OrderView }

export function OrderItems({ order, brand, common, format }: OrderBlockProps) {
  return (
    <Section style={{ margin: "0 0 8px" }}>
      <Row>
        <Column>
          <Text style={label(brand)}>{common.item}</Text>
        </Column>
        <Column style={{ width: "56px", textAlign: "center" }}>
          <Text style={label(brand)}>{common.quantity}</Text>
        </Column>
        <Column style={{ width: "110px", textAlign: "right" }}>
          <Text style={label(brand)}>{common.price}</Text>
        </Column>
      </Row>
      <Divider brand={brand} />
      {order.items.map((item, index) => (
        <Row key={index} style={{ marginBottom: "10px" }}>
          <Column style={{ verticalAlign: "top" }}>
            <Text style={text(brand, { fontSize: "14px", lineHeight: "20px", margin: 0 })}>{item.title}</Text>
            {item.subtitle ? <Text style={small(brand, { margin: 0 })}>{item.subtitle}</Text> : null}
          </Column>
          <Column style={{ width: "56px", textAlign: "center", verticalAlign: "top" }}>
            <Text style={text(brand, { fontSize: "14px", lineHeight: "20px", margin: 0 })}>{item.quantity}</Text>
          </Column>
          <Column style={{ width: "110px", textAlign: "right", verticalAlign: "top" }}>
            <Text style={text(brand, { fontSize: "14px", lineHeight: "20px", margin: 0 })}>
              {format.money(item.total, order.currency_code)}
            </Text>
          </Column>
        </Row>
      ))}
    </Section>
  )
}

export function OrderTotals({ order, brand, common, format }: OrderBlockProps) {
  const rows: Array<[string, number, boolean]> = [
    [common.subtotal, order.subtotal, true],
    [common.shipping, order.shipping_total, true],
    [common.discount, -order.discount_total, order.discount_total > 0],
  ]
  const line: CSSProperties = { fontSize: "14px", lineHeight: "20px", margin: "0 0 6px" }
  return (
    <Section style={{ margin: "0 0 20px" }}>
      <Divider brand={brand} />
      {rows
        .filter(([, , visible]) => visible)
        .map(([name, amount]) => (
          <Row key={name}>
            <Column>
              <Text style={small(brand, line)}>{name}</Text>
            </Column>
            <Column style={{ width: "140px", textAlign: "right" }}>
              <Text style={text(brand, line)}>{format.money(amount, order.currency_code)}</Text>
            </Column>
          </Row>
        ))}
      <Row>
        <Column>
          <Text style={text(brand, { ...line, fontWeight: 700 })}>{common.total}</Text>
        </Column>
        <Column style={{ width: "140px", textAlign: "right" }}>
          <Text style={text(brand, { ...line, fontWeight: 700 })}>
            {format.money(order.total, order.currency_code)}
          </Text>
        </Column>
      </Row>
      {order.tax_total > 0 ? (
        <Row>
          <Column>
            <Text style={small(brand, line)}>{common.tax}</Text>
          </Column>
          <Column style={{ width: "140px", textAlign: "right" }}>
            <Text style={small(brand, line)}>{format.money(order.tax_total, order.currency_code)}</Text>
          </Column>
        </Row>
      ) : null}
    </Section>
  )
}

export function OrderAddresses({ order, brand, common }: Omit<OrderBlockProps, "format">) {
  const blocks: Array<[string, string[]]> = [
    [common.shipping_address, order.shipping_address],
    [common.billing_address, order.billing_address],
  ]
  const visible = blocks.filter(([, lines]) => lines.length)
  if (!visible.length && !order.shipping_methods.length) {
    return null
  }
  return (
    <Section style={{ margin: "0 0 16px" }}>
      <Row>
        {visible.map(([title, lines]) => (
          <Column key={title} style={{ width: "50%", verticalAlign: "top", paddingRight: "8px" }}>
            <Text style={label(brand)}>{title}</Text>
            <Text style={text(brand, { fontSize: "14px", lineHeight: "20px" })}>
              {lines.map((line, index) => (
                <span key={index}>
                  {index > 0 ? <br /> : null}
                  {line}
                </span>
              ))}
            </Text>
          </Column>
        ))}
      </Row>
      {order.shipping_methods.length ? (
        <>
          <Text style={label(brand)}>{common.shipping_method}</Text>
          <Text style={text(brand, { fontSize: "14px", lineHeight: "20px" })}>{order.shipping_methods.join(", ")}</Text>
        </>
      ) : null}
    </Section>
  )
}

/** Order number and date, items, totals and addresses. */
export function OrderSummary(props: OrderBlockProps & { addresses?: boolean }) {
  const { order, brand, common, format, addresses = true } = props
  return (
    <>
      <InfoRows
        brand={brand}
        rows={[
          [common.order_number, `#${order.display_id}`],
          [common.order_date, format.date(order.created_at)],
        ]}
      />
      <OrderItems {...props} />
      <OrderTotals {...props} />
      {addresses ? <OrderAddresses order={order} brand={brand} common={common} /> : null}
    </>
  )
}

/** A highlighted box for a short value: a verification code or an amount. */
export function Highlight({ brand, children }: { brand: Brand; children: ReactNode }) {
  return (
    <Section
      style={{
        backgroundColor: brand.colors.background,
        borderRadius: "6px",
        margin: "0 0 20px",
        padding: "16px",
        textAlign: "center",
      }}
    >
      <Text style={{ color: brand.colors.text, fontSize: "24px", fontWeight: 700, letterSpacing: "0.08em", margin: 0 }}>
        {children}
      </Text>
    </Section>
  )
}

export const styles = { text, small, label }
