# Watt: Pitch Pack

**Challenge:** Ecurious Challenge: *How to Integrate a Smart Reservation System in a Charging App for Public EV Charging*
**Event:** WATT THE HACK, Munich Energy & AI Hackathon, TUM Audimax, Munich
**Product:** Watt, *a charging bay that is free when you arrive*
**Ecurious team name:** Recharge Saturday · **Team:** Shivani Saroj (solo: product, design, build)

---

## 0. How to use this file

1. **Slides:** paste Sections 2 and 3 into **Gamma** (gamma.app → *Paste in text*) or Google Slides.
   - **Format:** 16:9, 1920 × 1080, **export as PDF** for the submission form.
   - **Theme:** dark Ink `#0F1419`, accent Voltage `#C8E847`, highlight Ultraviolet `#5A1DF0`.
   - **Fonts:** Bebas Neue (headlines), Space Grotesk (text), JetBrains Mono (numbers).
   - **Rules:** one idea per slide; the headline *is* the takeaway; at most about 30 words on a slide; source line under every number.
2. **Screenshots:** capture the screens listed in Section 5 and place them on slides 3, 4, 6 and 10. Add a QR code to the live link or GitHub repo on slides 1 and 12.
3. **Live pitch (3 min):** if Ecurious picks us for the top 3, use the script in Section 4.
4. **Q&A:** Section 6.
5. **Submit by 18:00:** one form per team: https://forms.gle/sAdvWuZcUfSNLV3x5

**Who is judging, and what each person cares about**

| Juror | Role | What to emphasise |
|---|---|---|
| Florian Windeler | Co-Founder, Ecurious | Live hardware integration, card + plate, fleets |
| Henrik Mitsch | VP Digital, Elli (Volkswagen Group) | Driver experience, smart charging, interoperability |
| Dr. Simon Herzog | Head of Mobility Projects, UnternehmerTUM | Startup viability, mobility fit |
| Elena Ballesteros | Investor, Voyager Ventures | Energy and applied tech, scalability |
| Mia Brzakovic | Associate, Matterwave Ventures | Industrial tech, defensibility |
| Sagar Barvaliya | General Partner, Blockchain Founders Capital | Business viability, scalability |
| Dr. Markus Eblenkamp | Program Manager, M.Sc. Power Engineering, TUM | Energy-system sense, sustainability |
| Alexander Dietrich | Munich Re | Risk: data protection, failure modes |

**How the challenge is scored (from the brief):** Technical Implementation 30% · Solution Concept & Innovation 20% · Interoperability & Scalability 15% · Business Case & CPO Value 20% · Documentation & Pitch 15%. *The full live cycle on Ecurious hardware is required for the top ranks; the tie-breaker is Technical Implementation; GDPR violations cost points.*

---

## 1. Fact sheet (single source of truth)

Use only these facts. Every number here is either in our code or in a cited source.

**The system as built**
- **Map:** live public charge points from the **GoingElectric API** (383 within 5 km of the venue at the time of writing), each linked to its GoingElectric entry as the API terms require.
- **Hardware:** the Ecurious hackathon server controls **Chang Cheng CC5S ground locks with plate (LPR) cameras**. Our team key controls **Bay 2 (lock-0002)** and **Bay 3 (lock-0003)**. Bay 1 (lock-0001) was assigned to us earlier and is now shown as *Unavailable*.
- **Ecurious API used:** `GET /api/v1/locks` · `POST /locks/:id/lock` (raise barrier) · `POST /locks/:id/unlock` (lower) · `POST /locks/:id/whitelist` (store the booked plate in the camera) · Server-Sent Events `/events` (`photo_captured`, `vehicle_presence`, `status_change`, `alarm`). Auth uses the team key in the `X-API-Key` header, kept on our server.
- **Reconcile loop:** every **8 seconds** Watt re-applies the desired state, so a missed event can't leave a bay stuck.

**Booking rules (src/lib/policy.ts)**
- **Hold fee €1.50**, credited back when charging starts.
- **Grace period 10 min** after the booked window, plus **one "I'm running late" extension of 10 min**.
- **Free cancellation** until **15 min** before the window, or within **5 min of booking** (change of mind).
- **No-show fee €4.00**; the **first no-show per plate is waived**.
- **Blocked bay:** the waiting driver pays nothing; the hold releases itself after **15 min** if the bay stays blocked, and the driver is offered another free bay.
- **Plate matching:** a confident match (≥ 85%) checks the driver in; 60–85% asks the driver to confirm; below 60% counts as unreadable and waits for the driver. The lock's camera sends no confidence score, so a complete plate counts as a confident read.

