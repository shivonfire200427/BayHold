"use client";

import { useEffect, useState } from "react";
import type { PublicBay, PublicStation } from "@/lib/types";

/** Operator view of every ËCURIOUS bay, refreshed live. Unassigned locks stay visible as unavailable. */
export function LiveBays() {
  const [bays, setBays] = useState<PublicBay[]>([]);
  const [site, setSite] = useState("");
  const [live, setLive] = useState(false);
  const [faults, setFaults] = useState<Record<string, string[]>>({});

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const response = await fetch("/api/stations");
        const body = await response.json();
        const station = (body.stations as PublicStation[] | undefined)?.find((item) => item.source === "ecurious");
        if (!stop && station) {
          setBays(station.bays);
          setSite(station.name);
          setLive(body.hardware === "ecurious");
        }
        // Hardware faults (water ingress, motor stall, tamper) straight from the lock telemetry.
        const hardware = await fetch("/api/hardware").then((res) => res.json());
        const next: Record<string, string[]> = {};
        for (const lock of (hardware.locks ?? []) as { id: string; activeErrors?: string[]; waterIngress?: boolean }[]) {
          const list = [...(lock.activeErrors ?? [])];
          if (lock.waterIngress && !list.includes("water_ingress")) list.push("water_ingress");
          if (list.length) next[lock.id] = list;
        }
        if (!stop) setFaults(next);
      } catch {
        // keep the last good state
      }
    };
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  if (!bays.length) return null;
  const usable = bays.filter((bay) => !bay.offline);
  const free = usable.filter((bay) => bay.available).length;

  return (
    <section className="stack">
      <div className="section-title">
        <h2>Live bays</h2>
        {live && <span className="live-pill"><i /> Live from ËCURIOUS</span>}
      </div>
      <p className="muted small">
        {site} · {free} of {usable.length} usable bays free{bays.length > usable.length ? ` · ${bays.length - usable.length} unavailable` : ""}
      </p>
      <div className="live-bays">
        {bays.map((bay) => {
          const state = bay.offline
            ? "offline"
            : bay.occupancy === "vehicle"
              ? "danger"
              : bay.available
                ? "free"
                : "warn";
          const label = bay.offline
            ? "Unavailable"
            : bay.occupancy === "vehicle"
              ? "Occupied"
              : bay.available
                ? "Free"
                : "Reserved";
          return (
            <article key={bay.id} className={`live-bay ${state}`}>
              <div className="row">
                <span className="bay-name">{bay.label}</span>
                <span className="bay-state"><i />{label}</span>
              </div>
              <dl>
                <div><dt>Barrier</dt><dd>{bay.offline ? "—" : bay.hold === "engaged" ? "Raised" : "Lowered"}</dd></div>
                <div><dt>Vehicle</dt><dd>{bay.offline ? "—" : bay.occupancy === "vehicle" ? "Present" : "None"}</dd></div>
                <div><dt>Lock</dt><dd>{bay.lockId ?? "—"}</dd></div>
              </dl>
              {bay.offline && <p className="small muted">Not assigned to our team by ËCURIOUS right now.</p>}
              {bay.lockId && faults[bay.lockId] && (
                <p className="bay-fault" role="alert">
                  Hardware alert: {faults[bay.lockId].map((item) => item.replace(/_/g, " ")).join(", ")}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
