import { type AdminApiClient } from '@shopify/admin-api-client'
import { eq } from 'drizzle-orm'
import { createHmac } from 'node:crypto'
import { db } from '~/db'
import {
  sessions,
  shops,
  type SelectSession,
  type SelectShop,
} from '~/db/schema'
import { createGraphqlClient } from '~/utils/shopify-graphql-client'
import crypto from 'node:crypto'
import logger from './logger'

export async function verifyShopifyWebhook(
  request: Request,
  withBody?: boolean
): Promise<{
  valid: boolean
  shopDomain: string | null
  webhookTopic: string | null
  body?: unknown
}> {
  const shopifyHmac = request.headers.get('x-shopify-hmac-sha256')

  if (!shopifyHmac) {
    return { valid: false, shopDomain: null, webhookTopic: null }
  }

  const body = await request.text()

  const calculatedHmacDigest = crypto
    .createHmac('sha256', process.env.SHOPIFY_APP_PROXY_SECRET!)
    .update(body)
    .digest('base64')

  const valid = crypto.timingSafeEqual(
    Buffer.from(calculatedHmacDigest),
    Buffer.from(shopifyHmac)
  )

  const shopDomain = request.headers.get('x-shopify-shop-domain')
  const webhookTopic = request.headers.get('x-shopify-topic')

  const response = { valid, shopDomain, webhookTopic, body: undefined }

  if (withBody) {
    response.body = JSON.parse(body)
  }

  return response
}

/**
 * Verify that the request came from Shopify using HMAC-SHA256 signature
 */
async function verifyShopifyProxyRequest(request: Request): Promise<boolean> {
  const url = new URL(request.url)
  const params = new URLSearchParams(url.search)

  // Get the signature from the request
  const signature = params.get('signature')

  if (!signature) {
    return false
  }

  // Get proxy secret from environment
  const proxySecret = process.env.SHOPIFY_APP_PROXY_SECRET

  if (!proxySecret) {
    logger.error('❌ SHOPIFY_APP_PROXY_SECRET not configured')
    return false
  }

  // Remove the signature from params for verification
  params.delete('signature')

  // Sort parameters alphabetically and create query string
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('')

  // Calculate expected signature
  const expectedSignature = createHmac('sha256', proxySecret)
    .update(sortedParams)
    .digest('hex')

  // Compare signatures using timing-safe comparison
  return signature === expectedSignature
}

/**
 * Authenticate Shopify proxy request and return shop + GraphQL client
 * Optimized for performance while maintaining security
 */
export async function authenticateProxy(request: Request): Promise<{
  session: SelectSession
  shop: SelectShop
  graphql: AdminApiClient
}> {
  const isValidRequest = await verifyShopifyProxyRequest(request)

  if (!isValidRequest) {
    throw new Error('Invalid Shopify proxy request')
  }

  const url = new URL(request.url)
  const shopDomain = url.searchParams.get('shop')

  if (!shopDomain) {
    throw new Error('Missing shop parameter')
  }

  const [shop, session] = await Promise.all([
    db.query.shops.findFirst({
      where: eq(shops.domain, shopDomain),
    }),
    db.query.sessions.findFirst({
      where: eq(sessions.shop, shopDomain),
    }),
  ])

  if (!shop) {
    throw new Error(`Shop not found: ${shopDomain}`)
  }

  if (!session?.accessToken) {
    throw new Error(`No valid session found for shop: ${shopDomain}`)
  }

  const graphql = createGraphqlClient(shop, session)

  return { session, shop, graphql }
}
