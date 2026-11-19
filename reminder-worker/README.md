# Life Planner reminder service

This small Cloudflare Worker sends the daily reminder as a push notification, so it arrives even when the
planner is closed. It stores only each device's push address, reminder time and the day of the last reminder.
No planner entries are stored or sent.

Push needs an installed app on iPhone (iOS 16.4 or later, added to the Home Screen) or any Android phone or
desktop browser. Without this service the planner still shows reminders while it is open.

## One-time setup

You need a free Cloudflare account and Node.js installed.

1. Install the tools in this folder:

       npm install

2. Create the key-value store that remembers the devices:

       npx wrangler kv namespace create SUBS

   Copy the `id` it prints into `wrangler.toml` in place of `REPLACE_WITH_KV_NAMESPACE_ID`.

3. Create the push keys (run once, and keep the private key secret):

       node scripts/make-vapid-keys.mjs

   Put the PUBLIC KEY into `wrangler.toml` in place of `REPLACE_WITH_PUBLIC_KEY`.
   Put a real contact address in place of `mailto:you@example.com` (push services use it to reach you).

4. Save the PRIVATE KEY as a secret. Paste the JSON line it printed when asked:

       npx wrangler secret put VAPID_PRIVATE_JWK

5. Deploy:

       npx wrangler deploy

   Wrangler prints the address of the service, for example `https://life-planner-reminders.<you>.workers.dev`.

6. Connect the planner. In `index.html`, set:

       var REMIND_API="https://life-planner-reminders.<you>.workers.dev";
       var VAPID_PUB="<the PUBLIC KEY from step 3>";

   Commit and push. The planner then subscribes each device when the reminder time is saved.

## Checking it works

Run the local tests at any time (no Cloudflare account needed):

    node test/test.mjs

## Notes

- A reminder is sent once per local day, within the hour after the chosen time, checked every 5 minutes.
- If a device unsubscribes or reinstalls the app, its entry is removed automatically.
- Notification text is fixed in `sw.js` (English), because the push carries no content.
