import crypto from 'node:crypto'
import { createMiddleware } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import type { AdminApiClient } from '@shopify/admin-api-client'
import type { SelectSession, SelectShop } from '~/db/schema'
import { sessions, shops } from '~/db/schema'
import { db } from '~/db'
import { createGraphqlClient } from '~/utils/shopify-graphql-client'
import { verifyShopifyProxyRequest } from '~/utils/shopify-proxy'
import logger from '~/utils/logger'

// Enhanced context type with better type safety
type ProxyContext = {
  session: SelectSession
  shop: SelectShop
  graphql: AdminApiClient
}

/**
 * Creates proxy context from session and shop data
 */
function createProxyContext(
  session: SelectSession,
  shop: SelectShop
): ProxyContext {
  if (!session.accessToken) {
    throw new Error('Session missing access token')
  }

  const graphql = createGraphqlClient(shop, session)

  return {
    session,
    shop,
    graphql,
  }
}

/**
 * Proxy authentication middleware for Shopify app proxy requests
 * Verifies HMAC signature and provides shop/session context
 */
export const proxyMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    try {
      const url = new URL(request.url)

      // Verify Shopify proxy signature
      const isValidRequest = verifyShopifyProxyRequest(request)

      if (!isValidRequest) {
        throw new Error('Invalid Shopify proxy request')
      }

      // Extract shop domain from query params
      const shopDomain = url.searchParams.get('shop')

      if (!shopDomain) {
        throw new Error('Missing shop parameter')
      }

      // Fetch shop and session from database
      const result = await db
        .select({
          shop: shops,
          session: sessions,
        })
        .from(shops)
        .leftJoin(sessions, eq(shops.domain, sessions.shop))
        .where(eq(shops.domain, shopDomain))
        .limit(1)

      const shop = result[0]?.shop
      const session = result[0]?.session

      if (!shop) {
        throw new Error(`Shop not found: ${shopDomain}`)
      }

      if (!session?.accessToken) {
        throw new Error(`No valid session found for shop: ${shopDomain}`)
      }

      const context = createProxyContext(session, shop)

      return next({ context })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      logger.error('Proxy middleware error:', errorMessage, error)

      throw error
    }
  }
)

/**
 * Custom API authentication middleware for direct API calls
 * Validates shop domain format and provides shop/session context
 * Does not verify Shopify proxy signature (for direct API calls)
 */
export const customApiMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    try {
      logger.info('🔑 Authenticating custom API request', request.headers)

      const url = new URL(request.url)
      const shopDomain = url.searchParams.get('shop')

      if (!shopDomain) {
        throw new Error('Missing shop parameter')
      }

      // Validate shop domain format (basic validation)
      if (!shopDomain.includes('.myshopify.com')) {
        throw new Error('Invalid shop domain format')
      }

      // Fetch shop and session from database
      const result = await db
        .select({
          shop: shops,
          session: sessions,
        })
        .from(shops)
        .leftJoin(sessions, eq(shops.domain, sessions.shop))
        .where(eq(shops.domain, shopDomain))
        .limit(1)

      const shop = result[0]?.shop
      const session = result[0]?.session

      if (!shop) {
        throw new Error(`Shop not found: ${shopDomain}`)
      }

      if (!session?.accessToken) {
        throw new Error(`No valid session found for shop: ${shopDomain}`)
      }

      const context = createProxyContext(session, shop)

      return next({ context })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      logger.error('Custom API middleware error:', errorMessage, error)

      throw error
    }
  }
)

// Webhook context type
type WebhookContext = {
  valid: boolean
  shopDomain: string | null
  webhookTopic: string | null
  body: unknown
}

/**
 * Webhook verification middleware for Shopify webhook requests
 * Verifies HMAC-SHA256 signature and provides webhook context
 * Reads and parses the request body, making it available in context
 */
export const webhookMiddleware = createMiddleware({ type: 'request' }).server(
  async ({ request, next }) => {
    try {
      const shopifyHmac = request.headers.get('x-shopify-hmac-sha256')

      if (!shopifyHmac) {
        throw new Error('Invalid Shopify webhook: Missing HMAC header')
      }

      // Read request body as raw bytes (can only be read once)
      const arrayBuffer = await request.arrayBuffer()
      const bodyBuffer = Buffer.from(arrayBuffer)
      const bodyText = bodyBuffer.toString('utf8')

      // Calculate expected HMAC
      const webhookSecret = process.env.SHOPIFY_API_SECRET

      if (!webhookSecret) {
        throw new Error(
          'SHOPIFY_APP_WEBHOOK_SECRET or SHOPIFY_API_SECRET not configured'
        )
      }

      const calculatedHmacDigest = crypto
        .createHmac('sha256', webhookSecret)
        .update(bodyBuffer)
        .digest()

      const receivedHmacDigest = Buffer.from(shopifyHmac, 'base64')

      // Verify signature using timing-safe comparison
      const valid =
        receivedHmacDigest.length === calculatedHmacDigest.length &&
        crypto.timingSafeEqual(receivedHmacDigest, calculatedHmacDigest)

      if (!valid) {
        throw new Error('Invalid Shopify webhook: HMAC verification failed')
      }

      // Extract webhook metadata from headers
      const shopDomain = request.headers.get('x-shopify-shop-domain')
      const webhookTopic = request.headers.get('x-shopify-topic')

      // Parse body JSON if body exists
      let parsedBody: unknown = undefined

      if (bodyText) {
        try {
          parsedBody = JSON.parse(bodyText)
        } catch {
          // If parsing fails, keep body as string
          parsedBody = bodyText
        }
      }

      const context: WebhookContext = {
        valid: true,
        shopDomain,
        webhookTopic,
        body: parsedBody,
      }

      return next({ context })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      logger.error('Webhook middleware error:', errorMessage, error)

      throw error
    }
  }
)
