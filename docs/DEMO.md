# Demonstrating HealthKey

Use synthetic selections only. Start services using the README. Local credentials are in `.local/DEMO-ACCESS.md`; the source archive deliberately excludes them and setup generates fresh credentials on another machine.

1. Open `/c/HK001` in a public browser. Show English, ChiShona and IsiNdebele; explain that local translation review is still pending. Open accessibility settings and demonstrate larger text or high contrast.
2. Start a private request, select one category, skip or select a communication preference, and review. Submit and note the anonymous reference. The receipt no longer shows the selected category.
3. Reveal and retain the **private access code**, then clear the screen. Choose **Check my request**, enter that private code and open the request. The short desk reference alone cannot open messages. Send “I prefer to write.”
4. In a separate browser context, open `/staff` and sign in as the intake demo account. Find the desk reference and open its messages. Reply “Please wait by reception.” Show the reply arriving on the patient screen. Acknowledge, start support and show the progress updates. Complete the request: messages are cleared, the conversation closes and the request leaves the staff queue.
5. Clear the public screen. Open `/c/HK001?kiosk=1`, make a choice, then navigate away and back. The previous choice must not return. The idle warning allows more time before clearing.
6. Load the public clinic online once using a production build. Switch the browser offline and reload. Make a choice and use direct display. Reconnecting does not send it automatically. Clear the screen after showing it.
7. Sign in at `/admin` with the clinic administrator. Review translations, services and clinic settings, save a preview, then publish. Reports intentionally withhold small groups. The platform account manages organizations/clinic availability without access to request contents.

The demo uses Africa/Harare time, two synthetic clinics, all three requested languages, a 90-second kiosk idle period, a 60-minute new-request lifetime and five-second authorized queue polling. Demo hours span 00:00–23:59 to make demonstrations practical; configure real clinic hours before use.

The app does not offer diagnosis, triage, prescriptions or clinical records. Staff accounts use actual local Supabase Auth. TOTP is available and tested; local demo mode permits password-only access. Real clinic configuration requires MFA and reviewed wording.

For the hosted demo, use https://healthkey-omega.vercel.app and credentials in the private `.local/HOSTED-DEMO-ACCESS.md`. Create a new request for this walkthrough; older desk references are not recovery credentials. Quick replies are fixed text suggestions, not AI or medical advice.
