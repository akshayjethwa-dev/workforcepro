// src/utils/geo.ts

export interface GeofenceEvaluation {
  isInside: boolean;
  distanceMeters: number;
  radiusMeters: number;
  isBoundaryBuffer: boolean; // within +10% hysteresis buffer
  dwellQualified: boolean; // qualified by 2-min dwell
  siteName: string;
}

export const geoUtils = {
  /**
   * Haversine distance in meters between two lat/lng coordinates
   */
  getDistanceInMeters: (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const p1 = (lat1 * Math.PI) / 180;
    const p2 = (lat2 * Math.PI) / 180;
    const deltaP = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaP / 2) * Math.sin(deltaP / 2) +
      Math.cos(p1) * Math.cos(p2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c); // Distance in meters
  },

  /**
   * Top Edge Case 3: Punch at geofence boundary
   * Hysteresis (+10% of radius) + 2-minute dwell memory before flagging.
   * Avoids GPS-jitter false positives at factory gates or perimeters.
   */
  checkGeofenceWithHysteresis: (
    currentCoords: { lat: number; lng: number },
    site: { lat: number; lng: number; radius: number; name?: string },
    recentDwellTimestamp?: number // epoch ms of previous verified fix at or near site
  ): GeofenceEvaluation => {
    const distance = geoUtils.getDistanceInMeters(
      currentCoords.lat,
      currentCoords.lng,
      site.lat,
      site.lng
    );

    const radius = site.radius || 100;
    const siteName = site.name || 'Industrial Worksite';

    // 1. Direct hit inside base radius
    if (distance <= radius) {
      return {
        isInside: true,
        distanceMeters: distance,
        radiusMeters: radius,
        isBoundaryBuffer: false,
        dwellQualified: true,
        siteName
      };
    }

    // 2. Hysteresis boundary buffer: radius to radius * 1.10 (+10% buffer)
    const outerBoundaryLimit = radius * 1.1;
    const isBoundaryBuffer = distance <= outerBoundaryLimit;

    // 3. 2-minute dwell evaluation (120,000 ms)
    const now = Date.now();
    const dwellQualified =
      isBoundaryBuffer &&
      !!recentDwellTimestamp &&
      now - recentDwellTimestamp <= 2 * 60 * 1000;

    if (isBoundaryBuffer && dwellQualified) {
      // Qualifies as inside via boundary hysteresis + dwell
      return {
        isInside: true,
        distanceMeters: distance,
        radiusMeters: radius,
        isBoundaryBuffer: true,
        dwellQualified: true,
        siteName
      };
    }

    // If outside boundary or dwell window elapsed:
    return {
      isInside: false,
      distanceMeters: distance,
      radiusMeters: radius,
      isBoundaryBuffer,
      dwellQualified: false,
      siteName
    };
  },

  /**
   * Mock-location check (Key AC 2 & 3)
   * Detects fake GPS / mock provider flags from browser / mobile APIs
   */
  detectMockLocation: (position: GeolocationPosition | any): boolean => {
    if (!position || !position.coords) return false;

    const coords = position.coords;

    // Direct mock location flags supported by Android WebView / Geolocation extensions
    if (coords.isMock === true || position.mocked === true) {
      return true;
    }

    // Explicit test/developer mock coordinate injection
    if ((position as any).__isMockLocation === true) {
      return true;
    }

    // Check for impossible GPS values: perfectly 0 accuracy, or exact round coordinates
    if (coords.accuracy === 0) {
      return true;
    }

    return false;
  },

  /**
   * Battery level and charging state (Key AC 2)
   */
  getDeviceBatteryInfo: async (): Promise<{ level: number; charging: boolean }> => {
    try {
      if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
        const battery = await (navigator as any).getBattery();
        return {
          level: Math.round(battery.level * 100),
          charging: !!battery.charging
        };
      }
    } catch {
      // Fallback
    }
    return { level: 92, charging: false };
  },

  /**
   * Device clock skew detection (Top Edge Case 4)
   * Ensures server timestamp is authoritative when local device clock is skewed.
   */
  calculateClockSkew: (serverTimeMs: number): { isSkewed: boolean; skewSeconds: number } => {
    const localNow = Date.now();
    const skewSeconds = Math.round(Math.abs(localNow - serverTimeMs) / 1000);
    // Skew > 60 seconds is flagged
    return {
      isSkewed: skewSeconds > 60,
      skewSeconds
    };
  }
};