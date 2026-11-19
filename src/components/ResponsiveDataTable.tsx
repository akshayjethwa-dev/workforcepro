import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Inbox,
  LayoutGrid,
  List,
  MoveHorizontal,
} from 'lucide-react';

export interface ResponsiveColumn<T> {
  /** Unique column identifier */
  key: string;
  /** Column header label shown in desktop <thead> and as mobile key label */
  header: string;
  /** Optional shorter label for mobile key-value rows or compact headers */
  mobileLabel?: string;
  /** Cell renderer for desktop table and default mobile card value */
  render: (row: T, index: number) => React.ReactNode;
  /** Optional specialized renderer for compact Mobile Priority View (e.g., concise time/amount) */
  renderPriority?: (row: T, index: number) => React.ReactNode;
  /** Horizontal alignment for desktop column and priority column */
  align?: 'left' | 'center' | 'right';
  /** Minimum column width class on desktop (e.g., 'min-w-[160px]') */
  minWidth?: string;
  /** Extra classes for desktop <td> */
  cellClassName?: string;
  /** Extra classes for desktop <th> */
  headerClassName?: string;
  /** Mark column as one of the 2–3 priority columns shown in Mobile Column Priority view (Name, Status, Amount/Time) */
  mobilePriority?: boolean;
  /** Primary title column in auto-generated mobile cards */
  isPrimary?: boolean;
  /** Right-aligned header badge/metric in auto-generated mobile cards */
  isHeaderMetric?: boolean;
  /** Action buttons column rendered in the footer of auto-generated mobile cards */
  isAction?: boolean;
  /** Omit from the stacked key-value body of auto-generated mobile cards */
  hideInMobileCard?: boolean;
  /** Pin this column to the left edge during horizontal desktop scrolling */
  stickyLeft?: boolean;
  /** Numeric tabular styling shortcut */
  numeric?: boolean;
}

