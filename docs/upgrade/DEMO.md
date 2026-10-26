# Reproducible synthetic demonstration

Use only fictional adult scenarios. All provider names are demo fixtures, not partnerships. Source and receiving organisations are separate clinic tenants.

1. On the public welcome screen, read the synthetic preparation note and start a private conversation. In demo mode, this explicitly prepares only the two fictional source/receiving providers for 120 minutes. If a review expires, use **Prepare synthetic demo**. This does not reset requests, messages or referrals, and does not make any claim about real provider capacity. Admins can still edit availability and run the labelled simulated check-in. Provider changes made during an active workflow continue to be enforced.
2. Open the public welcome in a separate browser context. Change language, then start a private conversation with text communication. Review organisation, monitoring, disclosed fields and in-app-only contact. Submit without name or narrative. Keep the private access code securely; the short reception reference cannot open messages.
3. Sign in as `intake` in another context. Open the reference, acknowledge and assign the practitioner. Explain that reception cannot read private messages.
4. Sign in as `clinician`. Open the assigned request, reply to the holder and start support. Prepare a referral to Bridge Demo Support Centre, choosing only necessary disclosure fields. Save draft, inspect it, then ask for consent.
5. On the holder’s page, inspect recipient, exact fields/values, purpose and expiry. Approve the disclosure. In the practitioner workspace, explicitly send it. Approval and sending are separate states.
6. Sign in as `receiving`. Open Referrals and locate the matching opaque referral reference. Confirm that the source chat is absent. Acknowledge, then explicitly confirm handover. The holder sees who confirmed the operational outcome; this is not a safety or recovery claim.
7. Failure branch: propose another referral, then change the receiving provider to unavailable before dispatch. Sending fails honestly. Select an alternative only by creating a new referral and obtaining new consent. Another branch: cancel after sending and show that future recipient retrieval is denied. Data already seen cannot be recalled.
8. Clear the public screen. Re-enter with the private code, then quick exit. Back/reload shows a neutral screen. For kiosk review, use `/c/HK001?kiosk=1` and demonstrate the inactivity warning/clearing.
9. Offline review: load the clinic online once, go offline, choose general support and use private display. Nothing is queued for automatic transmission. Private messages and consent require a confirmed connection.

Suggested five-minute timing: access barrier (40s), private request/staff response (60s), exact consent (80s), unavailable-provider branch (60s), acknowledgement/evidence/pilot model (60s).

Local staff use `@healthkey.test`; hosted staff use `@healthkey-connect.test`. Passwords are generated and recorded in private `.local/` files. Do not embed admin credentials in a public submission or recording. Use separate contexts for staff roles; never overlap an authentication test’s logout with another test using the same identity.

For local fixture reset, rerun setup on a dedicated disposable demo database. Do not use fixture scripts against the original hosted project. The competition must disclose reused HealthKey request/auth/message code, new referral/directory functionality, simulated external check-ins, and partner-dependent live readiness.

Public judge credentials and the four-role walkthrough are in the root README. Their passwords are independent of the owner demo identities. The public clinician to assign is **Judge practitioner**. Never grant judges platform-owner privileges.
