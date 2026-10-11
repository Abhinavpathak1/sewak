import { CIVIC_LOCATIONS, DEFAULT_LOCATION_ID, type CivicLocationId } from "@/lib/constants";

const STORAGE_KEY = "cn-default-location";
const listeners = new Set<() => void>();

export function subscribeDefaultLocation(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function readDefaultLocation(): CivicLocationId {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return CIVIC_LOCATIONS.find((location) => location.id === saved)?.id ?? DEFAULT_LOCATION_ID;
  } catch {
    return DEFAULT_LOCATION_ID;
  }
}

export function saveDefaultLocation(locationId: CivicLocationId) {
  try {
    window.localStorage.setItem(STORAGE_KEY, locationId);
    listeners.forEach((listener) => listener());
    return true;
  } catch {
    return false;
  }
}
