// src/components/ShiftRouteMapModal.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  X, MapPin, Navigation, Clock, Shield, AlertTriangle, ShieldCheck, 
  Calendar, User, Play, Pause, RefreshCw, Eye, Battery, BatteryCharging, 
  WifiOff, AlertOctagon, Info, ChevronRight, Filter, Download, ArrowRight,
  Coffee, Lock, Layers, Compass
} from 'lucide-react';
import { 
  FieldShiftSession, 
  ShiftBreadcrumb, 
  RoutePlaybackAudit,
  Worker
} from '../types/index';
import { breadcrumbService } from '../services/breadcrumbService';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  initialWorkerId?: string;
  workers?: Worker[];
}

export const ShiftRouteMapModal: React.FC<Props> = ({
  isOpen,
  onClose,
  tenantId,
  initialWorkerId,
  workers = []
}) => {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState<'LIVE' | 'HISTORICAL'>('LIVE');
  const [activeWorkers, setActiveWorkers] = useState<Array<{
    session: FieldShiftSession;
    lastBreadcrumb?: ShiftBreadcrumb;
    minutesSinceLastUpdate: number;
    isThrottled: boolean;
    displayStatus: string;
  }>>([]);
  const [historicalSessions, setHistoricalSessions] = useState<Array<{
    session: FieldShiftSession;
    breadcrumbsCount: number;
    mockedCount: number;
  }>>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [routeData, setRouteData] = useState<{
    session: FieldShiftSession | null;
    routePoints: ShiftBreadcrumb[];
    excludedMockedPoints: ShiftBreadcrumb[];
    gapMarkers: ShiftBreadcrumb[];
    pauseEvents: ShiftBreadcrumb[];
    auditId?: string;
  } | null>(null);
  const [loadingRoute, setLoadingRoute] = useState<boolean>(false);
  const [audits, setAudits] = useState<RoutePlaybackAudit[]>([]);
  const [playbackIndex, setPlaybackIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const playbackTimerRef = useRef<any>(null);

  // Load active shift workers and historical sessions
  const loadData = () => {
    const live = breadcrumbService.getActiveShiftWorkers(tenantId);
    setActiveWorkers(live);

    const history = breadcrumbService.getHistoricalSessions(tenantId, 30);
    setHistoricalSessions(history);

    const auditList = breadcrumbService.getPlaybackAudits(tenantId);
    setAudits(auditList);

    // If an initialWorkerId was provided and has an active session, auto-select
    if (initialWorkerId && !selectedSessionId) {
      const match = live.find(l => l.session.workerId === initialWorkerId);
      if (match) {
        setSelectedSessionId(match.session.id);
      } else if (history.length > 0) {
        const histMatch = history.find(h => h.session.workerId === initialWorkerId);
        if (histMatch) {
          setSelectedSessionId(histMatch.session.id);
          setTab('HISTORICAL');
        }
      }
    } else if (!selectedSessionId && live.length > 0) {
      setSelectedSessionId(live[0].session.id);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, tenantId]);

  // When a session is selected, load its route and log E15 audit trail with viewer identity
  useEffect(() => {
    if (!selectedSessionId) {
      setRouteData(null);
      return;
    }

    setLoadingRoute(true);
    breadcrumbService.getSessionRoute(selectedSessionId, {
      uid: user?.uid || 'anon',
      email: user?.email || profile?.email || 'supervisor@factory.wfpro',
      role: profile?.role || 'SUPERVISOR',
      name: profile?.companyName || 'Field Supervisor'
    }).then(res => {
      setRouteData(res);
      setPlaybackIndex(res.routePoints.length > 0 ? res.routePoints.length - 1 : 0);
      setIsPlaying(false);
      setLoadingRoute(false);
      setAudits(breadcrumbService.getPlaybackAudits(tenantId));
    });
  }, [selectedSessionId, tenantId, user, profile]);

  // Route playback animation controller
  useEffect(() => {
    if (isPlaying && routeData && routeData.routePoints.length > 1) {
      playbackTimerRef.current = setInterval(() => {
        setPlaybackIndex(prev => {
          if (prev >= routeData.routePoints.length - 1) {
            setIsPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 1000);
    } else {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    }
    return () => {
      if (playbackTimerRef.current) clearInterval(playbackTimerRef.current);
    };
  }, [isPlaying, routeData]);

  if (!isOpen) return null;

  // Selected session details
  const currentSession = routeData?.session;

  // Calculate SVG map bounds for route points
  const mapCoordinates = useMemo(() => {
    if (!routeData || routeData.routePoints.length === 0) return null;
    const lats = routeData.routePoints.map(p => p.lat);
    const lngs = routeData.routePoints.map(p => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latSpan = Math.max(0.005, maxLat - minLat);
    const lngSpan = Math.max(0.005, maxLng - minLng);

    // Project lat/lng to 0..600 x 0..380 viewBox
    const width = 600;
    const height = 360;
    const padding = 40;

    const project = (lat: number, lng: number) => {
      const x = padding + ((lng - minLng) / lngSpan) * (width - 2 * padding);
      // Invert Y for screen coordinates (north is up)
      const y = height - (padding + ((lat - minLat) / latSpan) * (height - 2 * padding));
      return { x, y };
    };

    const points = routeData.routePoints.map((p, idx) => ({
      ...p,
      index: idx,
      ...project(p.lat, p.lng)
    }));

    return {
      width,
      height,
      points,
      minLat,
      maxLat,
      minLng,
      maxLng,
      centerLat: (minLat + maxLat) / 2,
      centerLng: (minLng + maxLng) / 2
    };
  }, [routeData]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/80 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-6xl w-full h-[95vh] flex flex-col shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Navigation className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-white">Shift-Scoped Field Routes &amp; Breadcrumbs</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 font-mono">
                  Opt-In &bull; DPDP Verified
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Active shift route verification &bull; Break pause &bull; Sensitive location privacy
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              title="Refresh active telemetry"
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab & Filter Bar */}
        <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setTab('LIVE')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-2 ${
                tab === 'LIVE' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Live Active Shifts ({activeWorkers.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('HISTORICAL')}
              className={`px-3.5 py-1.5 rounded-lg font-bold transition-all flex items-center gap-2 ${
                tab === 'HISTORICAL' 
                  ? 'bg-blue-600 text-white shadow-xs' 
                  : 'bg-white text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Historical Playback (Last 30 Days)</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
            <Shield className="w-3.5 h-3.5 text-blue-600" />
            <span>Viewer: <strong className="text-slate-800">{user?.email || profile?.email || 'Field Supervisor'}</strong></span>
            <span className="text-slate-300">&bull;</span>
            <span>E15 Audit Active</span>
          </div>
        </div>

        {/* Main Body: Master-Detail Layout */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          
          {/* Left Column: Worker / Session List */}
          <div className="w-full md:w-80 lg:w-96 border-r border-slate-200 bg-slate-50/50 flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-200 bg-white flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                {tab === 'LIVE' ? 'Workers On Active Shift' : 'Historical Shift Sessions'}
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {tab === 'LIVE' ? activeWorkers.length : historicalSessions.length} total
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {tab === 'LIVE' && activeWorkers.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <Navigation className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-bold text-slate-700">No active shift workers right now</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Workers appear here as soon as they punch IN at a breadcrumb-enabled site with valid consent.
                  </p>
                </div>
              )}

              {tab === 'LIVE' && activeWorkers.map(({ session, lastBreadcrumb, minutesSinceLastUpdate, isThrottled, displayStatus }) => {
                const isSelected = selectedSessionId === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected 
                        ? 'bg-blue-50/90 border-blue-500 shadow-xs ring-1 ring-blue-400' 
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{session.workerName}</h4>
                          {session.trackingMode === 'BREADCRUMB' ? (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-blue-100 text-blue-700">
                              ROUTE
                            </span>
                          ) : (
                            <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-slate-100 text-slate-600">
                              PUNCH ONLY
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{session.siteName}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          session.status === 'PAUSED_BREAK'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : session.status === 'PAUSED_PRIVACY'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        }`}>
                          {session.status === 'PAUSED_BREAK' ? 'On Break' : session.status === 'PAUSED_PRIVACY' ? 'Privacy Pause' : 'Active'}
                        </span>
                      </div>
                    </div>

                    {/* Cadence and Doze Throttling Status */}
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Shift started {new Date(session.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>

                      <div className="text-right">
                        {isThrottled ? (
                          <span className="text-amber-700 font-medium" title="Android Doze mode screen-off interval">
                            Updated {minutesSinceLastUpdate}m ago
                          </span>
                        ) : (
                          <span className="text-emerald-600 font-medium font-mono">
                            {minutesSinceLastUpdate === 0 ? 'Live now' : `${minutesSinceLastUpdate}m ago`}
                          </span>
                        )}
                      </div>
                    </div>

                    {session.degradedReason && (
                      <div className="mt-2 text-[10px] text-rose-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        <span>{session.degradedReason === 'OEM_BATTERY_DECLINED' ? 'Degraded: Battery opt declined' : 'Degraded: PWA browser'}</span>
                      </div>
                    )}
                  </button>
                );
              })}

              {tab === 'HISTORICAL' && historicalSessions.length === 0 && (
                <div className="p-8 text-center text-slate-400">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs font-bold text-slate-700">No shift history in last 30 days</p>
                </div>
              )}

              {tab === 'HISTORICAL' && historicalSessions.map(({ session, breadcrumbsCount, mockedCount }) => {
                const isSelected = selectedSessionId === session.id;
                return (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected 
                        ? 'bg-blue-50/90 border-blue-500 shadow-xs ring-1 ring-blue-400' 
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{session.workerName}</h4>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{session.siteName}</p>
                      </div>
                      <span className="text-[10px] font-mono font-medium text-slate-600 px-1.5 py-0.5 bg-slate-100 rounded">
                        {session.startedAt.slice(0, 10)}
                      </span>
                    </div>

                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-600">
                      <span>{new Date(session.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} &rarr; {session.endedAt ? new Date(session.endedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'In Progress'}</span>
                      <span className="font-mono font-bold text-blue-600">{breadcrumbsCount} pts</span>
                    </div>

                    {mockedCount > 0 && (
                      <div className="mt-1.5 text-[10px] text-rose-600 font-bold flex items-center gap-1">
                        <AlertOctagon className="w-3 h-3 shrink-0" />
                        <span>{mockedCount} mocked coordinates excluded</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Route Map Visualization & Telemetry */}
          <div className="flex-1 flex flex-col bg-slate-50 overflow-y-auto">
            {!selectedSessionId ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center text-slate-400">
                <div>
                  <Navigation className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <h4 className="font-bold text-sm text-slate-700">Select a Shift Session to View Route</h4>
                  <p className="text-xs text-slate-500 max-w-sm mt-1">
                    View active live positions or playback historical worker route telemetry from the last 30 days.
                  </p>
                </div>
              </div>
            ) : loadingRoute ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">Loading verified shift route coordinates...</p>
              </div>
            ) : (
              <div className="p-4 sm:p-6 space-y-4">
                
                {/* Session Card Info Banner */}
                {currentSession && (
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-slate-900 text-white font-bold text-base flex items-center justify-center shrink-0">
                        {currentSession.workerName.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-slate-900">{currentSession.workerName}</h3>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                            {currentSession.id}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-3 mt-1">
                          <span>Site: <strong>{currentSession.siteName}</strong></span>
                          <span>&bull;</span>
                          <span>Shift: <strong>{new Date(currentSession.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                          {currentSession.endedAt && (
                            <>
                              <span>&bull;</span>
                              <span>Punched Out: <strong>{new Date(currentSession.endedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <div className="text-[11px] text-slate-500">Motion Cadence</div>
                        <div className="text-xs font-bold text-slate-900">
                          {currentSession.lastMotionStatus === 'MOVING' ? 'Moving (8-min interval)' : 'Stationary (30-min interval)'}
                        </div>
                      </div>
                      <div className="h-8 w-px bg-slate-200 mx-2"></div>
                      <div className="text-right">
                        <div className="text-[11px] text-slate-500">Total Valid Breadcrumbs</div>
                        <div className="text-xs font-mono font-bold text-blue-600">
                          {routeData?.routePoints.length || 0} pts
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Mocked Points Exclusion Warning (Key AC 5) */}
                {routeData && routeData.excludedMockedPoints.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3">
                    <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-rose-900">
                      <strong className="block text-rose-950 font-bold mb-0.5">
                        {routeData.excludedMockedPoints.length} Mocked Coordinate(s) Detected &amp; Excluded
                      </strong>
                      In accordance with anti-fraud policy, mocked GPS breadcrumbs have been flagged and strictly excluded from the route map report. They are logged separately in the audit trail.
                    </div>
                  </div>
                )}

                {/* Gap Markers Banner (Key Edge Case: Offline mid-shift -> explicit gap markers, never fake interpolated route) */}
                {routeData && routeData.gapMarkers.length > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                    <WifiOff className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-900">
                      <strong className="block text-amber-950 font-bold mb-0.5">
                        {routeData.gapMarkers.length} Explicit Signal Gap(s) Recorded
                      </strong>
                      Device experienced temporary cellular/GPS outage. Rather than drawing a fabricated straight line across town, genuine gaps are demarcated chronologically.
                    </div>
                  </div>
                )}

                {/* Interactive Vector Route Map Canvas */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                      <Compass className="w-4 h-4 text-blue-600" />
                      <span>Route Waypoint Trajectory (Calibrated Spatial Projection)</span>
                    </div>

                    {/* Playback Controls */}
                    {routeData && routeData.routePoints.length > 1 && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setIsPlaying(!isPlaying)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                            isPlaying ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                          }`}
                        >
                          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                          <span>{isPlaying ? 'Pause Playback' : 'Play Route'}</span>
                        </button>
                        <span className="font-mono text-xs text-slate-500">
                          {playbackIndex + 1} / {routeData.routePoints.length}
                        </span>
                      </div>
                    )}
                  </div>

                  {mapCoordinates && mapCoordinates.points.length > 0 ? (
                    <div className="w-full bg-slate-950 rounded-xl overflow-hidden relative shadow-inner flex items-center justify-center p-2">
                      <svg 
                        viewBox={`0 0 ${mapCoordinates.width} ${mapCoordinates.height}`} 
                        className="w-full h-80 max-h-[380px]"
                      >
                        {/* Grid Lines */}
                        <defs>
                          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1e293b" strokeWidth="0.8" />
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill="url(#grid)" />

                        {/* Trajectory Polyline */}
                        <polyline
                          fill="none"
                          stroke="#3b82f6"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray="none"
                          points={mapCoordinates.points.slice(0, playbackIndex + 1).map(p => `${p.x},${p.y}`).join(' ')}
                        />

                        {/* Gap Markers dashed connecting lines */}
                        {routeData?.gapMarkers.map((gm, gIdx) => (
                          <g key={gIdx}>
                            <text x="30" y={30 + gIdx * 20} fill="#f59e0b" fontSize="10" fontFamily="monospace">
                              &bull; {gm.gapDetails?.reason || 'No signal gap'}
                            </text>
                          </g>
                        ))}

                        {/* Waypoints */}
                        {mapCoordinates.points.slice(0, playbackIndex + 1).map((pt, idx) => {
                          const isStart = idx === 0;
                          const isCurrent = idx === playbackIndex;
                          return (
                            <g key={pt.id} className="cursor-pointer transition-transform hover:scale-125">
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={isCurrent ? 7 : isStart ? 6 : 4}
                                fill={isStart ? '#10b981' : isCurrent ? '#60a5fa' : '#3b82f6'}
                                stroke="#ffffff"
                                strokeWidth="2"
                              />
                              {isCurrent && (
                                <circle
                                  cx={pt.x}
                                  cy={pt.y}
                                  r="13"
                                  fill="none"
                                  stroke="#60a5fa"
                                  strokeWidth="1.5"
                                  className="animate-ping"
                                />
                              )}
                            </g>
                          );
                        })}
                      </svg>

                      {/* Map legend overlay */}
                      <div className="absolute bottom-3 left-3 bg-slate-900/90 backdrop-blur-xs border border-slate-700 p-2.5 rounded-xl text-[10px] text-slate-300 flex items-center gap-3">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                          <span>Punch IN (Start)</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block"></span>
                          <span>8m/30m Breadcrumb</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
                          <span>Break / Privacy Pause</span>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                      <p className="text-xs font-bold text-slate-700">No physical GPS coordinates captured yet</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        First breadcrumb will appear when the 8-minute motion heartbeat executes.
                      </p>
                    </div>
                  )}

                  {/* Playback Slider */}
                  {routeData && routeData.routePoints.length > 1 && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                        <span>Timeline Slider</span>
                        <span className="font-mono font-medium">
                          {routeData.routePoints[playbackIndex]?.capturedAt 
                            ? new Date(routeData.routePoints[playbackIndex].capturedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            : ''}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max={routeData.routePoints.length - 1}
                        value={playbackIndex}
                        onChange={(e) => setPlaybackIndex(parseInt(e.target.value, 10))}
                        className="w-full accent-blue-600 cursor-pointer"
                      />
                    </div>
                  )}
                </div>

                {/* Break Pauses & Privacy Pauses Section */}
                {currentSession && currentSession.pauseHistory.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                      <Coffee className="w-4 h-4 text-amber-600" />
                      <span>Shift Pause Events ({currentSession.pauseHistory.length})</span>
                    </h4>
                    <div className="space-y-2">
                      {currentSession.pauseHistory.map((ph, pIdx) => (
                        <div 
                          key={pIdx}
                          className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            {ph.type === 'BREAK' ? (
                              <Coffee className="w-4 h-4 text-amber-600" />
                            ) : (
                              <Lock className="w-4 h-4 text-purple-600" />
                            )}
                            <div>
                              <strong className="text-slate-900 block font-bold">
                                {ph.type === 'BREAK' ? 'Worker Break Pause' : 'Sensitive Location (Privacy Pause)'}
                              </strong>
                              <span className="text-[11px] text-slate-500">
                                {ph.reason || (ph.type === 'BREAK' ? 'Scheduled lunch / rest break' : 'Hospital / Clinic / Personal')}
                              </span>
                            </div>
                          </div>

                          <div className="text-right text-[11px] font-mono">
                            <span className="text-slate-600">
                              {new Date(ph.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} &rarr; {ph.resumedAt ? new Date(ph.resumedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'Ongoing'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* E15 Audit Trail & Historical Access Record (Key AC 6) */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600" />
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        E15 Playback Audit History (Who Viewed This Route)
                      </h4>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      Immutable Log &bull; 30-Day Window
                    </span>
                  </div>

                  {audits.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">This viewing was recorded to the E15 security audit log.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {audits.slice(0, 5).map(aud => (
                        <div 
                          key={aud.id}
                          className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <User className="w-3.5 h-3.5 text-slate-400" />
                            <span><strong className="text-slate-800">{aud.viewerName}</strong> ({aud.viewerRole}) viewed worker <strong>{aud.workerName}</strong></span>
                          </div>
                          <span className="font-mono text-slate-500">
                            {new Date(aud.viewedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
};
