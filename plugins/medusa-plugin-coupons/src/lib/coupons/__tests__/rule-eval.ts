/**
 * The Promotion Module's own rule evaluation, so tests check plugin rules
 * against what core actually does rather than against a copy of it.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const core = require("@medusajs/promotion/dist/utils/validations/promotion-rule") as {
  evaluateRuleValueCondition(ruleValues: string[], operator: string, valuesToCheck: unknown): boolean
}

export const evaluateRuleValueCondition = core.evaluateRuleValueCondition