**Plate data (privacy design, not a legal opinion)**
- Explicit consent before booking.
- The raw plate is kept **only while the hold is active**, then cleared **24 h** after the booking ends; a **salted hash** remains for the first-no-show waiver.
- Other drivers only ever see a **masked plate** (e.g. M••••01); the operator dashboard and its data feed get only a masked plate and an 8-character audit reference, never the raw plate or the driver's name.

**Interoperability**
- **OCPI 2.2.1 commands:** `RESERVE_NOW` and `CANCEL_RESERVATION`, which move the real lock immediately.
- OCPI has no licence-plate field, so Watt returns a **check-in link** (`/r/[id]`) where the other app's driver binds their plate.

**Real-world numbers (cite on slides)**
| Number | Source |
|---|---|
| Public charge points in Germany are occupied **2.3 h/day (9.6%)** on average; midday peak about 19% | Nationale Leitstelle Ladeinfrastruktur / NOW GmbH, 2025 |
| Munich: cars **plugged in 5.12 h but charging only 1.45 h**, so about **72% of plugged-in time is idle** | TUM master's thesis (Klopstock), 2024 |
| **28%** of EV drivers find chargers blocked by combustion cars or non-charging EVs "always or very often" | Consumer Council Northern Ireland, 2024 (n = 589) |
| **14%** frequently / **44%** occasionally blocked by combustion cars | Versinetic UK survey, 2024 (n = 803) |
| Hamburg barrier pilot: long exclusive holds left bays idle, so **1 public charger ≈ 3 reservable ones**; bookings were mostly short-notice | ELBE "Quartiersladen" pilot report, Hamburg, 2022 |
| Oslo booked-charging pilot: **NOK 12/h no-show fee**, **15 min** to unplug | GreenCharge project D2.8, 2022 |
| Typical event: **~40 kWh in 45 min (DC)**, **~20 kWh in 4 h (AC)** | Hecht, Figgener, Sauer, *iScience* 2022 |
| Ecurious: one card for **700,000+ charge points**, patent-pending **Dynamic UID transfer**, about **4 s** from tap to authorised session | ecurious.com |

**Guiding questions answered but not built (say this if asked)**
- **Reminders:** web push 15 min before and at grace start, with one-tap late/cancel.
- **Not coming:** opt-in phone ETA; if it passes the grace period, offer a cancel before any fee.
- **Which car blocks:** the lock sees occupancy + plate only; joining the charge point's OCPP session status tells "parked, not charging" (escalate) from "EV still charging" (friendly overstay nudge).
- **Escalation path:** driver rerouted at once, no fee → hold releases at 15 min → operator alert → staff or warden at 30 min; the ledger keeps an audit reference and a masked plate.
- **Temporary/foreign plates:** any alphabet matches; unreadable reads go to the driver; the plate can be rebound before arrival.
- **Built:** hardware alarms (water ingress, motor stall, tamper) show in red in the live feed and on the operator's bay cards.

**Honest limitations**
- The lock doesn't meter energy: the driver taps **Start charging** when they plug in.
- The lock doesn't report GPS: the pin is the venue (TUM Audimax).
- The OCPI `response_url` callback isn't posted (commands reply immediately).
- Bookings are stored in one file for one server process (no multi-instance yet).
- No real payment: fees are calculated, not charged.

---

## 2. The deck: 12 slides

### Slide 1: Title
**Headline:** WATT
**Subline:** A charging bay that is free when you arrive.
**Small print:** Ecurious Smart Reservation Challenge · WATT THE HACK Munich · Team Recharge Saturday · Shivani Saroj
**Visual:** app screenshot (map with the Ecurious marker and the bay tiles) on a dark background.
**Say:** "We built Watt: you reserve a public charging bay, real hardware keeps it free, and the camera lets you in by your licence plate."

### Slide 2: Problem
**Headline:** You drive to a charger. Someone is already parked there.
**On slide:**
- 28% of EV drivers often find chargers blocked¹
- In Munich, plugged-in cars sit idle 72% of the time²
- Yet the average German charger is busy only 9.6% of the day³
**Footnote:** ¹Consumer Council NI 2024 · ²TUM thesis 2024 · ³NOW / Nationale Leitstelle 2025
**Visual:** a large "72%" with a small car-in-bay icon.
**Say:** "The problem isn't too few chargers. It's that you can't count on one being free when you arrive."
**Scores:** Concept.