export interface ResponsiveEmptyState {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export interface ResponsiveDataTableProps<T> {
  data: T[];
  columns: ResponsiveColumn<T>[];
  keyExtractor: (row: T, index: number) => string;
  loading?: boolean;
  /** Empty state rendered OUTSIDE the <table> so it is always centered and readable */
  emptyState?: ResponsiveEmptyState;
  /** Keep desktop table header pinned while scrolling vertically */
  stickyHeader?: boolean;
  /** Max height class for vertical sticky-header scrolling on desktop (default: 'max-h-[68vh]') */
  maxHeightClassName?: string;
  /** Default mobile representation: 'cards' (stacked key-value cards) or 'priority' (compact 3-column priority list) */
  defaultMobileMode?: 'cards' | 'priority';
  /** Show Cards / Priority switcher on mobile when priority columns are configured */
  showMobileViewToggle?: boolean;
  /** Custom mobile card renderer for domain-specific layouts (e.g., Attendance frontline 56px touch buttons) */
  renderMobileCard?: (row: T, index: number) => React.ReactNode;
  /** Optional row click handler (desktop table row & priority row tap) */
  onRowClick?: (row: T) => void;
  /** Row highlight helper */
  getRowClassName?: (row: T, index: number) => string;
  /** Pagination strategy to prevent rendering hundreds of rows at once on low-end phones */
  paginationMode?: 'pages' | 'loadMore';
  /** Initial rows per page / batch size (default: 20) */
  initialPageSize?: number;
  /** Available page size options for paginated mode */
  pageSizeOptions?: number[];
  /** Label for items in summary count (e.g., 'workers', 'records', 'payrolls') */
  itemLabel?: string;
  /** Optional toolbar caption shown on the left of the compact control bar */
  caption?: React.ReactNode;
  /** Optional outer container class */
  className?: string;
  /** Optional desktop table minimum width class (e.g., 'min-w-[960px]') */
  tableMinWidthClassName?: string;
  /** Optional aria-label for the table */
  ariaLabel?: string;
}

export function ResponsiveDataTable<T>({
  data,
  columns,
  keyExtractor,
  loading = false,
  emptyState,
  stickyHeader = true,
  maxHeightClassName = 'max-h-[68vh]',
  defaultMobileMode = 'cards',
  showMobileViewToggle = true,
  renderMobileCard,
  onRowClick,
  getRowClassName,
  paginationMode = 'pages',
  initialPageSize = 20,
  pageSizeOptions = [10, 20, 50, 100],
  itemLabel = 'records',
  caption,
  className = '',
  tableMinWidthClassName = 'min-w-full',
  ariaLabel,
}: ResponsiveDataTableProps<T>) {
  const [mobileMode, setMobileMode] = useState<'cards' | 'priority'>(defaultMobileMode);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [visibleCount, setVisibleCount] = useState<number>(initialPageSize);
  const [expandedPriorityKeys, setExpandedPriorityKeys] = useState<Set<string>>(new Set());

  // Scroll overflow tracking for desktop/tablet horizontal scroll wrapper (recalculated on ResizeObserver + orientationchange)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState({
    hasHorizontalOverflow: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  const priorityColumns = useMemo(
    () => columns.filter((col) => col.mobilePriority).slice(0, 3),
    [columns]
  );

  const hasPriorityView = priorityColumns.length >= 2;
  const effectiveMobileMode = hasPriorityView ? mobileMode : 'cards';

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  // Clamp pagination state cleanly whenever data length or page size changes (e.g. search/filter)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    setVisibleCount((prev) => {
      if (totalItems === 0) return initialPageSize;
      if (prev < initialPageSize) return initialPageSize;
      return prev;
    });
  }, [totalItems, initialPageSize]);

  const paginatedRows = useMemo(() => {
    if (paginationMode === 'loadMore') {
      return data.slice(0, visibleCount);
    }
    const start = (currentPage - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, paginationMode, visibleCount, currentPage, pageSize]);

  const rangeStart = totalItems === 0 ? 0 : paginationMode === 'loadMore' ? 1 : (currentPage - 1) * pageSize + 1;
  const rangeEnd =
    totalItems === 0
      ? 0
      : paginationMode === 'loadMore'
      ? Math.min(visibleCount, totalItems)
      : Math.min(currentPage * pageSize, totalItems);

  const remainingCount = Math.max(0, totalItems - rangeEnd);

  // Recalculate horizontal scroll boundaries cleanly on scroll, ResizeObserver, window resize, and tablet orientationchange
  const recalculateScrollMetrics = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
    // Clamp scrollLeft if tablet rotated from portrait to landscape and container expanded
    if (el.scrollLeft > maxScrollLeft) {
      el.scrollLeft = maxScrollLeft;
    }

    const hasOverflow = maxScrollLeft > 4;
    const canLeft = el.scrollLeft > 4;
    const canRight = el.scrollLeft < maxScrollLeft - 4;

    setScrollState((prev) => {
      if (
        prev.hasHorizontalOverflow === hasOverflow &&
        prev.canScrollLeft === canLeft &&
        prev.canScrollRight === canRight
      ) {
        return prev;
      }
      return {
        hasHorizontalOverflow: hasOverflow,
        canScrollLeft: canLeft,
        canScrollRight: canRight,
      };
    });
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    let rafId = window.requestAnimationFrame(recalculateScrollMetrics);

    const handleResizeOrOrientation = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(() => {
        recalculateScrollMetrics();
      });
    };

    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(handleResizeOrOrientation)
        : null;

    if (observer) {
      observer.observe(el);
      if (el.firstElementChild) {
        observer.observe(el.firstElementChild);
      }
    }

    window.addEventListener('resize', handleResizeOrOrientation, { passive: true });
    window.addEventListener('orientationchange', handleResizeOrOrientation, { passive: true });

    return () => {
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      window.removeEventListener('resize', handleResizeOrOrientation);
      window.removeEventListener('orientationchange', handleResizeOrOrientation);
    };
  }, [recalculateScrollMetrics, paginatedRows.length, columns.length]);

  const scrollHorizontally = (direction: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const delta = Math.max(220, Math.round(el.clientWidth * 0.55));
    el.scrollBy({
      left: direction === 'right' ? delta : -delta,
      behavior: 'smooth',
    });
  };

  const togglePriorityRowExpand = (rowKey: string) => {
    setExpandedPriorityKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const primaryCol = useMemo(
    () => columns.find((c) => c.isPrimary) || columns[0],
    [columns]
  );
  const headerMetricCol = useMemo(
    () => columns.find((c) => c.isHeaderMetric && c.key !== primaryCol?.key),
    [columns, primaryCol]
  );
  const actionCol = useMemo(
    () => columns.find((c) => c.isAction),
    [columns]
  );
  const detailCols = useMemo(
    () =>
      columns.filter(
        (c) =>
          c.key !== primaryCol?.key &&
          c.key !== headerMetricCol?.key &&
          c.key !== actionCol?.key &&
          !c.hideInMobileCard
      ),
    [columns, primaryCol, headerMetricCol, actionCol]
  );

  const alignClass = (align?: 'left' | 'center' | 'right') => {
    if (align === 'right') return 'text-right';
    if (align === 'center') return 'text-center';
    return 'text-left';
  };

  // EDGE CASE: Centered, readable empty state rendered OUTSIDE the <table>
  if (!loading && totalItems === 0) {
    return (
      <div
        className={`w-full bg-white rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center flex flex-col items-center justify-center ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
          {emptyState?.icon || <Inbox size={24} />}
        </div>
        <h3 className="text-fluid-base font-bold text-slate-900 max-w-md">
          {emptyState?.title || `No ${itemLabel} found`}
        </h3>
        {emptyState?.description && (
          <p className="text-fluid-xs text-slate-500 mt-1.5 max-w-md leading-relaxed">
            {emptyState.description}
          </p>
        )}
        {emptyState?.action && <div className="mt-4">{emptyState.action}</div>}
      </div>
    );
  }

  return (
    <div className={`w-full max-w-full min-w-0 space-y-3 ${className}`}>
      {/* COMPACT TABLE CONTROLS BAR */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 px-0.5">
        <div className="text-fluid-xs text-slate-500 font-medium flex items-center flex-wrap gap-2 min-w-0">
          {caption && <div className="min-w-0">{caption}</div>}
          {!loading && totalItems > 0 && (
            <span className="font-mono tabular-nums text-slate-600">
              Showing <strong className="text-slate-900">{rangeStart}–{rangeEnd}</strong> of{' '}
              <strong className="text-slate-900">{totalItems.toLocaleString('en-IN')}</strong> {itemLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {/* Desktop Horizontal Scroll Helper (only when table actually overflows horizontally on md+) */}
          {scrollState.hasHorizontalOverflow && (
            <div className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1 font-medium text-slate-500">
                <MoveHorizontal size={13} className="text-slate-400" />
                <span>Scroll columns</span>
              </span>
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden">
                <button
                  type="button"
                  onClick={() => scrollHorizontally('left')}
                  disabled={!scrollState.canScrollLeft}
                  className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
                  aria-label="Scroll table left"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollHorizontally('right')}
                  disabled={!scrollState.canScrollRight}
                  className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed transition-colors border-l border-slate-200 cursor-pointer"
                  aria-label="Scroll table right"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Mobile View Switcher: Card Layout vs Column Priority View (< md only) */}
          {showMobileViewToggle && hasPriorityView && (
            <div
              className="md:hidden inline-flex items-center p-0.5 rounded-xl bg-slate-200/80 border border-slate-200"
              role="group"
              aria-label="Mobile table layout mode"
            >
              <button
                type="button"
                onClick={() => setMobileMode('cards')}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  effectiveMobileMode === 'cards'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid size={13} />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileMode('priority')}
                className={`min-h-[36px] px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  effectiveMobileMode === 'priority'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <List size={13} />
                <span>Compact</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          DESKTOP & TABLET LANDSCAPE VIEW (md and up): Standard <table> with
          wrapper-only overflow-x-auto and sticky headers
          ===================================================================== */}
      <div className="hidden md:block w-full max-w-full min-w-0 bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden relative">
        {/* Subtle edge scroll cues when horizontally scrollable */}
        {scrollState.canScrollLeft && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 left-0 w-4 z-30 bg-gradient-to-r from-slate-900/[0.06] to-transparent"
          />
        )}
        {scrollState.canScrollRight && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 right-0 w-6 z-30 bg-gradient-to-l from-slate-900/[0.08] to-transparent"
          />
        )}

        <div
          ref={scrollContainerRef}
          onScroll={recalculateScrollMetrics}
          className={`w-full max-w-full overflow-x-auto overscroll-x-contain ${
            stickyHeader ? `${maxHeightClassName} overflow-y-auto` : ''
          }`}
        >
          <table
            aria-label={ariaLabel}
            className={`w-full ${tableMinWidthClassName} border-collapse text-left text-xs`}
          >
            <thead>
              <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`py-3 px-3.5 whitespace-nowrap bg-slate-50 ${
                      stickyHeader
                        ? 'sticky top-0 shadow-[inset_0_-1px_0_0_#e2e8f0]'
                        : 'border-b border-slate-200'
                    } ${
                      col.stickyLeft
                        ? stickyHeader
                          ? 'left-0 z-30 border-r border-slate-200'
                          : 'sticky left-0 z-20 border-r border-slate-200'
                        : stickyHeader
                        ? 'z-20'
                        : ''
                    } ${alignClass(col.align)} ${col.minWidth || ''} ${col.headerClassName || ''}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading
                ? Array.from({ length: Math.min(pageSize, 6) }).map((_, rowIdx) => (
                    <tr key={`skeleton-${rowIdx}`} className="animate-pulse">
                      {columns.map((col) => (
                        <td key={col.key} className="py-3.5 px-3.5">
                          <div className="h-3.5 bg-slate-100 rounded w-3/4" />
                        </td>
                      ))}
                    </tr>
                  ))
                : paginatedRows.map((row, idx) => {
                    const absoluteIndex =
                      paginationMode === 'pages' ? (currentPage - 1) * pageSize + idx : idx;
                    const rowKey = keyExtractor(row, absoluteIndex);
                    const customRowClass = getRowClassName ? getRowClassName(row, absoluteIndex) : '';
                    return (
                      <tr
                        key={rowKey}
                        onClick={onRowClick ? () => onRowClick(row) : undefined}
                        className={`group bg-white hover:bg-slate-50/90 transition-colors ${
                          onRowClick ? 'cursor-pointer' : ''
                        } ${customRowClass}`}
                      >
                        {columns.map((col) => (
                          <td
                            key={col.key}
                            className={`py-3 px-3.5 align-middle ${alignClass(col.align)} ${
                              col.numeric ? 'font-mono tabular-nums' : ''
                            } ${
                              col.stickyLeft
                                ? 'sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-slate-200/80'
                                : ''
                            } ${col.minWidth || ''} ${col.cellClassName || ''}`}
                          >
                            {col.render(row, absoluteIndex)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* =====================================================================
          MOBILE & SMALL TABLET PORTRAIT VIEW (< md):
          Mode A: Vertical Card Layouts (stacked key-value pairs or custom card)
          Mode B: Column Priority View (Name, Status, Amount/Time + tap expand)
          ===================================================================== */}
      <div className="md:hidden w-full max-w-full min-w-0">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={`m-skel-${i}`}
                className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 animate-pulse"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                  <div className="h-4 bg-slate-100 rounded w-20" />
                </div>
                <div className="h-3 bg-slate-100 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : effectiveMobileMode === 'priority' && hasPriorityView ? (
          /* MOBILE COLUMN PRIORITY VIEW (Shows Priority 2-3 columns: Name | Status | Amount/Time) */
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            {/* Sticky Priority Header */}
            <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <div className="col-span-5 truncate">
                {priorityColumns[0]?.mobileLabel || priorityColumns[0]?.header}
              </div>
              <div className="col-span-3 truncate text-center">
                {priorityColumns[1]?.mobileLabel || priorityColumns[1]?.header}
              </div>
              <div className="col-span-4 truncate text-right pr-5">
                {priorityColumns[2]?.mobileLabel || priorityColumns[2]?.header || ''}
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {paginatedRows.map((row, idx) => {
                const absoluteIndex =
                  paginationMode === 'pages' ? (currentPage - 1) * pageSize + idx : idx;
                const rowKey = keyExtractor(row, absoluteIndex);
                const isExpanded = expandedPriorityKeys.has(rowKey);
                const extraColumns = columns.filter(
                  (c) =>
                    !priorityColumns.some((pc) => pc.key === c.key) &&
                    !c.hideInMobileCard
                );

                return (
                  <div key={rowKey} className="bg-white">
                    <button
                      type="button"
                      onClick={() => togglePriorityRowExpand(rowKey)}
                      className="w-full min-h-[56px] px-3.5 py-3 grid grid-cols-12 gap-2 items-center text-left hover:bg-slate-50 active:bg-slate-100/70 transition-colors cursor-pointer"
                      aria-expanded={isExpanded}
                    >
                      <div className="col-span-5 min-w-0">
                        {priorityColumns[0]?.renderPriority
                          ? priorityColumns[0].renderPriority(row, absoluteIndex)
                          : priorityColumns[0]?.render(row, absoluteIndex)}
                      </div>
                      <div className="col-span-3 min-w-0 flex justify-center">
                        {priorityColumns[1]?.renderPriority
                          ? priorityColumns[1].renderPriority(row, absoluteIndex)
                          : priorityColumns[1]?.render(row, absoluteIndex)}
                      </div>
                      <div className="col-span-4 min-w-0 flex items-center justify-end gap-1.5">
                        <div className="min-w-0 text-right font-mono tabular-nums">
                          {priorityColumns[2]
                            ? priorityColumns[2].renderPriority
                              ? priorityColumns[2].renderPriority(row, absoluteIndex)
                              : priorityColumns[2].render(row, absoluteIndex)
                            : null}
                        </div>
                        <span className="text-slate-400 shrink-0">
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      </div>
                    </button>

                    {/* Tap-to-Expand Full Key-Value Breakdown & Actions */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-2 bg-slate-50/70 border-t border-slate-100 space-y-2.5">
                        <dl className="space-y-2">
                          {extraColumns
                            .filter((c) => !c.isAction)
                            .map((col) => (
                              <div
                                key={col.key}
                                className="flex items-start justify-between gap-3 text-fluid-xs"
                              >
                                <dt className="text-slate-500 font-medium shrink-0">
                                  {col.mobileLabel || col.header}
                                </dt>
                                <dd
                                  className={`text-slate-900 text-right min-w-0 break-words ${
                                    col.numeric ? 'font-mono tabular-nums' : ''
                                  }`}
                                >
                                  {col.render(row, absoluteIndex)}
                                </dd>
                              </div>
                            ))}
                        </dl>

                        {(actionCol || onRowClick) && (
                          <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-end gap-2">
                            {actionCol ? actionCol.render(row, absoluteIndex) : null}
                            {onRowClick && !actionCol && (
                              <button
                                type="button"
                                onClick={() => onRowClick(row)}
                                className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                              >
                                View Details
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* MOBILE VERTICAL CARD LAYOUT (Stacked key-value pairs or Custom Mobile Card) */
          <div className="space-y-3">
            {paginatedRows.map((row, idx) => {
              const absoluteIndex =
                paginationMode === 'pages' ? (currentPage - 1) * pageSize + idx : idx;
              const rowKey = keyExtractor(row, absoluteIndex);

              if (renderMobileCard) {
                return (
                  <React.Fragment key={rowKey}>
                    {renderMobileCard(row, absoluteIndex)}
                  </React.Fragment>
                );
              }

              return (
                <article
                  key={rowKey}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 space-y-3 ${
                    onRowClick ? 'cursor-pointer active:bg-slate-50/70' : ''
                  }`}
                >
                  {/* Card Header: Primary Identity + Key Metric/Status */}
                  <div className="flex items-start justify-between gap-3 flex-wrap xs:flex-nowrap min-w-0">
                    <div className="min-w-0 flex-1">
                      {primaryCol?.render(row, absoluteIndex)}
                    </div>
                    {headerMetricCol && (
                      <div
                        className={`shrink-0 text-right ml-auto ${
                          headerMetricCol.numeric ? 'font-mono tabular-nums' : ''
                        }`}
                      >
                        {headerMetricCol.render(row, absoluteIndex)}
                      </div>
                    )}
                  </div>

                  {/* Stacked Key-Value Pairs */}
                  {detailCols.length > 0 && (
                    <dl className="pt-2.5 border-t border-slate-100 space-y-2">
                      {detailCols.map((col) => (
                        <div
                          key={col.key}
                          className="flex items-start justify-between gap-3 text-fluid-xs"
                        >
                          <dt className="text-slate-500 font-medium shrink-0">
                            {col.mobileLabel || col.header}
                          </dt>
                          <dd
                            className={`text-slate-900 text-right min-w-0 break-words ${
                              col.numeric ? 'font-mono tabular-nums' : ''
                            }`}
                          >
                            {col.render(row, absoluteIndex)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {/* Touch-Friendly Footer Actions */}
                  {actionCol && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2"
                    >
                      {actionCol.render(row, absoluteIndex)}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* =====================================================================
          PAGINATION / LOAD MORE CONTROLS (Never renders 500+ rows at once)
          ===================================================================== */}
      {!loading && totalItems > Math.min(pageSize, initialPageSize) && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
          {paginationMode === 'loadMore' ? (
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl px-4 py-3">
              <div className="text-fluid-xs text-slate-600 font-mono tabular-nums">
                Loaded <strong className="text-slate-900">{rangeEnd}</strong> of{' '}
                <strong className="text-slate-900">{totalItems.toLocaleString('en-IN')}</strong> {itemLabel}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {remainingCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => prev + initialPageSize)}
                    className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    Load {Math.min(initialPageSize, remainingCount)} More ({remainingCount} remaining)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setVisibleCount(initialPageSize)}
                    className="w-full sm:w-auto min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all cursor-pointer"
                  >
                    Collapse to First {initialPageSize}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 bg-white border border-slate-200/80 rounded-2xl px-4 py-2.5">
              {/* Rows per page selector */}
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span>Rows per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  aria-label="Rows per page"
                  className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 font-mono font-semibold text-xs outline-none focus:border-blue-500 cursor-pointer"
                >
                  {pageSizeOptions.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </div>

              {/* Page Navigation */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <ChevronLeft size={15} />
                  <span>Prev</span>
                </button>

                <span className="text-xs font-mono tabular-nums text-slate-700 px-2">
                  Page <strong className="text-slate-900">{currentPage}</strong> / {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="min-h-[40px] px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
