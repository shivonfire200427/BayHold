"use client";

import dynamic from "next/dynamic";

const DriverApp = dynamic(() => import("@/components/DriverApp").then((mod) => mod.DriverApp), {
  ssr: false,
  loading: () => <p className="loading">Loading the map…</p>,
});

export default function HomePage() {
  return <DriverApp />;
}
