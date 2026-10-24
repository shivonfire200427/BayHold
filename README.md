# Watt

A charging-app prototype for the Ecurious challenge. Drivers see public charge points, reserve a bay with hardware, check in by license plate, charge, and release the bay. The same server covers no-shows, a vehicle already in the bay, a reservation created by another app, and a small utilisation ledger.

This is a prototype. With `ECURIOUS_BASE_URL` and `ECURIOUS_API_KEY` set, the Ecurious Smart Bays site is the three live locks. It does not call public or production chargers.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

1. Leave **Reservable only** on and open **Ecurious Smart Bays**. Pick **Light**, **Auto** or **Dark** in the top bar.
2. Plate `M-WA 1001`, arrival now, in 15 minutes, or in 30 minutes, 30 minutes of charging, tick the plate notice, then **Reserve this bay**.
3. Arrive by driving onto the bay. The lock camera checks the plate in. **Start charging** confirms the plug; the lock does not meter energy. **End session and release** closes the hold. The bay frees when the camera sees the car leave.
4. Open **Operator** for the ledger of bookings made in this app.
5. Set `GOINGELECTRIC_API_KEY` for live GoingElectric data. Each live station links to its GoingElectric entry, as the API terms require.

## Environment

See `.env.example`.

| Variable | Role |
| --- | --- |
| `GOINGELECTRIC_API_KEY` | Server-side directory search. Without it, the map shows only the Ecurious locks and says why. |
| `ECURIOUS_BASE_URL` | Ecurious hardware server, e.g. `https://parking-lock-service-production.up.railway.app`. When set with a key, the test bay drives the real locks. |
| `ECURIOUS_API_KEY` | Team key for the Ecurious hackathon API (sent as `X-API-Key`). The Ecurious Smart Bays site maps to `lock-0001…0003`. |
| `ECURIOUS_DEVICE_KEY` | When set, camera posts must send `x-device-key`. |
| `SHOWCASE_MODE` | Set `true` for a public link: reads live lock status and events, never moves the physical locks; a banner says so. |
| `APP_PASSWORD` | Optional. Set it for any public deployment; the browser asks for it (any username). |
| `OCPI_TOKEN` | Optional. When set, OCPI partners must send `Authorization: Token <value>`. |
| `PLATE_HASH_SALT` | Salt for plate hashes. The demo salt is not a secret. |
| `NEXT_PUBLIC_VENUE_LAT`, `NEXT_PUBLIC_VENUE_LNG` | Where the Ecurious bays stand and where the map opens. Set to the venue, TUM Audimax (48.14956, 11.56744). Optional `NEXT_PUBLIC_VENUE_STREET`, `_POSTCODE`, `_CITY`. |

## API

- `GET /api/stations?lat&lng&radius&minPower`
- `POST /api/reservations` `{ stationId, bayId, plate, holderName, durationMin, startsInMin, consent }`
- `GET /api/reservations/:id`
- `POST /api/reservations/:id` `{ action }` where action is `cancel`, `late`, `confirm_plate`, `reject_plate`, `charge`, `release`, `bind_plate`, or `reroute`
- `GET /api/hardware` live lock status and the recent Ecurious event log
- `GET /api/operator/summary` and `POST /api/operator/reset`
- `POST /api/ocpi/2.2.1/commands/RESERVE_NOW` and `CANCEL_RESERVATION`

OCPI replies immediately. `response_url` is not called. `data.check_in_url` is a Watt extension because OCPI has no license plate.

## Pricing and utilisation

Hold €1.50, credited if charging starts. Grace 10 minutes. One 10-minute late extension. Cancel free until 15 minutes before the window, or within 5 minutes of booking. No-show €4, first one waived per plate. A blocked bay is not charged to the waiting driver.

Recovered minutes use a 120-minute fixed-hold baseline: `max(0, 120 − minutes the bay was actually held)` for no-shows, cancellations, and blocked releases. Completed charges recover zero minutes because the bay was used. The operator page states that baseline. It is not a city-wide claim.

## Plate data

This is a prototype design, not a legal assessment. The driver consents before a Watt booking. The raw plate is stored only while the hold is active, then cleared 24 hours after it ends. A salted hash remains for the no-show waiver. Blocked vehicles are shown masked. Operators see an eight-character audit reference.

## What did not work

- GoingElectric is fetched on the server so the key stays off the browser. The provider’s terms prefer a device fetch. The map names the source and links each entry. If the key is missing or the request fails, the map shows an error, not invented sites. Nothing is scraped.
- The lock does not meter energy. “Start charging” is the driver confirming they plugged in.
- The lock does not report its map position. The pin is the configured venue, TUM Audimax, taken from the event page. The locks share that one pin.
- The lock does not send an OCR score. A complete plate is a confident read. A broken read waits for the driver.
- A vehicle the lock already reports blocks a new booking. An old photo on the lock is not replayed into a reservation.
- The app does not speak OCPP to a charge point. ReserveNow is only the model for the hold. OCPI `response_url` is not called.
- One `data/state.json` file is the store. Two server processes would not share it.

## Project structure

- `src/app/`: pages (Map, Dashboard, How it works, check-in) and the API routes
- `src/components/`: the map, booking panel, live bays, chart and theme switch
- `src/lib/ecurious.ts`: the link to the ËCURIOUS locks (commands, live events, 8-second sync)
- `src/lib/store.ts`: bookings and the rules (grace period, fees, plate matching, privacy)
- `src/lib/goingelectric.ts`: public charge points for the map
- `src/lib/stations.ts` and `src/lib/venue.ts`: the ËCURIOUS bays (lock-0002, lock-0003) at TUM Audimax
- `docs/screenshots/`: screenshots of the app
