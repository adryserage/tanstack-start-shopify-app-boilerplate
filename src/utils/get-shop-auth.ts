import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/utils/middleware/auth-middleware'

/**
 * Server function to get shop authentication data.
 * Returns session and shop information for the authenticated user.
 * Uses React Query cache key 'shop-auth' for automatic caching.
 */
export const getShopAuth = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(({ context }) => {
    return {
      session: context.session,
      shop: context.shop,
    }
  })
