"use client";

import { useCallback, useEffect, useState } from "react";
import { CountUp } from "@/components/CountUp";
import { LiveBays } from "@/components/LiveBays";
import { OutcomeChart } from "@/components/OutcomeChart";
import { ASSUMPTIONS, BENCHMARKS } from "@/lib/benchmarks";
import { euros, formatWhen, PRICING } from "@/lib/policy";

type Summary = {
  now: string;
  hardware: string;
  counts: {
    reservations: number;
    active: number;
    arrivals: number;
    noShows: number;
    blocked: number;
    arrivalRate: number;
    noShowRate: number;
  };
  recoveredMinutes: number;
  baselineMinutes: number;
  feesCents: number;
  creditedHolds: number;
  reservations: {
    id: string;
    createdAt: string;
    stationName: string;
    status: string;
    source: string;
    auditRef: string | null;
    settledCents: number;
    feeReason?: string;
    checkInPath: string;
  }[];
};

export default function OperatorPage() {
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/operator/summary");
    setSummary(await response.json());
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 10000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <main className="page">
      <p className="kicker">Charge point operator</p>
      <h1>What the holds actually did</h1>
      <p className="muted">
        The ledger is the bookings made in this app. Recovered minutes compare each closed no-show, cancel, and blocked release with a {summary?.baselineMinutes ?? PRICING.fixedManualHoldMinutes}-minute fixed hold. Hardware mode: {summary?.hardware ?? "…"}.
      </p>
      <section className="stats">
        <div className="stat"><b><CountUp value={summary?.counts.arrivalRate ?? 0} format={(n) => `${Math.round(n)}%`} /></b><span className="muted">Arrival rate</span></div>
        <div className="stat"><b><CountUp value={summary?.counts.noShowRate ?? 0} format={(n) => `${Math.round(n)}%`} /></b><span className="muted">No-show rate</span></div>
        <div className="stat"><b><CountUp value={summary?.recoveredMinutes ?? 0} /></b><span className="muted">Minutes recovered</span></div>
        <div className="stat"><b><CountUp value={summary?.feesCents ?? 0} format={(n) => euros(Math.round(n))} /></b><span className="muted">Fees settled</span></div>
      </section>
      <LiveBays />
      <OutcomeChart rows={summary?.reservations ?? []} />
      <section className="card stack">
        <h2>Pricing</h2>
        <p>Hold {euros(PRICING.holdCents)}, credited when charging starts. No-show {euros(PRICING.noShowCents)} after {PRICING.graceMinutes} minutes of grace. First no-show for a plate is waived. Cancel is free until {PRICING.cancelFreeMinutes} minutes before the window, or within {PRICING.cancelGraceAfterBookingMinutes} minutes of booking. A blocked bay is released with no driver fee.</p>
        <p className="muted">{summary?.counts.blocked ?? 0} blocked events · {summary?.creditedHolds ?? 0} holds credited · {summary?.counts.active ?? 0} open now</p>
      </section>
      <section className="stack">
        <div className="section-title">
          <h2>Real-world benchmarks</h2>
          <span className="badge info">Published sources</span>
        </div>
        <p className="muted small">Published figures behind the pricing. Every number links to its source.</p>
        <div className="benchmarks">
          {BENCHMARKS.map((item) => (
            <article key={item.id} className="benchmark">
              <b>{item.value}</b>
              <p>{item.label}</p>
              <a href={item.url} target="_blank" rel="noopener noreferrer">
                {item.source}
              </a>
            </article>
          ))}
        </div>
        <details className="card">
          <summary><b>What is assumed, not measured</b></summary>
          <ul className="assumptions">
            {ASSUMPTIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      </section>

      <div className="section-title">
        <h2>Ledger</h2>
        <span className="badge dim">Bookings in this app</span>
      </div>
      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Site</th>
            <th>Status</th>
            <th>Audit</th>
            <th>Fee</th>
          </tr>
        </thead>
        <tbody>
          {summary?.reservations.map((item) => (
            <tr key={item.id}>
              <td>{formatWhen(item.createdAt)} · {item.source}</td>
              <td>{item.stationName}</td>
              <td><span className="badge dim">{item.status.replace("_", " ")}</span></td>
              <td>{item.auditRef ?? "—"}</td>
              <td>{item.settledCents ? euros(item.settledCents) : item.feeReason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </main>
  );
}
