import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { SHOP_QUERY } from '~/graphql/queries'
import logger from '~/utils/logger'
import { proxyMiddleware } from '~/utils/middleware/proxy-middleware'

export const Route = createFileRoute('/api/proxy-endpoint')({
  server: {
    middleware: [proxyMiddleware],
    handlers: {
      GET: async ({ context }) => {
        try {
          const { graphql } = context

          const shopResponse = await graphql.request(SHOP_QUERY)

          return json(shopResponse.data)
        } catch (e) {
          logger.error('❌ Error in products API:', e)

          const errorMessage = e instanceof Error ? e.message : 'Unknown error'

          // Return appropriate status codes based on error type
          if (errorMessage.includes('Invalid Shopify proxy request')) {
            return new Response('Unauthorized', { status: 401 })
          }

          if (errorMessage.includes('Missing shop parameter')) {
            return new Response('Bad Request: Missing shop parameter', {
              status: 400,
            })
          }

          if (
            errorMessage.includes('Shop not found') ||
            errorMessage.includes('No valid session')
          ) {
            return new Response(`Not Found: ${errorMessage}`, { status: 404 })
          }

          return new Response(`Internal Server Error: ${errorMessage}`, {
            status: 500,
          })
        }
      },
    },
  },
})
