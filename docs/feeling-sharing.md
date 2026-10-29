# Feeling sharing and invitations

After a successful save, the visitor can share a card, copy an invitation link,
or download a 1080 × 1350 PNG. Failed or rate-limited saves never open the card.
Closing the card is optional; "Share my saved feeling" reopens it during the
current page session. No login or database migration is needed.

Share links always use the public origin `https://feeltheworld.lovable.app`,
including when created in a development preview. Only the emotion and language
are included, for example `/?feeling=hope&lang=sk`. The sender's note, coordinates,
record ID, current query parameters and URL fragment are never copied. The image
uses a generic globe and the same fixed copy, not a screenshot of the map.
The emotion itself is deliberately shared and can be visible in link previews
and destination logs; recipients are not told who or where the sender is.

The recipient sees an invitation in the selected language, chooses their own
emotion, and uses the normal composer and map. This entry replaces the original
onboarding overlay. Invalid emotion/language inputs are ignored. Dismissing the
invitation neither submits nor preselects the sender's emotion.

## Sharing support

- Mobile browsers can use native Web Share and include the PNG when supported.
- Other browsers fall back to copying the invitation link.
- If clipboard access fails, the URL is selected for manual copying.
- Cancelling native sharing is silent and never copies anything automatically.
- A file export failure still leaves text/link sharing usable.
- No messages are sent automatically and no social-network API is called.

The URL's Open Graph preview remains the existing site preview. The personalized
visual is the attached/downloaded PNG; per-emotion server-generated previews are
a possible later addition. Successful browser API calls do not prove delivery to
another person or availability in every social app.

## Funnel integration

The browser emits `feel:share` CustomEvents with only `{ action, emotion }`:

`card_opened`, `link_copied`, `native_completed`, `image_downloaded`,
`invite_opened`, `invite_accepted`, `invite_submitted`.

`invite_submitted` fires only after the recipient's save succeeds. No ID, note,
position, or destination app is included. These events are not persisted and no
analytics provider is connected by this change. Connect an approved analytics
adapter before claiming funnel measurements; existing dashboards will not
automatically display these events. Copies/downloads are actions, not confirmed
shares, and opening a link is not proof of a distinct recipient.

## Verification and release

```sh
npm test
npm run typecheck
npm run build
# With dev server at http://127.0.0.1:3000 and the browser tools from review-and-release.md:
node scripts/check-sharing.mjs
```

The browser script intercepts all submission POSTs and remote services. It tests
failed/successful saves, canonical links, PNG export, native share/cancellation,
clipboard failure, Escape/reopen behavior, recipient conversion and mobile
stacking. It writes no production data. Browser capabilities are simulated for
native share tests: verify the real share sheet on a target phone before release.

For preview testing, open `/?feeling=hope&lang=sk` on the preview origin manually;
the copied link intentionally points to production, which will not show the new
invitation until this feature is published. Verify generated cards for the six
emotions and both languages. No database rollout is needed. Merge and publication
remain separate release steps after review.
