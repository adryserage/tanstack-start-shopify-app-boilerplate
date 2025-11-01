/// <reference types="vite/client" />
import { NavMenu } from '@shopify/app-bridge-react'
import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { DefaultCatchBoundary } from '~/components/DefaultCatchBoundary'
import { NotFound } from '~/components/NotFound'

export const Route = createRootRouteWithContext()({
  head: () => ({
    links: [
      {
        rel: 'preconnect',
        href: 'https://cdn.shopify.com',
      },
      {
        rel: 'preload',
        href: 'https://cdn.shopify.com/shopifycloud/polaris.js',
        as: 'script',
      },
    ],
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        httpEquiv: 'Content-Security-Policy',
        content:
          'frame-ancestors https://*.myshopify.com https://admin.shopify.com;',
      },
      {
        name: 'shopify-debug',
        content: 'web-vitals',
      },
      {
        name: 'shopify-api-key',
        content: process.env.SHOPIFY_API_KEY!,
      },
    ],
    scripts: [
      {
        src: 'https://cdn.shopify.com/shopifycloud/app-bridge.js',
      },
      {
        src: 'https://cdn.shopify.com/shopifycloud/polaris.js',
      },
    ],
  }),
  errorComponent: props => {
    return (
      <RootDocument>
        <DefaultCatchBoundary {...props} />
      </RootDocument>
    )
  },
  pendingComponent: () => (
    <s-page>
      <s-spinner />
    </s-page>
  ),
  notFoundComponent: () => <NotFound />,
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <NavMenu>
        <Link to="/" rel="home">
          Home
        </Link>

        <Link to="/about">About</Link>
      </NavMenu>

      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>

      <body>
        {children}

        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
