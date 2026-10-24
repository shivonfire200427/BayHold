"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { PublicStation } from "@/lib/types";
import { VENUE } from "@/lib/venue";
import { useResolvedTheme } from "./ThemeToggle";

type Props = {
  stations: PublicStation[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onMove: (lat: number, lng: number) => void;
  origin: { lat: number; lng: number };
};

function iconFor(station: PublicStation, selected: boolean) {
  // Free if any bay the team can use is free; offline bays do not count.
  const usable = station.bays.filter((bay) => !bay.offline);
  const busy = usable.length > 0 && !usable.some((bay) => bay.available);
  const cls = station.reservable ? (busy ? "pin busy" : "pin hold") : "pin";
  if (station.reservable && usable.length > 0) {
    // Apple Maps style marker: ink tile with a Voltage bolt, pointer, and a free-bay badge.
    const free = usable.filter((bay) => bay.available).length;
    const state = busy ? "busy" : "free";
    return L.divIcon({
      className: "leaflet-div-icon watt-pin",
      html: `<div class="poi ${state}${selected ? " selected" : ""}" title="${free} of ${usable.length} bays free">
        <div class="poi-body"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 2.5 5.5 13.1h5.3l-1.6 8.4 7.9-10.9h-5.4z"/></svg></div>
        <span class="poi-badge">${free}</span>
        <span class="poi-ground"></span>
      </div>`,
      iconSize: [48, 60],
      iconAnchor: [24, 58],
    });
  }
  return L.divIcon({
    className: "leaflet-div-icon watt-pin",
    html: `<div class="${cls}" style="transform:scale(${selected ? 1.35 : 1})"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function Watch({ onMove }: { onMove: Props["onMove"] }) {
  useMapEvents({
    moveend(event) {
      const center = event.target.getCenter();
      onMove(center.lat, center.lng);
    },
  });
  return null;
}

function Recenter({ origin, token }: { origin: Props["origin"]; token: number }) {
  const map = useMap();
  useEffect(() => {
    if (token) map.setView([origin.lat, origin.lng], 14);
  }, [token, origin.lat, origin.lng, map]);
  return null;
}

type LocateMode = "off" | "locating" | "following" | "shown";
type Fix = { lat: number; lng: number; accuracy: number };

const youIcon = L.divIcon({
  className: "leaflet-div-icon watt-pin",
  html: '<div class="you-dot"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

/**
 * Map controls in the corner: zoom, and a locate button that shows the live
 * position as a blue dot and keeps the map centred on it until the user pans.
 */
function MapControls({
  onLocated,
  onLocateError,
}: {
  onLocated?: (lat: number, lng: number) => void;
  onLocateError?: (message: string) => void;
}) {
  const map = useMap();
  const [mode, setMode] = useState<LocateMode>("off");
  const [fix, setFix] = useState<Fix | null>(null);
  const watchId = useRef<number | null>(null);
  const modeRef = useRef<LocateMode>("off");
  const panel = useRef<HTMLDivElement>(null);
  modeRef.current = mode;

  useEffect(() => {
    if (panel.current) {
      L.DomEvent.disableClickPropagation(panel.current);
      L.DomEvent.disableScrollPropagation(panel.current);
    }
  }, []);

  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useMapEvents({
    dragstart() {
      // Panning by hand stops following, like Google and Apple Maps.
      if (modeRef.current === "following") setMode("shown");
    },
  });

  function stop() {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }

  function start() {
    if (!("geolocation" in navigator)) {
      onLocateError?.("This browser cannot share a location.");
      return;
    }
    setMode("locating");
    let first = true;
    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        setFix(next);
        if (first) {
          first = false;
          setMode("following");
          map.flyTo([next.lat, next.lng], Math.max(map.getZoom(), 16), { duration: 0.8 });
          onLocated?.(next.lat, next.lng);
        } else if (modeRef.current === "following") {
          // Only pan for real movement so GPS jitter does not reload the map every second.
          if (map.getCenter().distanceTo([next.lat, next.lng]) > 15) {
            map.panTo([next.lat, next.lng], { animate: true });
          }
        }
      },
      (error) => {
        stop();
        setMode("off");
        setFix(null);
        onLocateError?.(
          error.code === error.PERMISSION_DENIED
            ? "Location access was declined. Allow it in your browser settings to see where you are."
            : "Your position could not be found. Try again in a moment.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
  }

  function onLocate() {
    if (mode === "off") start();
    else if (mode === "shown" && fix) {
      setMode("following");
      map.flyTo([fix.lat, fix.lng], Math.max(map.getZoom(), 16), { duration: 0.6 });
    } else if (mode === "following") {
      stop();
      setMode("off");
      setFix(null);
    }
  }

  const label =
    mode === "off"
      ? "Show my location"
      : mode === "locating"
        ? "Finding your location…"
        : mode === "following"
          ? "Following your location. Click to turn off."
          : "Centre on my location";

  return (
    <>
      {fix && (
        <>
          <Circle
            center={[fix.lat, fix.lng]}
            radius={fix.accuracy}
            interactive={false}
            pathOptions={{ className: "you-accuracy", stroke: true, weight: 1 }}
          />
          <Marker position={[fix.lat, fix.lng]} icon={youIcon} interactive={false} zIndexOffset={1000} />
        </>
      )}
      <div className="map-controls" ref={panel}>
        <div className="map-control-group">
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => map.zoomIn()}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => map.zoomOut()}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12h14" /></svg>
          </button>
        </div>
        <button
          type="button"
          className={`map-control locate ${mode}`}
          aria-label={label}
          title={label}
          aria-pressed={mode === "following"}
          onClick={onLocate}
        >
          {mode === "following" ? (
            <svg viewBox="0 0 24 24" aria-hidden className="filled"><path d="M3 11 21 3l-8 18-2-8-8-2Z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden><path d="M3 11 21 3l-8 18-2-8-8-2Z" /></svg>
          )}
        </button>
      </div>
    </>
  );
}

/**
 * Street labels on their own pane, above the map and below the pins. Created
 * directly on the map so React's dev double-mount cannot leave it half-built.
 */
function LabelLayer({ url }: { url: string }) {
  const map = useMap();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const pane = map.getPane("labels") ?? map.createPane("labels");
    pane.style.zIndex = "450";
    pane.style.pointerEvents = "none";
    setReady(true);
  }, [map]);
  return ready ? <TileLayer url={url} pane="labels" /> : null;
}

const cartoKey = process.env.NEXT_PUBLIC_CARTO_API_KEY;
/**
 * Streets and labels come as separate raster layers so labels can be sharpened on
 * their own. The label font is baked into CARTO's images; only weight and contrast
 * can be tuned here.
 */
function tileUrl(path: string) {
  const base = `https://{s}.basemaps.cartocdn.com/${path}/{z}/{x}/{y}{r}.png`;
  return cartoKey ? `${base}?key=${encodeURIComponent(cartoKey)}` : base;
}
const TILES = {
  // Voyager: full-colour streets, parks and water, the closest CARTO style to Google/Apple Maps.
  light: { base: tileUrl("rastertiles/voyager_nolabels"), labels: tileUrl("rastertiles/voyager_only_labels") },
  dark: { base: tileUrl("dark_nolabels"), labels: tileUrl("dark_only_labels") },
};

export function MapCanvas({
  stations,
  selectedId,
  onSelect,
  onMove,
  origin,
  recenter,
  liveData,
  onLocated,
  onLocateError,
}: Props & {
  recenter: number;
  liveData: boolean;
  onLocated?: (lat: number, lng: number) => void;
  onLocateError?: (message: string) => void;
}) {
  const theme = useResolvedTheme();
  const tiles = TILES[theme];
  const attribution = liveData
    ? '&copy; OpenStreetMap &copy; CARTO · Charge points: <a href="https://www.goingelectric.de/stromtankstellen/" target="_blank" rel="noopener noreferrer">GoingElectric.de</a>'
    : "&copy; OpenStreetMap &copy; CARTO";
  return (
    <MapContainer center={[VENUE.lat, VENUE.lng]} zoom={13} zoomControl={false}>
      <TileLayer key={`${theme}-${liveData}`} attribution={attribution} url={tiles.base} />
      <LabelLayer key={`labels-${theme}`} url={tiles.labels} />
      <Watch onMove={onMove} />
      <Recenter origin={origin} token={recenter} />
      <MapControls onLocated={onLocated} onLocateError={onLocateError} />
      {stations.map((station) => (
        <Marker
          key={station.id}
          position={[station.lat, station.lng]}
          icon={iconFor(station, station.id === selectedId)}
          eventHandlers={{ click: () => onSelect(station.id) }}
        />
      ))}
    </MapContainer>
  );
}
