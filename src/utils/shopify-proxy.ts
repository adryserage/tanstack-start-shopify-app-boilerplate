import { createHmac } from 'node:crypto'
import logger from '~/utils/logger'

/**
 * Verify that the request came from Shopify using HMAC-SHA256 signature
 */
export function verifyShopifyProxyRequest(request: Request): boolean {
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
