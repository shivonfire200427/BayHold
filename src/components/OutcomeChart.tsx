"use client";

/**
 * How bookings ended, from the real ledger. One measure across categories, so a single-hue
 * horizontal bar chart with direct labels (count + share): no legend, identity never colour-only.
 */
type Row = { status: string };

const OUTCOMES: { key: string; label: string; match: (status: string) => boolean; note: string }[] = [
  { key: "charged", label: "Charged", match: (s) => s === "completed", note: "Driver arrived and charged; hold credited" },
  { key: "active", label: "In progress", match: (s) => ["held", "plate_review", "arrived", "charging"].includes(s), note: "Booking still open" },
  { key: "blocked", label: "Bay blocked", match: (s) => s === "blocked" || s === "released", note: "Another vehicle was in the bay; driver not charged" },
  { key: "no_show", label: "No-show", match: (s) => s === "no_show", note: "Grace period ended; bay released" },
  { key: "cancelled", label: "Cancelled", match: (s) => s === "cancelled", note: "Driver cancelled" },
];

export function OutcomeChart({ rows }: { rows: Row[] }) {
  const total = rows.length;
  const data = OUTCOMES.map((outcome) => ({ ...outcome, count: rows.filter((row) => outcome.match(row.status)).length }));
  const max = Math.max(1, ...data.map((item) => item.count));

  return (
    <section className="stack">
      <div className="section-title">
        <h2>How bookings ended</h2>
        <span className="badge dim">{total} {total === 1 ? "booking" : "bookings"} in this app</span>
      </div>
      {total === 0 ? (
        <p className="muted small">No bookings yet. The chart fills in as drivers reserve the ËCURIOUS bays.</p>
      ) : (
        <figure className="outcome-chart" aria-label="How bookings ended">
          {data.map((item) => {
            const share = Math.round((item.count / total) * 100);
            return (
              <div key={item.key} className="outcome-row" tabIndex={0} data-tip={`${item.label}: ${item.count} of ${total} (${share}%). ${item.note}.`}>
                <span className="outcome-label">{item.label}</span>
                <span className="outcome-track">
                  {item.count > 0 && <span className="outcome-bar" style={{ width: `${(item.count / max) * 100}%` }} />}
                </span>
                <span className="outcome-value">
                  {item.count} <span className="muted">· {share}%</span>
                </span>
              </div>
            );
          })}
          <figcaption className="small muted">
            Source: bookings made in this app on the ËCURIOUS bays. Blocked bays never charge the waiting driver.
          </figcaption>
          <table className="sr-only">
            <caption>How bookings ended</caption>
            <thead><tr><th>Outcome</th><th>Bookings</th><th>Share</th></tr></thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.key}><td>{item.label}</td><td>{item.count}</td><td>{Math.round((item.count / total) * 100)}%</td></tr>
              ))}
            </tbody>
          </table>
        </figure>
      )}
    </section>
  );
}
