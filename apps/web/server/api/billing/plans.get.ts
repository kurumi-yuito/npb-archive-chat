import { listBillingPlans } from '../../utils/billing-plans'

export default defineEventHandler(async () => {
  return listBillingPlans()
})
