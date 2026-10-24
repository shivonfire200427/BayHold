/**
 * Published, citable figures used to ground the demo. Every number here comes
 * from the linked source; anything we had to assume lives in ASSUMPTIONS below.
 */
export type Benchmark = {
  id: string;
  value: string;
  label: string;
  source: string;
  url: string;
};

export const BENCHMARKS: Benchmark[] = [
  {
    id: "occupancy",
    value: "2.3 h/day · 9.6%",
    label: "Average daily occupancy of ~28,000 funded public charge points in Germany (Jul 2023 – Jun 2024). Midday peak ≈ 19% in use at once.",
    source: "Nationale Leitstelle Ladeinfrastruktur / NOW GmbH, 2025",
    url: "https://www.now-gmbh.de/en/news/pressreleases/new-factsheet-on-charging-point-utilisation-time-of-day-location-and-season-are-decisive-factors/",
  },
  {
    id: "munich-idle",
    value: "5.12 h plugged · 1.45 h charging",
    label: "Munich public charging: ~1,600 sessions a day; about 72% of plugged-in time delivers no energy.",
    source: "TUM master's thesis (Klopstock), 2024",
    url: "https://www.mos.ed.tum.de/fileadmin/w00ccp/vt/theses/pdf/MA/2024/MA_Klopstock_Aushang.pdf",
  },
  {
    id: "session",
    value: "~40 kWh in 45 min (DC) · ~20 kWh in 4 h (AC)",
    label: "Typical energy and duration per charging event at 22,200 German charging stations.",
    source: "Hecht, Figgener, Sauer · iScience, 2022",
    url: "https://doi.org/10.1016/j.isci.2022.105634",
  },
  {
    id: "blocked",
    value: "28% often blocked",
    label: "Share of EV drivers who find public chargers blocked by combustion cars or non-charging EVs “always or very often” (n = 589).",
    source: "Consumer Council Northern Ireland, 2024",
    url: "https://www.consumercouncil.org.uk/sites/default/files/2024-05/Electric_Vehicles_Consumer_Research_Full_Report_210524.PDF",
  },
  {
    id: "blocked-uk",
    value: "14% frequently · 44% occasionally",
    label: "UK drivers who encounter ICE vehicles blocking charging bays (n = 803).",
    source: "Versinetic whitepaper, 2024",
    url: "https://www.versinetic.com/news-blog/charging-on-the-go-public-ev-charging-whitepaper/",
  },
  {
    id: "hamburg",
    value: "1 public ≈ 3 reservable",
    label: "Hamburg “Quartiersladen” pilot with parking barriers: long exclusive holds left bays idle; bookings were mostly short-notice.",
    source: "ELBE pilot report, Hamburg 2022",
    url: "https://www.hysolutions.de/fileadmin/Downloads/Mobilitaet/ELBE_Pilotprojekt_Quartiersladen_Exclusive_reservierbare_Lademoeglichkeiten_fuer_den_hochverdichteten_urbanen_Raum_Kurzbericht.pdf",
  },
  {
    id: "hamburg-2h",
    value: "2 h max parking",
    label: "Hamburg's public chargers limit parking to 2 hours on weekdays 9:00–20:00; more than half of sessions still exceed it.",
    source: "Adenaw & Krapf · World Electric Vehicle Journal, 2022",
    url: "https://doi.org/10.3390/wevj13040056",
  },
  {
    id: "oslo",
    value: "NOK 12/h no-show · 15 min to unplug",
    label: "Booked-charging pilot fees: no-show blocking fee, overstay fee NOK 25/h after a 15-minute unplug grace.",
    source: "GreenCharge project D2.8 (Oslo), 2022",
    url: "https://doi.org/10.5281/zenodo.6394612",
  },
];

/** Figures the pricing math uses because no public reservation dataset exists yet. */
export const ASSUMPTIONS = [
  "No public dataset reports no-show rates for charging reservations. The ledger counts only bookings made in this app.",
  "The 120-minute baseline for recovered minutes mirrors the 2-hour parking limit common at German public chargers (see Hamburg).",
  "Fees (€1.50 hold, €4 no-show) are our proposal, benchmarked against the Oslo pilot, not a live tariff.",
];
