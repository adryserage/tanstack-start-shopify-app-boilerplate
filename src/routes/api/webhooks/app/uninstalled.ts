import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { sessions } from '~/db/schema'
import logger from '~/utils/logger'
import { verifyShopifyWebhook } from '~/utils/shopify-proxy'

export const Route = createFileRoute('/api/webhooks/app/uninstalled')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { valid, shopDomain } = await verifyShopifyWebhook(request)

          if (!valid || !shopDomain) {
            logger.error('❌ Invalid uninstall webhook', {
              shopDomain,
            })

            return new Response('Invalid webhook', { status: 401 })
          }

          logger.info(`Received app_uninstalled webhook for ${shopDomain}`)

          // Delete all sessions for the uninstalled shop
          await db.delete(sessions).where(eq(sessions.shop, shopDomain))

          return new Response('OK', { status: 200 })
        } catch (e) {
          logger.error('❌ Webhook processing failed:', e)

          // Return 401 for authentication failures, 500 for other errors
          const status =
            e instanceof Error && e.message.includes('Invalid Shopify webhook')
              ? 401
              : 500

          return new Response('Error processing webhook', { status })
        }
      },
    },
  },
})