### Slide 3: Solution
**Headline:** Reserve it. The bay holds itself. Your plate opens it.
**On slide (4-step strip):** Find (live map) → Reserve (barrier rises) → Arrive (camera reads plate, barrier lowers) → Charge & leave (bay frees itself)
**Visual:** four phone screenshots in a row.
**Say:** "One booking flow, from finding a charger to a guaranteed free bay."
**Scores:** Concept, Technical.

### Slide 4: Live on Ecurious hardware
**Headline:** Not a mock-up. This drives real Ecurious locks.
**On slide:**
- Reserve → barrier **raised**, plate written into the camera
- Booked car arrives → camera match → barrier **lowers by itself**
- Leaves → sensor reports vacant → bay reopens
**Visual:** screenshots of the booking, the live hardware feed ("Barrier raised to hold the bay", "Camera whitelist set") and the Dashboard's Live bays; QR code to the live app or repo.
**Say:** "Reserve and release run on the provided locks: booking raised the real barrier and wrote the plate into the camera; cancelling lowered it. Plate check-in is implemented on the camera's events, and the ËCURIOUS card is a second key."
**Scores:** Technical (30%), the prerequisite for the top ranks.

### Slide 5: How it works
**Headline:** Watt is the brain. Ecurious is the hands and eyes.
**Visual (architecture diagram):**
```
Driver app (web, installable)
        │
   Watt server ── GoingElectric API (charger map)
        │  booking rules · plate matching · privacy
        │
   Ecurious server ── REST: lock / unlock / whitelist
        │           ── live events: photo · presence · barrier
   CC5S ground locks + plate cameras (Bay 2, Bay 3)
```
**Small print:** API keys stay on the server · reconcile every 8 s · live event stream.
**Say:** "We keep all the decisions in Watt and let the Ecurious hardware do what it does best."
**Scores:** Technical, Documentation.

### Slide 6: Edge cases
**Headline:** Built for the moments that break reservations.
**On slide (3 columns):**
- **No-show:** 10 min grace + one late extension · auto-release · first no-show free, then €4
- **Blocked bay:** wrong plate detected · driver pays nothing · rerouted to a free bay · hold releases after 15 min
- **Unclear plate:** ≥85% check in · 60–85% driver confirms · unreadable waits for the driver
**Visual:** the three app states as small screenshots.
**Scores:** Technical (edge cases are named in the rubric), Concept.

### Slide 7: Privacy by design
**Headline:** We use the plate only as long as we need it.
**On slide:**
- Consent before booking
- Raw plate kept only during the hold, cleared 24 h after it ends
- Only a salted hash stays, for the first-no-show waiver
- Other drivers see a masked plate (M••••01)
**Small print:** Prototype design, not a legal assessment.
**Scores:** GDPR handling is expected from all teams; violations cost points.

### Slide 8: Interoperability
**Headline:** Any charging app can book a Watt bay.
**On slide:**
- **OCPI 2.2.1** `RESERVE_NOW` / `CANCEL_RESERVATION` move the real lock
- OCPI has no plate, so app B's driver gets a **check-in link** to add theirs
- **Built:** the **ËCURIOUS card** as a second check-in key (hashed). OCPI bookings use the token uid as that card automatically
**Visual:** App A → OCPI → Watt → lock, and App B → check-in link.
**Say (to Florian):** "Your card already identifies drivers across networks; our camera identifies the car. We built both keys: if the camera can't read the plate, the driver taps the ËCURIOUS card, and a booking from another app arrives with its card already linked."
**Scores:** Interoperability & Scalability (15%).

