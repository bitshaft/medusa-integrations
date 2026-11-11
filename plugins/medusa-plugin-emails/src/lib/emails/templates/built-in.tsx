import { Column, Row, Section, Text } from "@react-email/components"

import type { EmailTemplate, EmailTemplateProps } from "../types"
import { Divider, Highlight, InfoRows, OrderSummary, QuantityList, StandardEmail, styles } from "./kit"

/* Customer ---------------------------------------------------------------- */

const OrderConfirmation: EmailTemplate = (props) => (
  <StandardEmail {...props}>
    {props.data.order ? <OrderSummary {...props} order={props.data.order} /> : null}
  </StandardEmail>
)

const PaymentReceived: EmailTemplate = (props) => {
  const { data, brand, common, format } = props
  return (
    <StandardEmail {...props}>
      <InfoRows
        brand={brand}
        rows={[
          [common.order_number, data.order ? `#${data.order.display_id}` : null],
          [common.amount, data.payment ? format.money(data.payment.amount, data.payment.currency_code) : null],
        ]}
      />
    </StandardEmail>
  )
}

const Shipment = (props: EmailTemplateProps) => {
  const { data, brand, common } = props
  return (
    <>
      <InfoRows
        brand={brand}
        rows={[
          [common.order_number, data.order ? `#${data.order.display_id}` : null],
          [common.tracking_number, data.shipment?.tracking.map((entry) => entry.number).join(", ")],
          [common.shipping_method, data.order?.shipping_methods.join(", ")],
        ]}
      />
      <QuantityList brand={brand} items={data.shipment?.items ?? []} />
    </>
  )
}

const OrderShipped: EmailTemplate = (props) => (
  <StandardEmail {...props}>
    <Shipment {...props} />
  </StandardEmail>
)

const OrderDelivered: EmailTemplate = (props) => (
  <StandardEmail {...props}>
    <Shipment {...props} />
  </StandardEmail>
)

const OrderCanceled: EmailTemplate = (props) => (
  <StandardEmail {...props}>
    {props.data.order ? <OrderSummary {...props} order={props.data.order} addresses={false} /> : null}
  </StandardEmail>
)

const RefundIssued: EmailTemplate = (props) => {
  const { data, brand, common, format } = props
  return (
    <StandardEmail {...props}>
      {data.refund ? (
        <Highlight brand={brand}>{format.money(data.refund.amount, data.refund.currency_code)}</Highlight>
      ) : null}
      <InfoRows
        brand={brand}
        rows={[
          [common.order_number, data.order ? `#${data.order.display_id}` : null],
          [common.reason, data.refund?.note],
        ]}
      />
    </StandardEmail>
  )
}

const Return: EmailTemplate = (props) => {
  const { data, brand, common } = props
  return (
    <StandardEmail {...props}>
      <InfoRows brand={brand} rows={[[common.order_number, data.order ? `#${data.order.display_id}` : null]]} />
      <QuantityList brand={brand} items={data.return?.items ?? []} />
    </StandardEmail>
  )
}

/* Account ----------------------------------------------------------------- */

const Welcome: EmailTemplate = (props) => <StandardEmail {...props} />

const EmailVerification: EmailTemplate = (props) => {
  const { data, brand, common } = props
  return (
    <StandardEmail {...props}>
      {data.code ? <Highlight brand={brand}>{data.code}</Highlight> : null}
      {data.expires_at && common.code_expires ? <Text style={styles.small(brand)}>{common.code_expires}</Text> : null}
    </StandardEmail>
  )
}

const PasswordReset: EmailTemplate = (props) => <StandardEmail {...props} />

/* Store team -------------------------------------------------------------- */

const TeamNewOrder: EmailTemplate = (props) => (
  <StandardEmail {...props}>
    {props.data.order ? <OrderSummary {...props} order={props.data.order} /> : null}
  </StandardEmail>
)

const TeamLowStock: EmailTemplate = (props) => {
  const { data, brand, common } = props
  const cell = styles.text(brand, { fontSize: "14px", lineHeight: "20px", margin: "0 0 6px" })
  return (
    <StandardEmail {...props}>
      <Section style={{ margin: "0 0 16px" }}>
        <Row>
          <Column>
            <Text style={styles.label(brand)}>{common.item}</Text>
          </Column>
          <Column style={{ width: "150px" }}>
            <Text style={styles.label(brand)}>{common.location}</Text>
          </Column>
          <Column style={{ width: "80px", textAlign: "right" }}>
            <Text style={styles.label(brand)}>{common.available}</Text>
          </Column>
        </Row>
        <Divider brand={brand} />
        {(data.low_stock?.items ?? []).map((item, index) => (
          <Row key={index}>
            <Column style={{ verticalAlign: "top" }}>
              <Text style={cell}>
                {item.title}
                {item.sku ? (
                  <span style={{ color: brand.colors.muted }}>
                    {" "}
                    · {common.sku} {item.sku}
                  </span>
                ) : null}
              </Text>
            </Column>
            <Column style={{ width: "150px", verticalAlign: "top" }}>
              <Text style={cell}>{item.location ?? ""}</Text>
            </Column>
            <Column style={{ width: "80px", textAlign: "right", verticalAlign: "top" }}>
              <Text style={{ ...cell, fontWeight: 700 }}>{item.available}</Text>
            </Column>
          </Row>
        ))}
      </Section>
    </StandardEmail>
  )
}

const TeamPaymentFailed: EmailTemplate = (props) => {
  const { data, brand, common, format } = props
  const failure = data.failure ?? {}
  return (
    <StandardEmail {...props}>
      <InfoRows
        brand={brand}
        rows={[
          [common.order_number, data.order ? `#${data.order.display_id}` : null],
          [common.customer, failure.customer_email ?? data.order?.email],
          [common.amount, format.money(failure.amount, failure.currency_code)],
          [common.reason, failure.reason],
        ]}
      />
    </StandardEmail>
  )
}

/** Fallback for custom email types registered without a component. */
export const GenericEmail: EmailTemplate = (props) => <StandardEmail {...props} />

export const BUILT_IN_TEMPLATES: Record<string, EmailTemplate> = {
  "order-confirmation": OrderConfirmation,
  "payment-received": PaymentReceived,
  "order-shipped": OrderShipped,
  "order-delivered": OrderDelivered,
  "order-canceled": OrderCanceled,
  "refund-issued": RefundIssued,
  "return-requested": Return,
  "return-accepted": Return,
  welcome: Welcome,
  "email-verification": EmailVerification,
  "password-reset": PasswordReset,
  "team-new-order": TeamNewOrder,
  "team-low-stock": TeamLowStock,
  "team-payment-failed": TeamPaymentFailed,
}
