"use client";

import { storageSet } from "@/lib/storage";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Reservation } from "@/lib/types";

export default function CheckInPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [plate, setPlate] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    void fetch(`/api/reservations/${id}`)
      .then((response) => response.json())
      .then((body) => {
        if (body.reservation) {
          setReservation(body.reservation);
          storageSet("watt-reservation", body.reservation.id);
        } else setError(body.error ?? "Reservation not found");
      });
  }, [id]);

  async function bind() {
    setError("");
    if (!consent) {
      setError("Confirm the plate notice before continuing.");
      return;
    }
    const response = await fetch(`/api/reservations/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "bind_plate", plate }),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "Could not bind the plate");
      return;
    }
    storageSet("watt-reservation", body.reservation.id);
    setReservation(body.reservation);
  }

  return (
    <main className="page narrow">
      <p className="kicker">Check-in from another app</p>
      <h1>Bind the car that will arrive</h1>
      {reservation && (
        <p className="muted">
          {reservation.stationName} · {reservation.bayLabel}. The camera only auto-matches after a plate is on this hold.
        </p>
      )}
      {error && <p className="status no_show">{error}</p>}
      <label>
        Plate
        <input aria-label="Plate" value={plate} onChange={(event) => setPlate(event.target.value)} placeholder="M-WA 1001" />
      </label>
      <label className="check">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>Keep this plate only while the hold is active, then a hash for 24 hours. Prototype design, not legal advice.</span>
      </label>
      <button className="btn" onClick={() => void bind()} disabled={!consent}>
        Bind plate
      </button>
      {reservation?.plate && <p className="muted">Bound plate {reservation.plate}. Open the map to watch the bay.</p>}
      <a href="/">← Back to the map</a>
    </main>
  );
}
