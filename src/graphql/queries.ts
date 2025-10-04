export const SHOP_QUERY = `#graphql
  query GetShop {
    shop {
      id
      name
      email
      ianaTimezone
      currencyCode
      myshopifyDomain
      plan {
        publicDisplayName
      }
    }
  }
`

export const PRODUCT_QUERY = `#graphql
  query GetProducts($first: Int = 10, $after: String, $before: String) {
    products(first: $first, after: $after, before: $before) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          handle
          title
        }
      }
    }
  }
`
