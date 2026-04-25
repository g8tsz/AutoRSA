export type BrokerDoc = {
  slug: string
  envVar: string
  example: string
  caveat?: string
  guideUrl?: string
}

export const BROKER_DOCS: BrokerDoc[] = [
  { slug: 'bbae', envVar: 'BBAE', example: 'BBAE=username:password' },
  { slug: 'chase', envVar: 'CHASE', example: 'CHASE=username:password:last4' },
  { slug: 'dspac', envVar: 'DSPAC', example: 'DSPAC=username:password' },
  { slug: 'fennel', envVar: 'FENNEL', example: 'FENNEL=personal_access_token' },
  { slug: 'fidelity', envVar: 'FIDELITY', example: 'FIDELITY=username:password:totp_or_NA' },
  {
    slug: 'firstrade',
    envVar: 'FIRSTRADE',
    example: 'FIRSTRADE=username:password:otp',
    caveat: 'OTP can be pin/phone/email/authenticator depending on setup.'
  },
  {
    slug: 'public',
    envVar: 'PUBLIC_BROKER',
    example: 'PUBLIC_BROKER=api_key',
    caveat: 'Windows already uses PUBLIC env var; use PUBLIC_BROKER.'
  },
  {
    slug: 'robinhood',
    envVar: 'ROBINHOOD',
    example: 'ROBINHOOD=username:password:totp_or_NA',
    caveat: 'Saved creds/cookies in creds folder can override env credentials.',
    guideUrl: 'https://github.com/NelsonDane/auto-rsa/blob/main/guides/robinhoodSetup.md'
  },
  {
    slug: 'schwab',
    envVar: 'SCHWAB',
    example: 'SCHWAB=username:password:totp_or_NA',
    guideUrl: 'https://github.com/NelsonDane/auto-rsa/blob/main/guides/schwabSetup.md'
  },
  { slug: 'sofi', envVar: 'SOFI', example: 'SOFI=username:password:totp_optional' },
  { slug: 'tastytrade', envVar: 'TASTYTRADE', example: 'TASTYTRADE=client_secret:refresh_token' },
  { slug: 'tornado', envVar: 'TORNADO', example: 'TORNADO=email:password' },
  { slug: 'tradier', envVar: 'TRADIER', example: 'TRADIER=access_token' },
  { slug: 'vanguard', envVar: 'VANGUARD', example: 'VANGUARD=username:password:last4:debug' },
  {
    slug: 'webull',
    envVar: 'WEBULL',
    example: 'WEBULL=username:password:did:trading_pin',
    caveat: 'Requires DID; see upstream Webull notes.'
  },
  { slug: 'wellsfargo', envVar: 'WELLSFARGO', example: 'WELLSFARGO=username:password:last4' }
]

export const UPSTREAM_RELEASES_URL = 'https://github.com/NelsonDane/auto-rsa/releases'
