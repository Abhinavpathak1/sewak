"use client";

import { CIVIC_LOCATIONS, DEFAULT_LOCATION_ID, civicLocationLabel, type CivicLocationId } from "@/lib/constants";
import { readDefaultLocation, saveDefaultLocation, subscribeDefaultLocation } from "@/lib/location-preference";
import { Bookmark, MapPin } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

export function LocationPicker({ locationId, compact = false }: { locationId: CivicLocationId; compact?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const currentId = CIVIC_LOCATIONS.find((location) => location.id === searchParams.get("location"))?.id ?? locationId;
  const defaultId = useSyncExternalStore(
    subscribeDefaultLocation,
    readDefaultLocation,
    () => DEFAULT_LOCATION_ID,
  );
  const [saveError, setSaveError] = useState("");
  const selected = CIVIC_LOCATIONS.find((location) => location.id === currentId) ?? CIVIC_LOCATIONS[0];
  const isDefault = selected.id === defaultId;

  useEffect(() => {
    const preferred = readDefaultLocation();
    if (!new URLSearchParams(query).has("location") && preferred !== locationId) {
      const params = new URLSearchParams(query);
      params.set("location", preferred);
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [locationId, pathname, query, router]);

  function chooseLocation(value: string) {
    if (!CIVIC_LOCATIONS.some((location) => location.id === value)) return;
    const params = new URLSearchParams(query);
    params.set("location", value);
    router.push(`${pathname}?${params.toString()}`);
  }

  function saveSelectedAsDefault() {
    if (!saveDefaultLocation(selected.id)) {
      setSaveError("Could not save your default location in this browser.");
      return;
    }
    setSaveError("");
  }

  return (
    <div className={`location-picker${compact ? " compact" : ""}`}>
      <label className="sr-only" htmlFor={compact ? "header-location" : "page-location"}>
        Choose a location to browse
      </label>
      <MapPin size={16} aria-hidden />
      <select
        id={compact ? "header-location" : "page-location"}
        className="select location-picker-select"
        value={selected.id}
        onChange={(event) => chooseLocation(event.target.value)}
        aria-label="Choose a location to browse"
      >
        {CIVIC_LOCATIONS.map((location) => (
          <option key={location.id} value={location.id}>
            {civicLocationLabel(location)}
          </option>
        ))}
      </select>
      {!isDefault && (
        <button
          type="button"
          className="btn btn-secondary btn-sm location-default-button"
          onClick={saveSelectedAsDefault}
          title="Save this location as your default"
        >
          <Bookmark size={14} aria-hidden /> Save default
        </button>
      )}
      {isDefault && <span className="location-default-label">Default</span>}
      {saveError && <span className="location-default-error" role="alert">{saveError}</span>}
    </div>
  );
}