### Slide 9: Business case
**Headline:** Guaranteed bays people will pay for, at prices that don't scare them.
**On slide:**
- **Drivers:** €1.50 hold, refunded when you charge, so honest drivers pay nothing extra
- **No-shows:** €4 after 10 min grace, first one waived (benchmarked against Oslo's NOK 12/h)
- **Operators (CPOs):** per-bay fee for hardware-backed reservations
- **Fleets & partners:** guaranteed bays on a monthly plan; retailers and hotels sponsor bays as a perk
**Small print:** Proposed pricing, not a live tariff.
**Scores:** Business Case & CPO Value (20%).

### Slide 10: Value for operators
**Headline:** Short holds fill bays. Long holds empty them.
**On slide:**
- Hamburg's barrier pilot: long exclusive holds meant **1 public charger ≈ 3 reservable ones**
- Watt holds only the booked window + 10 min, then releases automatically
- Dashboard: arrival rate, no-show rate, **minutes recovered**, fees, live bay status
**Small print:** Recovered minutes = 120-min fixed-hold baseline (Germany's common 2-hour charger parking limit) minus the time a failed booking actually held the bay.
**Visual:** dashboard screenshot.
**Scores:** Business Case & CPO Value, Utilisation.

### Slide 11: New use cases
**Headline:** The same lock unlocks new business.
**On slide (4 tiles):**
- **Fleets:** guaranteed depot and on-route bays (Ecurious already serves fleets)
- **Retail:** a reserved bay as a loyalty perk while you shop
- **Hotels:** your bay is waiting when you check in
- **Events:** pre-booked bays with entry by plate
**Scores:** Solution Concept & Innovation (20%).

### Slide 12: What didn't work, and what's next
**Headline:** Honest about the gaps. Clear about the path.
**On slide (two columns):**
- **Didn't work yet:** the lock doesn't meter energy (manual start) · no GPS from the lock · OCPI callback not posted · single-server storage · no real payments
- **Next:** card tap from the charger's RFID reader (today entered in the app) · payment integration · database for multiple sites · more operators via OCPI · each new site = one more Ecurious controller, same app
**Closing line:** Thank you. Try it: _[live link or QR]_ · Shivani Saroj · 27shivanisaroj@gmail.com
**Scores:** Documentation & Pitch (15%), Scalability.

---

## 3. Appendix slides (for readers who want detail)

**A1: API calls and data flow**
| Step | Watt does | Ecurious call / event |
|---|---|---|
| Reserve | Validate consent + plate, create hold | `POST /locks/:id/whitelist {plates:[PLATE]}` then `POST /locks/:id/lock` |
| Arrive | Match plate, check in | event `photo_captured` (+ `vehicle_presence: occupied`) |
| Charge | Driver taps Start charging, hold credited | none (no metering on the lock) |
| Leave | Close session, reopen bay | event `vehicle_presence: vacant` → `POST /locks/:id/unlock`, whitelist back to `*` |
| No-show / cancel | Release hold, apply fee rules | `unlock` + whitelist reset |
| Safety net | Re-apply desired state | `GET /api/v1/locks` every 8 s |

**A2: Tools used**
Next.js 15 + React 19 + TypeScript · Leaflet with CARTO Voyager map tiles · GoingElectric API · Ecurious hackathon REST API + Server-Sent Events · OCPI 2.2.1 command model · installable web app (manifest).

**A3: Sources**
NOW GmbH / Nationale Leitstelle factsheet 2025 · Klopstock, TUM 2024 · Hecht et al., iScience 2022 · Consumer Council NI 2024 · Versinetic 2024 · ELBE Quartiersladen report, Hamburg 2022 · Adenaw & Krapf, WEVJ 2022 · GreenCharge D2.8, 2022 · ecurious.com.

---

## 4. Live pitch script (3 minutes)

| Time | Slide | Say |
|---|---|---|
| 0:00–0:20 | 1–2 | "Picture this: you drive 15 minutes to a charger, and someone's parked there. 28% of EV drivers say that happens to them often. Yet German chargers are busy less than 10% of the day. The problem isn't too few chargers. It's that you can't count on one." |
| 0:20–0:40 | 3 | "Watt fixes that. Find a charger on a live map, reserve a bay, and real hardware holds it until you arrive." |
| 0:40–1:30 | 4 (live app or screenshots) | "Here it is on Ecurious's locks. I reserve Bay 2: the barrier rises and my plate goes into the camera. When the camera reads that plate, the barrier lowers by itself; if it can't, I tap my ËCURIOUS card. I charge, I leave, and the bay frees itself." |
| 1:30–1:55 | 5–6 | "Watt is the brain, Ecurious the hands and eyes. We built for what breaks reservations: no-shows get 10 minutes' grace, a blocked bay costs the driver nothing and reroutes them, and an unclear plate asks the driver to confirm." |
| 1:55–2:15 | 7–8 | "Plates are kept only during the booking. And any app can book through OCPI. With your card ID as a second key, a reservation from any app is recognised on site." |
| 2:15–2:45 | 9–11 | "Honest drivers pay nothing extra: the €1.50 hold comes back when you charge. No-shows pay €4, first one free. Operators pay per bay, fleets get guaranteed bays, and retailers and hotels can offer a reserved bay as a perk. Short holds keep bays busy. Hamburg showed long holds empty them." |
| 2:45–3:00 | 12 | "It works today on real hardware. Next comes the card check-in and payments. Thank you." |

---

## 5. Screenshots (ready in docs/screenshots/)

Already captured at 2880 × 1800 (retina), light theme unless noted:

| File | Slide | Shows |
|---|---|---|
| `01-map.png` | 3 | Live map, ËCURIOUS pin with free-bay badge, bay tiles, booking form |
| `02-booking-form.png` | 3 | Plate, optional ËCURIOUS card, arrival, charging time |
| `03-active-booking.png` | 4 | "Reserved" with countdown, plate, late / cancel / card check-in |
| `04-card-check-in.png` | 8 | Card check-in panel (second key) |
| `05-dashboard.png` | 10 | Stats, Live bays, "How bookings ended" chart, benchmarks |
| `06-how-it-works.png` | Appendix | Architecture and process page |
| `07-phone.png` | 3 | Phone view: installable app |
| `08-map-dark.png` | 1 or 12 | Dark theme map (title or closing background) |

_Previous checklist kept for reference:_

Take these in the app (Cmd + Shift + 4 on a Mac), light theme, browser window about 1440 px wide:
1. **Map:** the ËCURIOUS pin with the free-bay badge, plus the bay tiles (Bay 1 unavailable, Bay 2 and 3 free).
2. **Booking form:** plate, arrival, charging time, the optional ËCURIOUS card field, and the price box.
3. **Active booking:** status "Reserved" with the countdown, plus the live hardware feed showing "Barrier raised to hold the bay" and "Camera whitelist set".
4. **Card check-in:** the "Check in with ËCURIOUS card" panel.
5. **Dashboard:** stats, Live bays and the "How bookings ended" chart.
6. **How it works page:** the architecture section (for the appendix).

## 6. Jury Q&A, prepared answers

**"Is this really live, or simulated?"** Live. Bay 2 and Bay 3 are real Ecurious locks driven through their REST API and event stream. Booking raised the real barrier and set the camera whitelist; cancelling lowered it. We didn't have a car on site, so the plate check-in step runs on the camera's events but wasn't filmed with a vehicle.

**"What happens if your server misses an event?"** Every 8 seconds Watt re-reads the locks and re-applies the right state, so a missed event can't leave a bay stuck.

**"What if a driver arrives in a different car?"** The camera sees a plate that doesn't match. If the reading is clear, the bay is marked blocked and the driver is offered another bay at no cost. The driver can also update the plate on the check-in page before arrival.

**"How do you handle a dirty plate, darkness, or foreign plates?"** Reads are normalised (letters from any alphabet, digits). Unclear reads ask the driver to confirm instead of guessing; unreadable ones wait for the driver. A card ID would be a second identifier.

**"Is this GDPR-compliant?"** Designed around data minimisation: consent first, the raw plate only during the hold, a salted hash afterwards, masked plates for others. It's a prototype design, not a legal sign-off.

**"Who pays?"** Honest drivers pay nothing extra (the hold is refunded when they charge); no-shows pay €4; operators pay per reservable bay; fleets and partners pay for guaranteed bays.

**"Don't reservations lower utilisation?"** They do with long holds; that's what Hamburg found. Watt holds only the booked window plus 10 minutes and releases automatically, and blocked bays never charge the waiting driver.

**"How does this scale to other operators and sites?"** Each new site is one more hardware controller behind the same adapter. Other apps book through OCPI. No new app is needed.

**"How do you know if the blocking car is still charging?"** The lock only sees a plate and occupancy. The next step is joining it with the charge point's OCPP session status: an active session means an EV still charging gets an overstay nudge; no session means a parked car, which escalates to the operator after 15 minutes.

**"Do you send reminders?"** Not yet. The plan is a web push 15 minutes before the window and at the start of the grace period, with one-tap "running late" or "cancel".

**"Why not just use OCPP ReserveNow?"** OCPP reserves the connector, not the parking space. A combustion car can still block it. The barrier plus the camera protect the physical bay; OCPP and OCPI remain the standard way to talk to operators and apps.

**"What would you build next with Ecurious?"** Card ID check-in, so a tap or a plate confirms the driver; fleet-reserved bays; payment through the Ecurious wallet.

---

## 7. Submission checklist (before 18:00)
- [ ] Deck exported as **PDF** (16:9)
- [ ] Screenshots on slides 3, 4, 6 and 10; QR code to the live link or repo on slides 1 and 12
- [ ] Documentation link (README / `/docs` page, or a PDF export of `/docs`)
- [ ] Spell-check, and confirm every number has its source line
- [ ] Submit the form once: https://forms.gle/sAdvWuZcUfSNLV3x5
