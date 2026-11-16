import { Button, Checkbox, Container, Heading, Input, Label, Text } from "@medusajs/ui"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { useCheckBankAccount, useVerifyNumber } from "../../lib/whitelist-vat/api"
import { errorMessage } from "../../lib/whitelist-vat/kit/format"
import { CompanyDetails, SourceList, TaxId, VerdictBadge } from "./shared"

/** Manual checks: a tax ID against the registers, and a bank account against the white list. */
export const Lookup = ({ bankAccounts }: { bankAccounts: boolean }) => (
  <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-2">
    <NumberLookup />
    {bankAccounts && <BankAccountLookup />}
  </div>
)

const NumberLookup = () => {
  const { t } = useTranslation()
  const verify = useVerifyNumber()
  const [number, setNumber] = useState("")
  const [force, setForce] = useState(false)
  const result = verify.data

  const submit = () => {
    if (number.trim() && !verify.isPending) {
      verify.mutate({ number: number.trim(), force })
    }
  }

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("whitelist-vat.lookup.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("whitelist-vat.lookup.subtitle")}
        </Text>
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex items-center gap-x-2">
          <div className="flex-1">
            <Input
              aria-label={t("whitelist-vat.subjects.number")}
              placeholder={t("whitelist-vat.lookup.placeholder")}
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submit()
                }
              }}
            />
          </div>
          <Button size="small" disabled={!number.trim()} isLoading={verify.isPending} onClick={submit}>
            {t("whitelist-vat.lookup.submit")}
          </Button>
        </div>
        <div className="flex items-center gap-x-2">
          <Checkbox
            id="whitelist-vat-force"
            checked={force}
            onCheckedChange={(checked) => setForce(checked === true)}
          />
          <Label size="small" htmlFor="whitelist-vat-force">
            {t("whitelist-vat.lookup.force")}
          </Label>
        </div>
        {verify.isError && (
          <Text size="small" className="text-ui-fg-error">
            {t("whitelist-vat.lookup.failed", { error: errorMessage(verify.error) })}
          </Text>
        )}
      </div>

      {result && (
        <>
          <div className="flex flex-col gap-y-2 px-6 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <TaxId number={result.verification.tax_id.number || result.verification.tax_id.input} />
              <VerdictBadge status={result.verification.status} stale={result.verification.stale} />
            </div>
            <Text size="small" className="text-ui-fg-subtle">
              {result.verification.tax_id.problem
                ? t(`whitelist-vat.problem.${result.verification.tax_id.problem}`)
                : t(`whitelist-vat.statusHint.${result.verification.status}`)}
            </Text>
          </div>

          {result.verification.tax_id.valid && (
            <div className="flex flex-col gap-y-2 px-6 py-4">
              <Text size="small" weight="plus">
                {t("whitelist-vat.lookup.registers")}
              </Text>
              <SourceList sources={result.verification.sources} />
            </div>
          )}

          {result.verification.company && (
            <div className="flex flex-col gap-y-2 px-6 py-4">
              <Text size="small" weight="plus">
                {t("whitelist-vat.lookup.company")}
              </Text>
              <CompanyDetails
                company={result.verification.company}
                accounts={result.verification.tax_id.kind === "nip"}
              />
            </div>
          )}
        </>
      )}
    </Container>
  )
}

const BankAccountLookup = () => {
  const { t } = useTranslation()
  const check = useCheckBankAccount()
  const [nip, setNip] = useState("")
  const [account, setAccount] = useState("")
  const result = check.data
  const ready = nip.trim().length >= 10 && account.replace(/\D/g, "").length >= 26

  return (
    <Container className="overflow-hidden divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">{t("whitelist-vat.bank.title")}</Heading>
        <Text size="small" className="text-ui-fg-subtle">
          {t("whitelist-vat.bank.subtitle")}
        </Text>
      </div>

      <div className="flex flex-col gap-y-3 px-6 py-4">
        <div className="flex flex-col gap-y-1">
          <Label size="small" htmlFor="whitelist-vat-bank-nip">
            {t("whitelist-vat.bank.nip")}
          </Label>
          <Input id="whitelist-vat-bank-nip" value={nip} onChange={(event) => setNip(event.target.value)} />
        </div>
        <div className="flex flex-col gap-y-1">
          <Label size="small" htmlFor="whitelist-vat-bank-account">
            {t("whitelist-vat.bank.account")}
          </Label>
          <Input id="whitelist-vat-bank-account" value={account} onChange={(event) => setAccount(event.target.value)} />
        </div>
        <div>
          <Button
            size="small"
            disabled={!ready}
            isLoading={check.isPending}
            onClick={() => check.mutate({ nip: nip.trim(), account: account.trim() })}
          >
            {t("whitelist-vat.bank.submit")}
          </Button>
        </div>
        {check.isError && (
          <Text size="small" className="text-ui-fg-error">
            {t("whitelist-vat.lookup.failed", { error: errorMessage(check.error) })}
          </Text>
        )}
      </div>

      {result && (
        <div className="flex flex-col gap-y-1 px-6 py-4">
          {result.problem ? (
            <Text size="small" className={result.problem === "unavailable" ? "text-ui-fg-subtle" : "text-ui-fg-error"}>
              {t(`whitelist-vat.bank.${result.problem}`, { error: result.error ?? "" })}
            </Text>
          ) : (
            <Text
              size="small"
              weight="plus"
              className={result.assigned ? "text-ui-tag-green-text" : "text-ui-fg-error"}
            >
              {result.assigned ? t("whitelist-vat.bank.assigned") : t("whitelist-vat.bank.notAssigned")}
            </Text>
          )}
          {result.request_id && (
            <Text size="xsmall" className="text-ui-fg-subtle font-mono">
              {t("whitelist-vat.bank.proof", { id: result.request_id })}
            </Text>
          )}
        </div>
      )}
    </Container>
  )
}
