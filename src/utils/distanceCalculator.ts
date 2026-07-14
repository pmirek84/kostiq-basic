/**
 * Utility to calculate road distances using free open APIs (Nominatim + OSRM)
 * with a robust local coordinates fallback for offline/development environments.
 */

const POLISH_CITIES: Record<string, { lat: number; lon: number }> = {
    warszawa: { lat: 52.2297, lon: 21.0122 },
    warsaw: { lat: 52.2297, lon: 21.0122 },
    poznan: { lat: 52.4069, lon: 16.9299 },
    poznań: { lat: 52.4069, lon: 16.9299 },
    krakow: { lat: 50.0647, lon: 19.9450 },
    kraków: { lat: 50.0647, lon: 19.9450 },
    wroclaw: { lat: 51.1079, lon: 17.0385 },
    wrocław: { lat: 51.1079, lon: 17.0385 },
    gdansk: { lat: 54.3520, lon: 18.6466 },
    gdańsk: { lat: 54.3520, lon: 18.6466 },
    katowice: { lat: 50.2649, lon: 19.0238 },
    rzeszow: { lat: 50.0412, lon: 21.9991 },
    rzeszów: { lat: 50.0412, lon: 21.9991 },
    bialystok: { lat: 53.1325, lon: 23.1688 },
    białystok: { lat: 53.1325, lon: 23.1688 },
    szczecin: { lat: 53.4285, lon: 14.5528 },
    lublin: { lat: 51.2465, lon: 22.5684 },
    kielce: { lat: 50.8660, lon: 20.6286 },
    bydgoszcz: { lat: 53.1235, lon: 18.0084 },
    torun: { lat: 53.0138, lon: 18.5984 },
    toruń: { lat: 53.0138, lon: 18.5984 },
    olsztyn: { lat: 53.7784, lon: 20.4801 },
    opole: { lat: 50.6664, lon: 17.9237 },
    zielona: { lat: 51.9356, lon: 15.5062 },
    gorzow: { lat: 52.7325, lon: 15.2369 },
    gorzów: { lat: 52.7325, lon: 15.2369 },
};

/**
 * Extracts city name from address string
 */
export function extractCity(address: string): string {
    if (!address) return '';
    // Remove postal codes and common address terms
    const cleaned = address.replace(/\d{2}-\d{3}/, '').trim();
    const parts = cleaned.split(/[,|\s]+/).map(p => p.trim()).filter(Boolean);
    
    for (const part of parts) {
        const normalized = part.toLowerCase().replace(/[^a-zżźćńółęąś]/g, '');
        if (POLISH_CITIES[normalized]) {
            return part;
        }
    }
    
    if (parts.length > 0) {
        return parts[parts.length - 1];
    }
    return '';
}

/**
 * Generates deterministic coordinates for cities not in our coordinate map
 */
function getCityCoords(city: string): { lat: number; lon: number } {
    const normalized = city.toLowerCase().replace(/[^a-zżźćńółęąś]/g, '').trim();
    if (POLISH_CITIES[normalized]) {
        return POLISH_CITIES[normalized];
    }
    
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
        hash = normalized.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    const lat = 49.0 + (Math.abs(hash) % 55) / 10;
    const lon = 14.1 + (Math.abs(hash >> 8) % 100) / 10;
    return { lat, lon };
}

/**
 * Calculates straight line distance using Haversine formula
 */
function calculateHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Interface representing result of distance calculation
 */
export interface RoadDistanceResult {
    distance: number;
    fromCity: string;
    toCity: string;
    isExact: boolean; // true if fetched from OSRM, false if calculated via Haversine
    isSameCity: boolean;
}

/**
 * Helper: Geocodes address to coordinates via free Nominatim API
 */
async function geocodeNominatim(address: string): Promise<{ lat: number; lon: number } | null> {
    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
            {
                headers: {
                    'Accept-Language': 'pl',
                    // Safe referral
                    'Referer': window.location.origin
                }
            }
        );
        if (!response.ok) return null;
        const data = await response.json();
        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        }
    } catch (e) {
        console.warn('[Geocoding] Nominatim failed:', e);
    }
    return null;
}

/**
 * Helper: Retrieves road distance via Open Source Routing Machine (OSRM)
 */
async function getOSRMDistance(lon1: number, lat1: number, lon2: number, lat2: number): Promise<number | null> {
    try {
        const response = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`
        );
        if (!response.ok) return null;
        const data = await response.json();
        if (data && data.routes && data.routes.length > 0) {
            return Math.round((data.routes[0].distance / 1000) * 10) / 10;
        }
    } catch (e) {
        console.warn('[Routing] OSRM API failed:', e);
    }
    return null;
}

/**
 * Calculates road distance between two address strings.
 * Attempts real geocoding and routing APIs (exact), falls back to Haversine local formula if offline/blocked.
 */
export async function calculateRoadDistance(
    fromAddress: string, 
    toAddress: string
): Promise<RoadDistanceResult> {
    const fromCity = extractCity(fromAddress);
    const toCity = extractCity(toAddress);
    
    if (!fromCity || !toCity) {
        return { distance: 0, fromCity, toCity, isExact: false, isSameCity: false };
    }
    
    const isSameCity = fromCity.toLowerCase().replace(/[^a-zżźćńółęąś]/g, '') === 
                       toCity.toLowerCase().replace(/[^a-zżźćńółęąś]/g, '');
    
    if (isSameCity) {
        return { distance: 15.0, fromCity, toCity, isExact: false, isSameCity: true };
    }

    // Try exact routing API first
    try {
        const [coords1, coords2] = await Promise.all([
            geocodeNominatim(fromAddress),
            geocodeNominatim(toAddress)
        ]);

        if (coords1 && coords2) {
            const osrmDistance = await getOSRMDistance(coords1.lon, coords1.lat, coords2.lon, coords2.lat);
            if (osrmDistance !== null) {
                return {
                    distance: osrmDistance,
                    fromCity,
                    toCity,
                    isExact: true,
                    isSameCity: false
                };
            }
        }
    } catch (e) {
        console.warn('[DistanceCalculator] Exact routing failed, falling back to straight-line simulation:', e);
    }

    // Local Fallback: Haversine distance * road winding factor
    const coords1 = getCityCoords(fromCity);
    const coords2 = getCityCoords(toCity);
    const straightLine = calculateHaversine(coords1.lat, coords1.lon, coords2.lat, coords2.lon);
    const fallbackRoadDistance = Math.round(straightLine * 1.28 * 10) / 10;

    return {
        distance: fallbackRoadDistance,
        fromCity,
        toCity,
        isExact: false,
        isSameCity: false
    };
}
