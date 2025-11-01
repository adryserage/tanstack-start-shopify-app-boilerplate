import { RequestedTokenType } from '@shopify/shopify-api'
import { createMiddleware } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import type { Session } from '@shopify/shopify-api'
import type { AdminApiClient } from '@shopify/admin-api-client'
import type { GetShopQuery } from '~/types/generated/admin.generated'
import type { SelectSession, SelectShop } from '~/db/schema'
import { sessions, shops } from '~/db/schema'
import { db } from '~/db'
import { SHOP_QUERY } from '~/graphql/queries'
import logger from '~/utils/logger'
import { apiVersion, shopifyApp } from '~/utils/shopify-app'
import { createGraphqlClient } from '~/utils/shopify-graphql-client'

// Enhanced context type with better type safety
type AuthContext = {
  session: SelectSession
  shop: SelectShop
  graphql: AdminApiClient
}

/**
 * Extracts session token from multiple sources in order of priority
 */
function extractSessionToken(
  headers: Headers,
  searchParams: URLSearchParams
): string | null {
  // 1. Authorization header (API calls) - normalized to be capitalized
  const authHeader =
    headers.get('Authorization') || headers.get('authorization')

  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '')
  }

  // 2. URL search params (initial page load)
  const idToken = searchParams.get('id_token')

  if (idToken) {
    return idToken
  }

  return null
}

/**
 * Creates auth context from session and shop data
 */
function createAuthContext(
  session: SelectSession,
  shop: SelectShop
): AuthContext {
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
 * Gets or creates session and shop in database with proper error handling
 */
async function upsertSessionAndShop(
  shopData: GetShopQuery['shop'],
  sessionData: Session
): Promise<{
  session: SelectSession
  shop: SelectShop
}> {
  const now = new Date().toISOString()

  const result = await db.transaction(async tx => {
    // Upsert session with normalized shop domain - returns the upserted record
    const [session] = await tx
      .insert(sessions)
      .values({
        id: sessionData.id,
        shop: sessionData.shop,
        state: sessionData.state,
        isOnline: sessionData.isOnline,
        scope: sessionData.scope,
        expires: sessionData.expires,
        accessToken: sessionData.accessToken,
      })
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          accessToken: sessionData.accessToken,
          expires: sessionData.expires,
          scope: sessionData.scope,
          state: sessionData.state,
          shop: sessionData.shop,
        },
      })
      .returning()

    // Upsert shop - returns the upserted record
    const [shop] = await tx
      .insert(shops)
      .values({
        domain: sessionData.shop,
        name: shopData.name,
        email: shopData.email,
        timezone: shopData.ianaTimezone,
        currency: shopData.currencyCode,
        plan: shopData.plan.publicDisplayName,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: shops.domain,
        set: {
          name: shopData.name,
          email: shopData.email,
          timezone: shopData.ianaTimezone,
          currency: shopData.currencyCode,
          plan: shopData.plan.publicDisplayName,
          updatedAt: now,
        },
      })
      .returning()

    if (!session || !shop) {
      throw new Error('Failed to create/retrieve session or shop')
    }

    return { session, shop }
  })

  return result
}

/**
 * Main authentication middleware
 */
export const authMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      const request = getRequest()
      const headers = request.headers
      const url = new URL(request.url)
      const token = extractSessionToken(headers, url.searchParams)

      if (!token) {
        logger.error('No session token found', { headers, url })
        throw new Error('No session token found')
      }

      const decodedSessionToken =
        await shopifyApp.session.decodeSessionToken(token)

      if (!decodedSessionToken?.dest) {
        throw new Error('Invalid session token: missing destination')
      }

      const shopDomain = new URL(decodedSessionToken.dest).hostname
      const currentId = shopifyApp.session.getOfflineId(shopDomain)

      if (currentId) {
        // Fetch session and shop in parallel for better performance
        const [session, shop] = await Promise.all([
          db.query.sessions.findFirst({
            where: eq(sessions.id, currentId),
          }),
          db.query.shops.findFirst({
            where: eq(shops.domain, shopDomain),
          }),
        ])

        if (session?.accessToken && shop) {
          const context = createAuthContext(session, shop)

          return next({ context })
        }
      }

      const accessToken = await shopifyApp.auth.tokenExchange({
        shop: shopDomain,
        sessionToken: token,
        requestedTokenType: RequestedTokenType.OfflineAccessToken,
      })

      const shopData = await fetch(
        `https://${accessToken.session.shop}/admin/api/${apiVersion}/graphql.json`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken.session.accessToken!,
          },
          body: JSON.stringify({
            query: SHOP_QUERY,
          }),
        }
      ).then(res => res.json())

      if (!accessToken.session?.shop) {
        throw new Error('Token exchange failed: no shop found')
      }

      const { session, shop } = await upsertSessionAndShop(
        shopData.data.shop,
        accessToken.session
      )

      const context = createAuthContext(session, shop)

      return next({ context })
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      logger.error(errorMessage, error)

      throw error
    }
  }
)
