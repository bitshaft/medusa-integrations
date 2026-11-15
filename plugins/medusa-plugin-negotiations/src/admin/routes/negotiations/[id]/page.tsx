import { ArrowLeft } from "@medusajs/icons"
import { Button, Container, Skeleton, Text } from "@medusajs/ui"
import { useTranslation } from "react-i18next"
import { Link, useParams } from "react-router-dom"

import { DemoBar, useErrorText } from "../../../components/negotiations/shared"
import { ThreadView } from "../../../components/negotiations/thread"
import { useThread } from "../../../lib/negotiations/api"

/** One negotiation: details, the conversation and the team's move. */
const NegotiationPage = () => {
  const { t } = useTranslation()
  const { id = "" } = useParams()
  const { data, isLoading, error } = useThread(id)
  const errorText = useErrorText()
  return (
    <div className="flex flex-col gap-y-3">
      <div>
        <Button size="small" variant="transparent" asChild>
          <Link to="/negotiations">
            <ArrowLeft />
            {t("negotiations.back")}
          </Link>
        </Button>
      </div>
      {data?.negotiation.is_demo && <DemoBar />}
      {isLoading && <Skeleton className="h-64 w-full" />}
      {error && (
        <Container className="p-6">
          <Text size="small" className="text-ui-fg-error">
            {errorText(error)}
          </Text>
        </Container>
      )}
      {data && <ThreadView detail={data} />}
    </div>
  )
}

export default NegotiationPage
