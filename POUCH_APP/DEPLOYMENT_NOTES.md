# Deployment & Data Protection — working notes

Captured from the design discussion so the reasoning survives outside chat.
Nothing here is built yet; these are decisions and open questions.

---

## 1. The constraint everything follows from

The backend talks to the pouch over **USB serial**. Whatever process holds that
port has to run on the machine the Arduino is plugged into. A cloud VM has no
COM port, so the API cannot simply be "deployed somewhere".

That rules out hosting the control path and shapes every option below.

---

## 2. Proposed architecture (Cloudflare + local tablets)

- A **permanent domain** on Cloudflare hosts the **users database only**.
- Each tablet stores the pouches it is paired with **locally**, so control only
  works when physically near the pouch.
- A password is prompted on reaching the domain.

### What is sound

The control path never crosses the internet. Provided the shared service is
strictly *users-and-prescriptions in, never commands out*, an attacker with the
domain genuinely cannot actuate a pouch. **Preserve that as an invariant** — it
is easy to erode later with an innocuous-looking "push prescription to tablet"
feature.

### What needs correcting

**"They'd only see plain user details" understates it.** The users DB is the
*most* sensitive asset in the system: names, national IDs, ages, protocols and
prescriptions — identified health data. Under Israeli privacy law a breach is
reportable and fineable. A pouch is replaceable hardware; a leaked teudat zehut
is permanent. The split as described protects the cheap asset and exposes the
expensive one.

**There is an indirect harm path.** If tablets *pull* prescriptions from the
shared DB, then editing that DB changes what a tablet will later command. Harm
with two extra steps. Decide either that prescriptions never round-trip through
the shared service, or that the tablet requires local clinician confirmation
before applying anything fetched.

**A single shared password is not identity.** It gets shared, never rotated, and
makes the `audit.actor` column read "somebody who knew the password" — worthless
on a clinical record. **Cloudflare Access is free up to 50 users** and provides
per-person identity at the edge, before traffic reaches the origin. Strictly less
work than building login, and strictly better.

**`localStorage` is the wrong store.** Wiped by a cache clear, ~5 MB cap, and
readable by the next person on a shared tablet. Use **IndexedDB**.

---

## 3. Client-side encryption (proposed, and worth doing)

Encrypt on the tablet before upload; the server stores blobs it cannot read; the
key never leaves the tablets. This closes the PHI exposure above.

**Use AES-GCM** (WebCrypto, in every browser). Authenticated encryption gives
*integrity* as well as confidentiality — so an attacker cannot forge a valid
record, which also closes the indirect-harm path in §2. That is the strongest
argument for doing it.

### The hard part is key management, not encryption

- **Do not derive the key from the login password.** One secret that both opens
  the door and decrypts the contents means a single leak loses everything, and
  the password cannot be rotated without re-encrypting every record.
  Instead: a device key generated once, held in IndexedDB, *wrapped* by the
  passphrase. Changing the passphrase re-wraps one key.
- **Encrypt fields, not whole rows.** Name, national ID and date of birth are the
  PHI. Leave MRN, timestamps and foreign keys in plaintext so the server can still
  sort and index. Encrypting everything loses server-side search — fine at ward
  scale (decrypt-then-filter a few hundred records), painful at thousands.
- **Plan key escrow before go-live.** Lose the key and every record is
  permanently unreadable, including by you.

**Encryption does not replace authentication.** It changes what a breach leaks,
not who can reach the endpoint. Keep Access in front regardless.

---

## 4. Alternative considered: fully isolated network

Discussed and preferred at one point: a dedicated WiFi AP with no WAN uplink, one
server box holding the USB connections, tablets as browser thin clients.

Two things that bite on an isolated network:

- **Clock drift.** No internet means no NTP, and every `sessions.started_at`,
  `events.ts` and `audit.ts` is stamped from the server's clock. Run an NTP
  server on the box, or document manual clock-setting as a procedure.
- **Single point of failure.** If the box dies, tablets lose control of every
  pouch. The firmware keeps holding its last targets and the controller's own
  17-key keypad still works, so the device stays operable and can be vented by
  hand — worth writing down as the documented fallback.

---

## 5. Native app question

An APK (Capacitor) would give an icon, kiosk lock-task and a configurable server
address — but **it does not remove the server**; it only changes how the UI
reaches the tablet. A TWA is not viable without HTTPS. On an HTTP-only isolated
network, a PWA gets the icon but not offline caching (service workers need a
secure context). Chrome in kiosk mode pointed at the URL is a legitimate
production answer for single-purpose devices.

---

## 6. Multi-tenancy

Identity ("who are you") and data scope ("whose data do you see") are independent
axes and were being conflated.

- **Per-tablet databases break in ordinary use**: a patient treated at two bays
  exists twice with divergent histories, prescriptions do not follow the patient,
  and the board roster cannot work.
- **Bay-pinned tablets** are a *view filter* over shared data, not isolation.
- **Multiple clinics** is real multi-tenancy, keyed to the organisation and not
  the device. If that is the future, add `tenant_id` before there is production
  data — retrofitting it across a populated schema is far more painful.
