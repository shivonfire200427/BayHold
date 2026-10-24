"use client";

import { storageGet, storageRemove, storageSet } from "@/lib/storage";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { euros, formatWhen, PRICING } from "@/lib/policy";
import type { PublicBay, PublicStation, Reservation } from "@/lib/types";
import { VENUE } from "@/lib/venue";
import { MapCanvas } from "./MapCanvas";

const STORAGE = "watt-reservation";
const HOME = { lat: VENUE.lat, lng: VENUE.lng };
/** Radius sent to GET /api/stations. The nearby control uses this same value. */
const SEARCH_RADIUS_KM = 5;
const ACTIVE = ["held", "plate_review", "arrived", "charging", "blocked"];

type Clock = { offsetMs: number; now: string };
type Alt = { stationId: string; stationName: string; bay: { id: string; label: string; powerKw: number } };
type Toast = { id: number; kind: "info" | "success" | "error"; text: string };

const COPY: Record<string, string> = {
  held: "Bay hold is on. Other drivers are turned away until you arrive.",
  plate_review: "The camera is unsure. Confirm the plate, or say it is not your car.",
  arrived: "Your plate is checked in. Plug in to start, and the hold is credited.",
  charging: "Charging. When you leave, the bay releases itself.",
  blocked: "A different vehicle is already in the bay. The hold does not trap it, and you are not charged.",
  completed: "Session closed. The bay frees when the camera sees your vehicle leave.",
  cancelled: "Reservation cancelled.",
  no_show: "The grace period ended and the bay was released.",
  released: "The hold was released.",
};

const STATUS_LABEL: Record<string, string> = {
  held: "Reserved",
  plate_review: "Check plate",
  arrived: "Checked in",
  charging: "Charging",
  blocked: "Bay blocked",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
  released: "Released",
};

