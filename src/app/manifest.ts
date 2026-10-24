import type { MetadataRoute } from "next";

/** Lets the site install as an app ("Add to Home Screen") while staying a normal website. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Watt · Reserve a charging bay",
    short_name: "Watt",
    description:
      "Find public EV chargers, reserve a bay that is free when you arrive, and check in by licence plate.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0F1419",
    theme_color: "#0F1419",
    categories: ["travel", "navigation", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Find a charger", url: "/" },
      { name: "Operator dashboard", url: "/operator" },
    ],
  };
}
