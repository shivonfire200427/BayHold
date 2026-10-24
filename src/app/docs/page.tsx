import { PRICING, euros } from "@/lib/policy";

export default function DocsPage() {
  return (
    <main className="page docs">
      <p className="kicker">Process notes</p>
      <h1>How BayHold holds a public bay</h1>
      <p>
        The browser only talks to this app. The app talks to GoingElectric for the map and to an ËCURIOUS adapter for the lock. Until venue credentials are set, the adapter’s stand-in is a file-backed test bay. It does not call production chargers.
      </p>

      <h2>Architecture</h2>
      <p>
        Map and booking live in the driver screen. <code>GET /api/stations</code> merges the ËCURIOUS Smart Bays site (locks 0001–0003) with GoingElectric when <code>GOINGELECTRIC_API_KEY</code> is set. There are no stand-in pins: if GoingElectric is unavailable, the map says so and shows only the real locks. Every live station shows a “Data: GoingElectric.de” credit and a link to its entry, as the API terms require. The key stays on the server. <code>POST /api/reservations</code> creates a hold. <code>POST /api/reservations/:id</code> runs cancel, late, confirm, charge, release, reroute, and bind plate.
      </p>
      <p>
        BayHold is the reservation brain; the ËCURIOUS hackathon server is the hardware layer (Chang Cheng CC5S ground locks with plate cameras). The ËCURIOUS Smart Bays site maps to the team's three real locks (<code>lock-0001…0003</code>). On reserve, BayHold raises the barrier (<code>POST /api/v1/locks/:id/lock</code>) and writes the booked plate into the camera whitelist (<code>/whitelist</code>), so the hardware itself lowers the arm when that car arrives. BayHold listens to the Server-Sent Events stream (<code>/events</code>): <code>photo_captured</code> checks the driver in, <code>vehicle_presence: vacant</code> closes the session, <code>status_change</code> mirrors the arm. A reconcile loop every 8 seconds re-applies the desired state (raised only while a hold is waiting and the bay is empty; open otherwise), so no-shows and cancellations reopen the bay even if an event is missed. Auth uses the team key in an <code>X-API-Key</code> header, kept server-side in <code>ECURIOUS_API_KEY</code>.</p>

      <h2>Reservation cycle</h2>
      <ol>
        <li>Driver picks a reservable bay, plate, arrival, and 30, 45, or 60 minutes, and consents to plate handling.</li>
        <li>The bay hold turns other drivers away. It is not a gate that traps a car already there.</li>
        <li>The camera reads a plate. A confident match checks the driver in. Charging credits the {euros(PRICING.holdCents)} hold. Leaving releases the bay.</li>
        <li>A mismatch marks the bay blocked, shows a masked plate, and offers another free reservable bay. The waiting driver is not charged.</li>
      </ol>

      <h2>No-shows</h2>
      <p>
        The hold lasts the booked window plus {PRICING.graceMinutes} minutes. Arrival is now, in 15 minutes, or in 30 minutes. One “I’m running late” adds {PRICING.lateExtensionMinutes} minutes. Cancel is free until {PRICING.cancelFreeMinutes} minutes before the window, or within {PRICING.cancelGraceAfterBookingMinutes} minutes of booking; after that the hold is kept. If the grace ends, the bay releases. The first no-show for a plate is waived. Later ones settle {euros(PRICING.noShowCents)}.
      </p>

      <h2>Blocked bays</h2>
      <p>
        Booking a bay that already has a vehicle is refused. If a different vehicle arrives after the hold, the camera marks it blocked and opens the physical story of the hold so the car is not trapped. The driver can reroute or release with no fee. If the bay stays blocked for {PRICING.blockedReleaseMinutes} minutes, the hold releases itself. The operator ledger keeps the masked plate and an eight-character audit reference, not the raw plate.
      </p>

      <h2>License plates</h2>
      <p>
        Plates keep letters from any alphabet and digits. A match at 85% confidence or more checks in. A likely match between 60% and 85%, or an unreadable read, waits for the driver. A confident mismatch blocks the bay. The lock does not send a score: a complete plate is treated as a confident read, and a broken one waits. Raw plates stay only while the hold is active, then the field is cleared after 24 hours and a salted hash remains. The driver never sees the other car’s full plate. This is a prototype data design, not a legal assessment. If <code>ECURIOUS_DEVICE_KEY</code> is set, a camera post requires <code>x-device-key</code>.
      </p>

      <h2>Another charging app</h2>
      <p>
        <code>POST /api/ocpi/2.2.1/commands/RESERVE_NOW</code> accepts a location id, an EVSE uid, an expiry, and a token. The reply is an OCPI command result plus a BayHold check-in URL. OCPI has no plate, so the camera waits until the driver binds one at <code>/r/[id]</code>. <code>CANCEL_RESERVATION</code> closes the hold. <code>response_url</code> is not called. OCPP ReserveNow is the inspiration for the state names, and this app does not speak OCPP to a live charge point.
      </p>
      <pre>{`curl -s -X POST http://localhost:3000/api/ocpi/2.2.1/commands/RESERVE_NOW \\
  -H 'content-type: application/json' \\
  -d '{"location_id":"hack-bay","evse_uid":"hack-1","reservation_id":"roam-1","expiry_date":"2026-10-24T18:00:00.000Z","token":{"uid":"ROAM-1"}}'`}</pre>

      <h2>Utilisation</h2>
      <p>
        The operator page sums recovered minutes for no-shows, cancellations, and blocked releases against a {PRICING.fixedManualHoldMinutes}-minute manual hold. A completed charge recovers nothing, because the bay was used. The ledger lists only bookings made in this app. The 120-minute baseline and the fees are stated next to the sourced benchmarks.
      </p>

      <h2>ËCURIOUS card as a second key</h2>
      <p>
        A booking can carry the driver’s ËCURIOUS card as a second check-in key beside the plate. If the camera cannot read the plate, the driver checks in with the card and the barrier lowers. For OCPI bookings the token uid (the charging card in OCPI) becomes that key automatically, so a reservation made in app A is recognised on site for the driver of app B. The card id is stored only as a salted hash, in its own namespace, and shown as the last four digits. In this prototype the tap is entered in the app; in production it would come from the charge point’s RFID reader.
      </p>

      <h2>Guiding questions we answer but did not build</h2>
      <ul>
        <li><b>Reminders.</b> Not built. Plan: a web push 15 minutes before the window and at the start of the grace period, with one-tap “I’m running late” or “Cancel”. The installable app already has the manifest for it.</li>
        <li><b>Detecting a driver who is not coming.</b> Today: plate check-in, the late button and the grace timer. Plan: with the driver’s opt-in, share an ETA from their phone; if the ETA passes the end of the grace period, offer a cancel before a fee applies.</li>
        <li><b>Which kind of car is blocking.</b> The lock reports occupancy and a plate, not the drivetrain or whether a cable is plugged in. BayHold treats any non-booked plate as a block and never charges the waiting driver. Plan: join the plate with the charge point’s OCPP session status: no session means a parked car (combustion or idle EV), an active session means an EV still charging, which gets a friendly overstay nudge instead of an escalation.</li>
        <li><b>Who is responsible and how it escalates.</b> Driver: rerouted at once, no fee. After 15 minutes the hold releases. Proposed operator path: an alert at 15 minutes, then site staff or a parking warden at 30 minutes; the operator ledger already keeps an 8-character audit reference and a masked plate for each block.</li>
        <li><b>Temporary and foreign plates.</b> Plates are normalised to letters of any alphabet and digits, so foreign plates match. A temporary plate the camera cannot read in full goes to the driver to confirm, and the driver can rebind the plate on the check-in page before arrival.</li>
        <li><b>Hardware alarms.</b> Built: alarms from the lock (water ingress, motor stall, tamper) appear in red in the Live locks feed and on the operator’s bay cards.</li>
      </ul>

      <h2>What did not work</h2>
      <ul>
        <li>GoingElectric is fetched on the server so the key never reaches the browser. The provider’s terms prefer a fetch from the driver’s device. The map names the source and links each entry. If the key is missing or the request fails, the map shows an error instead of invented sites. Nothing is scraped.</li>
        <li>The lock does not meter energy. The driver taps “Start charging” when they plug in, and that credits the hold.</li>
        <li>The lock does not report its own coordinates. The ËCURIOUS Smart Bays pin is the hackathon venue, TUM Audimax (Arcisstraße 21), taken from the event page. Exact bay positions would need Ecurious to share them.</li>
        <li>The lock does not send an OCR confidence. A complete plate is a confident read, including letters outside A–Z. A broken read waits for the driver.</li>
        <li>A car already reported by the lock blocks a new booking even before a new photo. An old photo already on the lock is not replayed into a reservation.</li>
        <li>An open lock uses whitelist <code>*</code>, meaning any plate. A hold replaces it with the booked plate. A hold with no plate yet clears it. The hardware feed shows masked plates.</li>
        <li>The OCPI callback URL is not posted. <code>RESERVE_NOW</code> and <code>CANCEL_RESERVATION</code> do push the lock immediately.</li>
        <li>Reservations live in <code>data/state.json</code> for one Node process. A second instance would not share them.</li>
      </ul>

      <h2>Scaling</h2>
      <p>
        Point <code>ECURIOUS_BASE_URL</code> at each site’s controller. Keep this API, or the OCPI commands, as the face other apps call. Deep links already let app A’s reservation be recognised by a driver who opens app B’s check-in page. More locations are more bays behind the same adapter, not a new app.
      </p>
    </main>
  );
}
