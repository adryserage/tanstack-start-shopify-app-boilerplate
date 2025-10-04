import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { db } from '~/db'
import { sessions, shops } from '~/db/schema'
import logger from '~/utils/logger'
import { verifyShopifyWebhook } from '~/utils/shopify-proxy'

export const Route = createFileRoute('/api/webhooks/app/compliance')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { valid, shopDomain, webhookTopic } =
            await verifyShopifyWebhook(request)

          if (!valid || !shopDomain || !webhookTopic) {
            logger.error('❌ Invalid compliance webhook', {
              shopDomain,
              webhookTopic,
            })

            return new Response('Invalid webhook', { status: 401 })
          }

          logger.info(`Received ${webhookTopic} webhook for ${shopDomain}`)

          switch (webhookTopic) {
            case 'customers/data_request':
              logger.info(
                `Handled customers/data_request webhook for shop: ${shopDomain}`
              )

              return new Response('No customer data stored', { status: 200 })
            case 'customers/redact':
              logger.info(
                `Handled customers/redact webhook for shop: ${shopDomain}`
              )

              return new Response('No customer data stored', { status: 200 })
            case 'shop/redact':
              await db.delete(sessions).where(eq(sessions.shop, shopDomain))
              await db.delete(shops).where(eq(shops.domain, shopDomain))

              logger.info(`Handled shop/redact webhook for shop: ${shopDomain}`)

              return new Response('No shop data stored', { status: 200 })
            default:
              logger.info(`Unhandled compliance webhook topic: ${webhookTopic}`)
              return new Response('OK', { status: 200 })
          }
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
