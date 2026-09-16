// Accounts are created with a synthetic @learninghub.local address so users
// without a real email can still sign in. We never want that internal
// domain leaking into the UI — everywhere we'd show someone's email, show
// just their username instead.
const INTERNAL_DOMAIN = '@learninghub.local'

export function formatUsername(email) {
  if (!email) return ''
  return email.endsWith(INTERNAL_DOMAIN)
    ? email.slice(0, -INTERNAL_DOMAIN.length)
    : email
}