export function DriverApp() {
  const [origin, setOrigin] = useState(HOME);
  const [recenter, setRecenter] = useState(0);
  const [stations, setStations] = useState<PublicStation[]>([]);
  const [notice, setNotice] = useState("");
  const [liveData, setLiveData] = useState(false);
  const [hardware, setHardware] = useState("ecurious");
  const [clock, setClock] = useState<Clock>({ offsetMs: 0, now: new Date().toISOString() });
  const [reservableOnly, setReservableOnly] = useState(true);
  const [selectedId, setSelectedId] = useState("hack-bay");
  const [bayId, setBayId] = useState("");
  const [plate, setPlate] = useState("");
  const [name, setName] = useState("");
  const [card, setCard] = useState("");
  const [showcase, setShowcase] = useState(false);
  const [arrival, setArrival] = useState(0);
  const [duration, setDuration] = useState(30);
  const [consent, setConsent] = useState(false);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [alternatives, setAlternatives] = useState<Alt[]>([]);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((items) => [...items.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), kind === "error" ? 8000 : 5000);
  }, []);

  const loadStations = useCallback(async (lat: number, lng: number) => {
    try {
      const response = await fetch(`/api/stations?lat=${lat}&lng=${lng}&radius=${SEARCH_RADIUS_KM}`);
      const body = await response.json();
      setStations(body.stations ?? []);
      setNotice(body.notice ?? "");
      setLiveData(Boolean(body.live));
      setHardware(body.hardware ?? "ecurious");
      setShowcase(Boolean(body.showcase));
      if (body.clock) setClock(body.clock);
    } catch {
      setNotice("Could not load charge points. Check that the server is running.");
    }
  }, []);

  const loadReservation = useCallback(async (id: string, onlyIfActive = false) => {
    const response = await fetch(`/api/reservations/${id}`);
    const body = await response.json();
    // On a fresh page load, bring back a booking still in progress, not a finished one.
    if (!response.ok || (onlyIfActive && !ACTIVE.includes(body.reservation?.status))) {
      setReservation(null);
      storageRemove(STORAGE);
      return;
    }
    setReservation(body.reservation);
    setAlternatives(body.alternatives ?? []);
    if (body.clock) setClock(body.clock);
  }, []);

  useEffect(() => {
    const stored = storageGet(STORAGE);
    if (stored) void loadReservation(stored, true);
    void loadStations(HOME.lat, HOME.lng);
  }, [loadReservation, loadStations]);

  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!reservation) return;
    const timer = setInterval(() => void loadReservation(reservation.id), 4000);
    return () => clearInterval(timer);
  }, [reservation?.id, loadReservation]);

  useEffect(() => {
    if (!reservation) return;
    setSelectedId(reservation.stationId);
    setBayId(reservation.bayId);
  }, [reservation?.id, reservation?.stationId, reservation?.bayId]);

  useEffect(() => {
    const timer = setInterval(() => void loadStations(origin.lat, origin.lng), 20000);
    return () => clearInterval(timer);
  }, [origin, loadStations]);

  const visible = useMemo(
    () => (reservableOnly ? stations.filter((station) => station.reservable) : stations),
    [stations, reservableOnly],
  );
  const nearby = useMemo(
    () =>
      [...visible].sort(
        (a, b) => Number(b.reservable) - Number(a.reservable) || a.distanceKm - b.distanceKm,
      ),
    [visible],
  );
  const selected = stations.find((station) => station.id === selectedId) ?? visible[0];
  const chosenBay =
    selected?.bays.find((bay) => bay.id === bayId) ?? selected?.bays.find((bay) => !bay.offline) ?? selected?.bays[0];
  const isActive = reservation ? ACTIVE.includes(reservation.status) : false;

  function pick(id: string) {
    setSelectedId(id);
    const station = stations.find((item) => item.id === id);
    setBayId((station?.bays.find((bay) => !bay.offline) ?? station?.bays[0])?.id ?? "");
  }

  async function reserve() {
    if (!selected || !chosenBay) return;
    if (!consent) {
      notify("error", "Tick the plate notice before reserving.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stationId: selected.id,
          bayId: chosenBay.id,
          plate,
          holderName: name || "Driver",
          card: card.trim() || undefined,
          durationMin: duration,
          startsInMin: arrival,
          consent,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        notify("error", body.error ?? "Could not reserve this bay.");
        return;
      }
      storageSet(STORAGE, body.reservation.id);
      setReservation(body.reservation);
      if (body.clock) setClock(body.clock);
      notify("success", `${selected.name} · ${chosenBay.label} is reserved for you.`);
      if (body.hardwareError) notify("error", `Hardware: ${body.hardwareError}`);
      else if (chosenBay.lockId && showcase) notify("info", "Showcase mode: on site, the barrier would rise now and your plate would go into the camera.");
      else if (chosenBay.lockId) notify("info", "ËCURIOUS lock: barrier raising and your plate is set in the camera.");
      void loadStations(origin.lat, origin.lng);
    } catch {
      notify("error", "Network error. The reservation was not sent.");
    } finally {
      setBusy(false);
    }
  }

  async function act(action: string, extra: Record<string, string> = {}) {
    if (!reservation) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/reservations/${reservation.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const body = await response.json();
      if (!response.ok) {
        notify("error", body.error ?? "That action did not go through.");
        return;
      }
      if (body.reservation?.id) storageSet(STORAGE, body.reservation.id);
      setReservation(body.reservation);
      setAlternatives(body.alternatives ?? []);
      if (body.clock) setClock(body.clock);
      if (body.hardwareError) notify("error", `Hardware: ${body.hardwareError}`);
      if (action === "late") notify("success", `Hold extended by ${PRICING.lateExtensionMinutes} minutes.`);
      if (action === "reroute") notify("success", `Rerouted to ${body.reservation?.stationName}.`);
      void loadStations(origin.lat, origin.lng);
    } catch {
      notify("error", "Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    storageRemove(STORAGE);
    setReservation(null);
  }

  const live = tick >= 0;
  const remain = reservation && isActive ? remaining(reservation.holdUntil, clock.offsetMs, live) : "";
  const reserveBlockedReason = !chosenBay
    ? ""
    : chosenBay.offline
      ? "This lock is not assigned to your team right now. Pick another lock."
      : chosenBay.occupancy === "vehicle"
      ? "A vehicle is already in this bay. It stays blocked until the camera sees the car leave."
      : !chosenBay.available
        ? "This bay is already reserved. Pick another bay."
        : !consent
          ? "Tick the plate notice to continue."
          : "";

  return (
    <div className="stage">
      <div className="map-wrap">
        <MapCanvas
          stations={visible}
          selectedId={selected?.id}
          origin={origin}
          recenter={recenter}
          liveData={liveData}
          onLocated={() => notify("info", "Showing your live location. Drag the map to look around, tap the arrow to re-centre.")}
          onLocateError={(message) => notify("error", message)}
          onSelect={pick}
          onMove={(lat, lng) => {
            setOrigin({ lat, lng });
            void loadStations(lat, lng);
          }}
        />
        <div className="map-tools">
          <button
            className={reservableOnly ? "chip on" : "chip"}
            aria-pressed={reservableOnly}
            onClick={() => setReservableOnly((value) => !value)}
          >
            {reservableOnly ? "Reservable only" : "All charge points"}
          </button>
          <button
            className="chip"
            onClick={() => {
              setOrigin(HOME);
              setRecenter((value) => value + 1);
              void loadStations(HOME.lat, HOME.lng);
            }}
          >
            Back to venue
          </button>
        </div>
        <div className="legend" aria-label="Map legend">
          <span><i className="legend-poi" />Bookable bays</span>
          <span><i className="legend-poi busy" />All taken</span>
          {!reservableOnly && <span><i style={{ background: "var(--pin-directory)" }} />Public charge point</span>}
        </div>
      </div>

      <aside className="side">
        <div className="side-scroll">
          {showcase && (
            <p className="notice showcase">
              <b>Showcase mode.</b> Live map, live lock status and the full booking flow, but this public link does not
              move the physical ËCURIOUS barriers. On site, the same app drives the real locks.
            </p>
          )}
          {notice && !liveData && <p className="notice info">{notice}</p>}

          {reservation && (
            <section className={isActive ? "card accent stack" : "card stack"} aria-live="polite">
              <div className="row">
                <span className={`badge ${badgeKind(reservation.status)}`}>{STATUS_LABEL[reservation.status] ?? reservation.status}</span>
                {remain && <span className="timer" title="Time left on the hold">{remain}</span>}
              </div>
              <div>
                <h2 className={reservation.stationName.includes("BayHold") ? "as-typed" : undefined}>{reservation.stationName}</h2>
                <p className="muted small">
                  {reservation.bayLabel} · {formatWhen(reservation.windowStart)}–{formatWhen(reservation.windowEnd)}
                </p>
              </div>
              <p key={reservation.status} className={`status status-swap ${reservation.status}`}>{COPY[reservation.status]}</p>
              {reservation.plate && (
                <div className="plate" aria-label={`Plate ${reservation.plate}`}>
                  <i className="eu">D</i>
                  <span>{reservation.plate}</span>
                </div>
              )}
              {reservation.blockerMasked && <p className="muted small">Vehicle in the bay: {reservation.blockerMasked}</p>}
              {reservation.plateReview && (
                <p className="muted small">
                  Camera read {reservation.plateReview.plate} at {Math.round(reservation.plateReview.confidence * 100)}%.
                </p>
              )}
              {reservation.notes.at(-1) && <p className="muted small">{reservation.notes.at(-1)}</p>}

              <div className="stack">
                {reservation.status === "held" && (
                  <>
                    <button className="btn" disabled={busy || reservation.lateExtensionUsed} onClick={() => act("late")}>
                      {reservation.lateExtensionUsed ? "Late extension used" : `I’m running late (+${PRICING.lateExtensionMinutes} min)`}
                    </button>
                    <button className="btn-ghost" disabled={busy} onClick={() => act("cancel")}>
                      Cancel reservation
                    </button>
                  </>
                )}
                {(reservation.status === "held" || reservation.status === "plate_review") && (
                  <CardKey
                    masked={reservation.cardMasked}
                    busy={busy}
                    onCheckIn={(value) => act("card_check_in", { card: value })}
                    onBind={(value) => act("bind_card", { card: value })}
                  />
                )}
                {reservation.status === "plate_review" && (
                  <>
                    <button className="btn" disabled={busy} onClick={() => act("confirm_plate")}>
                      This is my car
                    </button>
                    <button className="btn-danger" disabled={busy} onClick={() => act("reject_plate")}>
                      Not my car
                    </button>
                  </>
                )}
                {reservation.status === "arrived" && (
                  <>
                    <p className="muted small">The lock does not meter energy. Tap when you plug in, and the hold is credited.</p>
                    <button className="btn" disabled={busy} onClick={() => act("charge")}>
                      Start charging
                    </button>
                    <button className="btn-ghost" disabled={busy} onClick={() => act("release")}>
                      Leave without charging
                    </button>
                  </>
                )}
                {reservation.status === "charging" && (
                  <button className="btn" disabled={busy} onClick={() => act("release")}>
                    End session and release
                  </button>
                )}
                {reservation.status === "blocked" && (
                  <>
                    {alternatives.length > 0 && <p className="field-label">Free bays nearby</p>}
                    {alternatives.slice(0, 3).map((option) => (
                      <button
                        key={option.bay.id}
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() => act("reroute", { bayId: option.bay.id, stationId: option.stationId })}
                      >
                        Go to {option.stationName} · {option.bay.label}
                      </button>
                    ))}
                    <button className="btn-ghost" disabled={busy} onClick={() => act("release")}>
                      Release this hold, no fee
                    </button>
                  </>
                )}
                {!isActive && (
                  <button className="btn" onClick={dismiss}>
                    Book again
                  </button>
                )}
              </div>
              {reservation.settledCents > 0 && (
                <p className="muted small">
                  {euros(reservation.settledCents)} · {reservation.feeReason}
                </p>
              )}
            </section>
          )}

          {selected && (
            <section className="card stack numbered">
              <div className="section-title">
                <span className="kicker">{selected.distanceKm} km away · {selected.network === "BayHold" ? <span className="as-typed">{selected.network}</span> : selected.network}</span>
                {selected.reservable ? <span className="badge">Reservable</span> : <span className="badge dim">Directory</span>}
              </div>
              <div>
                <h1 className={selected.name.includes("BayHold") ? "as-typed" : undefined}>{selected.name}</h1>
                <p className="muted small">
                  {[selected.street, `${selected.postcode} ${selected.city}`.trim()].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="facts">
                {selected.bays.some((bay) => bay.lockId) ? (
                  <>
                    <span className="fact">Smart ground lock</span>
                    <span className="fact">Plate camera check-in</span>
                  </>
                ) : (
                  <>
                    <span className="fact">Up to {selected.maxPowerKw} kW</span>
                    {selected.connectors.map((connector) => (
                      <span key={`${connector.type}-${connector.powerKw}`} className="fact">
                        {connector.count}× {connector.type} · {connector.powerKw} kW
                      </span>
                    ))}
                  </>
                )}
              </div>

              {selected.bays.length > 0 && (
                <div className="bays">
                  <div className="field-label bays-head">
                    <span>Choose a bay</span>
                    {selected.bays.some((bay) => bay.lockId) && hardware === "ecurious" && (
                      <span className="live-pill"><i /> Live hardware</span>
                    )}
                  </div>
                  <div className="bay-grid">
                    {selected.bays.map((bay) => (
                      <BayRow key={bay.id} bay={bay} selected={bay.id === chosenBay?.id} onPick={() => setBayId(bay.id)} />
                    ))}
                  </div>
                </div>
              )}

              {selected.reservable && !(reservation && isActive) && chosenBay && (
                <form
                  className="stack"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void reserve();
                  }}
                >
                  <label>
                    <span className="field-label">Licence plate</span>
                    <input value={plate} onChange={(event) => setPlate(event.target.value)} autoComplete="off" placeholder="e.g. M-AB 1234" required />
                  </label>
                  <label>
                    <span>
                      Name <span className="muted">(optional)</span>
                    </span>
                    <input value={name} onChange={(event) => setName(event.target.value)} placeholder="So the operator can greet you" />
                  </label>
                  <label>
                    <span>
                      ËCURIOUS card <span className="muted">(optional second key)</span>
                    </span>
                    <input
                      value={card}
                      onChange={(event) => setCard(event.target.value)}
                      placeholder="Card number, e.g. 0471 9840"
                      autoComplete="off"
                      inputMode="text"
                    />
                    <span className="small muted">If the camera cannot read your plate, tap this card to check in.</span>
                  </label>
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="field-label">Arrival</span>
                    <Segmented
                      label="Arrival"
                      value={arrival}
                      onChange={setArrival}
                      options={[
                        { value: 0, label: "Now" },
                        { value: 15, label: "In 15 min" },
                        { value: 30, label: "In 30 min" },
                      ]}
                    />
                  </div>
                  <div className="stack" style={{ gap: 6 }}>
                    <span className="field-label">Charging time</span>
                    <Segmented
                      label="Charging time"
                      value={duration}
                      onChange={setDuration}
                      options={[
                        { value: 30, label: "30 min" },
                        { value: 45, label: "45 min" },
                        { value: 60, label: "60 min" },
                      ]}
                    />
                  </div>
                  <span className="field-label">Confirm</span>
                  <div className="price-note">
                    <span>Hold fee <b>{euros(PRICING.holdCents)}</b>, credited back when you charge.</span>
                    <span>No-show <b>{euros(PRICING.noShowCents)}</b> after {PRICING.graceMinutes} min grace. Your first one is waived.</span>
                  </div>
                  <label className="check">
                    <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                    <span className="small">
                      Use my plate to recognise my car at the bay. It is kept only while the hold is active, then only a hash for 24 hours.
                    </span>
                  </label>
                  <button className="btn lg wide" disabled={busy || Boolean(reserveBlockedReason)} type="submit">
                    {busy ? "Reserving…" : "Reserve this bay"}
                  </button>
                  {reserveBlockedReason && <p className="muted small">{reserveBlockedReason}</p>}
                </form>
              )}

              {selected.source === "goingelectric" && selected.url && (
                <p className="source">
                  Data: GoingElectric.de ·{" "}
                  <a href={selected.url} target="_blank" rel="noopener noreferrer">
                    View this entry on GoingElectric.de
                  </a>
                </p>
              )}
              {selected.source === "ecurious" && (
                <p className="source">
                  {selected.bays.some((bay) => bay.lockId)
                    ? "ËCURIOUS ground locks. The pin is the configured venue, not a coordinate reported by the lock. This is not a public charger."
                    : selected.reservable
                      ? "ËCURIOUS hardware: real parking locks with plate cameras, controlled live by this app."
                      : "ËCURIOUS site."}
                </p>
              )}
              {!selected.reservable && <p className="notice">This site has no reservation hardware. You can still navigate to it.</p>}
            </section>
          )}

          {hardware === "ecurious" && (
            <section className="card stack">
              <span className="kicker">Live locks</span>
              <HardwareFeed />
            </section>
          )}

          {!(reservation && isActive) && (
            <section className="stack">
              <NearbySelect stations={nearby} selected={selected} radiusKm={SEARCH_RADIUS_KM} onPick={pick} />
              {liveData && (
                <p className="source">
                  Public charge point data from{" "}
                  <a href="https://www.goingelectric.de/stromtankstellen/" target="_blank" rel="noopener noreferrer">
                    GoingElectric.de
                  </a>
                  . Reservable sites are ËCURIOUS hardware.
                </p>
              )}
            </section>
          )}
        </div>
      </aside>

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.kind}`}>
            <p>{toast.text}</p>
            <button aria-label="Dismiss" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function NearbySelect({
  stations,
  selected,
  radiusKm,
  onPick,
}: {
  stations: PublicStation[];
  selected?: PublicStation;
  radiusKm: number;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const label = `Nearby · ${stations.length} within ${radiusKm} km`;
  const needle = query.trim().toLowerCase();
  const shown = needle ? stations.filter((station) => station.name.toLowerCase().includes(needle)) : stations;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="nearby" ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className="nearby-toggle"
        aria-expanded={open}
        aria-controls="nearby-menu"
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="nearby-label">{label}</span>
        {selected && (
          <span className="nearby-current">
            <span className="nearby-name">{selected.name}</span>
            <span className="meta">{selected.distanceKm} km</span>
            <span className="meta">{stationMark(selected)}</span>
          </span>
        )}
      </button>
      {open && (
        <div className="nearby-menu" id="nearby-menu">
          <input
            className="nearby-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name"
            aria-label="Filter by name"
            autoFocus
          />
          <div className="nearby-list" role="listbox" aria-label={label}>
            {shown.map((station) => (
              <button
                key={station.id}
                type="button"
                role="option"
                className="nearby-row"
                aria-selected={station.id === selected?.id}
                onClick={() => {
                  onPick(station.id);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="nearby-name">{station.name}</span>
                <span className="meta">{station.distanceKm} km</span>
                <span className="meta">{stationMark(station)}</span>
              </button>
            ))}
            {shown.length === 0 && <p className="nearby-empty">No matching sites</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function stationMark(station: PublicStation) {
  return station.reservable ? "Reservable" : `${station.maxPowerKw} kW`;
}

/** Second check-in key: the driver's ËCURIOUS card. In production the tap comes from the charger's RFID reader. */
function CardKey({
  masked,
  busy,
  onCheckIn,
  onBind,
}: {
  masked?: string;
  busy: boolean;
  onCheckIn: (card: string) => void;
  onBind: (card: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open) {
    return (
      <button type="button" className="btn-secondary card-key-toggle" disabled={busy} onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg>
        {masked ? `Check in with ËCURIOUS card ${masked}` : "Add an ËCURIOUS card as a second key"}
      </button>
    );
  }
  return (
    <form
      className="card-key"
      onSubmit={(event) => {
        event.preventDefault();
        if (!value.trim()) return;
        (masked ? onCheckIn : onBind)(value.trim());
        setValue("");
        setOpen(false);
      }}
    >
      <label>
        <span>{masked ? `Tap or enter card ${masked}` : "Card number"}</span>
        <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder="e.g. 0471 9840" autoComplete="off" />
      </label>
      <div className="row">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn" disabled={busy || !value.trim()}>{masked ? "Check in" : "Add card"}</button>
      </div>
      <p className="small muted">The card number is stored only as a salted hash; you see the last four digits.</p>
    </form>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: number;
  options: { value: number; label: string }[];
  onChange: (value: number) => void;
}) {
  return (
    <div
      className="segmented"
      role="radiogroup"
      aria-label={label}
      style={{ "--i": Math.max(0, options.findIndex((option) => option.value === value)), "--n": options.length } as React.CSSProperties}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

type FeedEvent = { at: string; lockId: string; kind: string; detail: string };

/** Live log of what the ËCURIOUS locks just did, polled from our server. */
// Time only, same in every browser (Safari words dates differently from Chrome).
const FEED_TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "Europe/Berlin",
});

/** "lock-0002" -> "Bay 2", matching the bay tiles. */
function bayName(lockId: string): string {
  const number = Number(lockId.replace(/\D/g, ""));
  return Number.isFinite(number) && number > 0 ? `Bay ${number}` : lockId;
}

function HardwareFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch("/api/hardware");
        const body = await response.json();
        if (!stop) {
          setEvents(body.log ?? []);
          setConnected(Boolean(body.connected));
        }
      } catch {
        if (!stop) setConnected(false);
      }
    };
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);
  const rows = events.slice(0, 5);
  const alarm = events.slice(0, 10).find((event) => event.kind === "alarm");
  return (
    <div className="feed">
      <div className="feed-head">
        <h2 className="feed-title">Live locks</h2>
        <p className="feed-status">
          <span className={connected ? "dot on" : "dot"} aria-hidden="true" />
          {connected ? "Connected" : "Connecting"}
        </p>
      </div>
      {alarm && (
        <p className="feed-alarm" role="alert">
          {bayName(alarm.lockId)}: {alarm.detail.replace(/^Alarm:\s*/, "").replace(/_/g, " ")}. Check the lock before booking.
        </p>
      )}
      {rows.length === 0 ? (
        <p className="feed-empty">No hardware events yet.</p>
      ) : (
        <>
          <div className="feed-cols" aria-hidden="true">
            <span>Time</span>
            <span>Lock</span>
            <span>Event</span>
          </div>
          <ol className="feed-list">
            {rows.map((event) => (
              <li
                key={`${event.at}-${event.detail}`}
                className={event.kind === "alarm" || event.kind === "error" ? "feed-row alarm" : "feed-row"}
              >
                <time className="feed-time" dateTime={event.at}>
                  {FEED_TIME.format(new Date(event.at))}
                </time>
                <span className="feed-lock">{bayName(event.lockId)}</span>
                <span className="feed-detail">{event.detail}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function BayRow({ bay, selected, onPick }: { bay: PublicBay; selected: boolean; onPick: () => void }) {
  const label = bay.offline
    ? "Unavailable"
    : bay.occupancy === "vehicle"
      ? "Occupied"
      : bay.available
        ? "Free"
        : "Reserved";
  const kind = bay.offline ? "offline" : bay.occupancy === "vehicle" ? "danger" : bay.available ? "free" : "warn";
  const meta = bay.offline
    ? "Not assigned to us"
    : bay.lockId
      ? `Barrier ${bay.hold === "engaged" ? "up" : "down"}`
      : `${bay.powerKw} kW`;
  return (
    <button
      type="button"
      className={`bay bay-tile ${kind}`}
      onClick={onPick}
      aria-pressed={selected && !bay.offline}
      disabled={bay.offline}
      title={bay.offline ? "ËCURIOUS has not assigned this lock to our team right now." : undefined}
    >
      <span className="bay-name">{bay.label}</span>
      <span className="bay-state"><i />{label}</span>
      <span className="meta">{meta}</span>
    </button>
  );
}

function badgeKind(status: string) {
  if (["held", "arrived", "charging", "completed"].includes(status)) return "";
  if (["blocked", "plate_review"].includes(status)) return "warn";
  if (["no_show", "cancelled"].includes(status)) return "danger";
  return "dim";
}

function remaining(until: string, offsetMs: number, _live: boolean) {
  const ms = Date.parse(until) - (Date.now() + offsetMs);
  if (ms <= 0) return "0:00";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
