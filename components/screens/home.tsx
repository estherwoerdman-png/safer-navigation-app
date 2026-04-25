'use client';

import { useEffect, useState } from 'react';
import type { Map as MbMap } from 'mapbox-gl';
import { MapView } from '@/components/map/map-view';
import { ReportPins, type Pin } from '@/components/map/report-pins';
import { UserLocationDot } from '@/components/map/user-location-dot';
import { SearchField } from '@/components/ui/search-field';
import { ReportsNearbyBadge } from '@/components/ui/reports-nearby-badge';
import { ReportDetailSheet } from '@/components/ui/report-detail-sheet';
import type { NearReport } from '@/components/screens/navigate';
import type { Coord } from '@/app/page';

export function HomeScreen({
  onSearch,
  onReport,
  initialPosition,
}: {
  onSearch: (destination: Coord) => void;
  onReport: () => void;
  initialPosition: Coord | null;
}) {
  const [map, setMap] = useState<MbMap | null>(null);
  const [reports, setReports] = useState<NearReport[]>([]);
  const [destinationText, setDestinationText] = useState('');
  const [nearbyCount, setNearbyCount] = useState<number | null>(null);
  const [clickedReportId, setClickedReportId] = useState<string | null>(null);

  useEffect(() => {
    const center = initialPosition ?? { lat: 52.3676, lng: 4.9041 };
    fetch(`/api/reports/near?lat=${center.lat}&lng=${center.lng}&radius=2000`)
      .then((r) => r.json())
      .then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const list = (data.reports ?? []) as any[];
        setReports(
          list.map((r) => ({
            id: r.id,
            lat: Number(r.lat),
            lng: Number(r.lng),
            severity: r.severity,
            type: r.type,
            summary: r.summary,
            reported_at: r.reported_at,
          })),
        );
        const recent = list.filter(
          (r) => Date.now() - new Date(r.reported_at).getTime() < 3600_000,
        ).length;
        setNearbyCount(recent);
      })
      .catch(() => {
        /* DB not ready, render gracefully */
      });
  }, [initialPosition]);

  const pins: Pin[] = reports.map((r) => ({
    id: r.id,
    lat: r.lat,
    lng: r.lng,
    severity: r.severity,
    type: r.type,
  }));
  const clickedReport = clickedReportId
    ? reports.find((r) => r.id === clickedReportId) ?? null
    : null;

  const onAnswer = async (agree: boolean | null) => {
    if (clickedReport && agree !== null) {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_id: clickedReport.id,
          agree,
          responder_loc: initialPosition ?? { lat: 52.3676, lng: 4.9041 },
        }),
      }).catch(() => { /* DB not ready */ });
    }
    setClickedReportId(null);
  };

  const onSearchSubmit = async () => {
    if (!destinationText.trim()) return;
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(destinationText)}.json` +
        `?proximity=4.9041,52.3676&country=nl&limit=1` +
        `&access_token=${process.env.NEXT_PUBLIC_MAPBOX_TOKEN}`,
    );
    const data = await r.json();
    const f = data.features?.[0];
    if (!f) return;
    const [lng, lat] = f.center;
    onSearch({ lat, lng });
  };

  return (
    <div className="absolute inset-0">
      <MapView className="absolute inset-0" onReady={setMap} />
      <ReportPins map={map} pins={pins} onPinClick={setClickedReportId} />
      <UserLocationDot map={map} position={initialPosition} />

      <div className="absolute top-3 left-16 right-16">
        <SearchField
          value={destinationText}
          onChange={setDestinationText}
          onSubmit={onSearchSubmit}
        />
      </div>

      {nearbyCount !== null && (
        <div className="absolute top-[64px] left-4">
          <ReportsNearbyBadge count={nearbyCount} />
        </div>
      )}

      <div className="absolute bottom-6 left-4 right-4">
        <button
          onClick={onReport}
          className="w-full rounded-2xl px-5 py-4 text-left text-white bg-[var(--primary)]
                     shadow-lg active:scale-[0.99] transition-transform"
        >
          <div className="flex items-center gap-3">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
              aria-hidden="true"
            >
              <rect x="9" y="2" width="6" height="13" rx="3" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <path d="M12 19v3" />
            </svg>
            <div className="leading-tight">
              <div className="display text-lg">Report what you see</div>
              <div className="text-sm opacity-80">Hold to speak — anonymous</div>
            </div>
          </div>
        </button>
      </div>

      {clickedReport && (
        <ReportDetailSheet
          report={clickedReport}
          onAnswer={onAnswer}
          onDismiss={() => setClickedReportId(null)}
        />
      )}
    </div>
  );
}
