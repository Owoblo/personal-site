# JO sender logo

Status on October 25, 2026: logo prepared and hosted; certificate not ordered or issued, BIMI DNS not activated. The owner says JO is a registered trademark, so the intended route is a Verified Mark Certificate (VMC). A certificate authority must verify the exact mark, its registered owner, and the sending domain before issuing it.

The site icon has been converted to an outlined, square SVG Tiny P/S candidate at `brand/jo-bimi.svg`, preserving the JO lettering and its original colours. It uses paths instead of font references, includes a title, and has no embedded images, scripts, or external dependencies. The issuer must approve its final conformity and match to the registered artwork.

## Needed from the owner

- Trademark registration number, issuing country/office, registered owner's legal name, and registration certificate or official registry link. The registered artwork must match JO; a trademark for a different business name is not sufficient evidence for this logo.
- Certificate purchaser and authorized validation contact, with the issuer's requested identity or organization documents.
- Explicit approval of the chosen provider's final price and renewal terms. DigiCert's public comparison on October 25 listed a VMC subscription at $1,752 for 12 months; checkout and applicable tax/currency need confirmation. No purchase has been made.

## Activation after issuance

1. Audit every legitimate sender for johnowolabi.com. SES newsletter and Gmail Send mail as through SES should pass aligned DKIM; check actual delivered headers. Include any other sender before changing DMARC.
2. Move DMARC from its current `p=none` to `p=quarantine; pct=100` or `p=reject; pct=100` after the sender audit. Preserve existing tags. Do not claim BIMI is ready while DMARC remains at `none`.
3. Obtain the issuer-approved SVG and full PEM certificate chain. Host the public PEM over HTTPS, for example `https://johnowolabi.com/brand/jo-vmc.pem`; the certificate file does not exist yet. Never publish a private key.
4. Publish `default._bimi.johnowolabi.com` TXT using the issuer's final URLs. Intended shape only (not an active DNS record):

   `v=BIMI1; l=https://johnowolabi.com/brand/jo-bimi.svg; a=https://johnowolabi.com/brand/jo-vmc.pem;`

5. Validate the record, certificate, HTTPS accessibility, logo, and actual new messages. Gmail controls display and caching; a DNS record alone does not guarantee an avatar or instantly update old messages.

Sources: [Google's BIMI requirements](https://knowledge.workspace.google.com/admin/security/set-up-bimi), [BIMI SVG profile](https://bimigroup.org/creating-bimi-svg-logo-files/), [DigiCert certificate comparison and pricing](https://www.digicert.com/tls-ssl/compare-mark-certificates).
