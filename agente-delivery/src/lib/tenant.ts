import { createClient } from '@/lib/supabase/server'
import { getTenantByEmail, getTenantById } from '@/tenants.config'
import type { Tenant } from '@/tenants.config'

export type { Tenant }
export { getTenantByEmail, getTenantById } from '@/tenants.config'

export async function getSessionTenant(): Promise<Tenant | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  return getTenantByEmail(user.email)
}
