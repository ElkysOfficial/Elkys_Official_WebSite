import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import { ArrowLeft, ArrowRight, Clock, Globe, X } from "@/assets/icons";
import AdminEmptyState from "@/components/portal/admin/AdminEmptyState";
import PortalLoading from "@/components/portal/shared/PortalLoading";
import { Button, Card, CardContent, Field, Input, Label, Textarea, cn } from "@/design-system";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { CreateTaskModal, TaskDetailModal, type TeamMember, type TeamTask } from "./Tasks";

type CalendarEvent = Database["public"]["Tables"]["marketing_calendar_events"]["Row"] & {
  client_name: string | null;
  project_name: string | null;
};

type CalendarClient = Pick<
  Database["public"]["Tables"]["clients"]["Row"],
  "id" | "client_type" | "full_name" | "nome_fantasia" | "is_active"
>;

type CalendarProject = Pick<
  Database["public"]["Tables"]["projects"]["Row"],
  "id" | "client_id" | "name" | "status"
>;

type EventFormState = {
  title: string;
  description: string;
  event_type: string;
  channel: string;
  status: string;
  all_day: boolean;
  starts_at: string;
  ends_at: string;
  client_id: string;
  project_id: string;
};

type CalendarView = "mes" | "semana" | "dia";

type CalendarDay = {
  date: Date;
  key: string;
  isCurrentMonth?: boolean;
  isToday: boolean;
};

type TimelineLayout = {
  event: CalendarEvent;
  top: number;
  height: number;
  leftPct: number;
  widthPct: number;
};

type ResizeSession = {
  eventId: string;
  startClientY: number;
  originalStartMs: number;
  originalEndMs: number;
} | null;

const EVENT_TYPE_LABEL: Record<string, string> = {
  post: "Post",
  story: "Story",
  campanha: "Campanha",
  reuniao: "Reuniao",
  entrega: "Entrega",
  outro: "Outro",
};

const STATUS_LABEL: Record<string, string> = {
  planejado: "Planejado",
  em_producao: "Em producao",
  agendado: "Agendado",
  publicado: "Publicado",
  cancelado: "Cancelado",
};

const STATUS_BADGE_TONE: Record<string, string> = {
  planejado: "border-primary/20 bg-primary/10 text-primary",
  em_producao: "border-warning/20 bg-warning/10 text-warning",
  agendado: "border-accent/20 bg-accent/10 text-accent",
  publicado: "border-success/20 bg-success/10 text-success",
  cancelado: "border-border/70 bg-muted/60 text-muted-foreground",
};

const EVENT_TYPE_ACCENT: Record<string, string> = {
  post: "bg-primary",
  story: "bg-accent",
  campanha: "bg-warning",
  reuniao: "bg-secondary",
  entrega: "bg-success",
  outro: "bg-muted-foreground",
};

const CHANNEL_OPTIONS = [
  "Instagram",
  "Facebook",
  "LinkedIn",
  "TikTok",
  "YouTube",
  "Blog",
  "WhatsApp",
  "Email",
  "Interno",
];

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const MIN_TIMELINE_START_HOUR = 6;
const DEFAULT_TIMELINE_START_HOUR = 8;
const DEFAULT_TIMELINE_END_HOUR = 21;
const MAX_TIMELINE_END_HOUR = 23;
const SLOT_MINUTES = 30;
const HOUR_HEIGHT = 56;
const SLOT_HEIGHT = HOUR_HEIGHT / 2;

const selectClass =
  "flex h-9 min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function parseDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`);
}

function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function addMinutes(date: Date, minutes: number) {
  const nextDate = new Date(date);
  nextDate.setMinutes(nextDate.getMinutes() + minutes);
  return nextDate;
}

function getStartOfWeek(date: Date) {
  return addDays(date, -date.getDay());
}

function createDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function getDateLabel(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function getWeekRangeLabel(dateKey: string) {
  const focusDate = parseDateKey(dateKey);
  const weekStart = getStartOfWeek(focusDate);
  const weekEnd = addDays(weekStart, 6);

  return `${weekStart.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  })} - ${weekEnd.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;
}

function formatShortTime(dateIso: string) {
  return new Date(dateIso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatHourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function toLocalDateTimeInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function buildDateAtSlot(dateKey: string, hour: number, minute = 0) {
  const date = parseDateKey(dateKey);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function defaultFormForDate(dateKey: string, hour = 9, minute = 0): EventFormState {
  const baseDate = buildDateAtSlot(dateKey, hour, minute);
  const endDate = addMinutes(baseDate, 60);

  return {
    title: "",
    description: "",
    event_type: "post",
    channel: "Instagram",
    status: "planejado",
    all_day: false,
    starts_at: toLocalDateTimeInput(baseDate),
    ends_at: toLocalDateTimeInput(endDate),
    client_id: "",
    project_id: "",
  };
}

function defaultAllDayFormForDate(dateKey: string): EventFormState {
  return {
    ...defaultFormForDate(dateKey),
    all_day: true,
    starts_at: dateKey,
    ends_at: dateKey,
  };
}

function getCalendarRange(monthCursor: Date) {
  const monthStart = startOfMonth(monthCursor);
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 41);

  const queryEnd = new Date(gridEnd);
  queryEnd.setDate(gridEnd.getDate() + 1);

  return { monthStart, gridStart, gridEnd, queryEnd };
}

function buildCalendarDays(monthCursor: Date): CalendarDay[] {
  const monthStart = startOfMonth(monthCursor);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const daysInMonth = monthEnd.getDate();
  const startDow = monthStart.getDay(); // 0=Sun

  // Leading empty cells for alignment
  const leadingBlanks: CalendarDay[] = Array.from({ length: startDow }).map((_, i) => ({
    date: addDays(monthStart, -(startDow - i)),
    key: `blank-start-${i}`,
    isCurrentMonth: false,
    isToday: false,
  }));

  // Actual days of the month
  const monthDays: CalendarDay[] = Array.from({ length: daysInMonth }).map((_, i) => {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), i + 1);
    return {
      date,
      key: createDateKey(date),
      isCurrentMonth: true,
      isToday: createDateKey(date) === createDateKey(new Date()),
    };
  });

  // Trailing blanks to fill the last week row
  const totalCells = leadingBlanks.length + monthDays.length;
  const trailingCount = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  const trailingBlanks: CalendarDay[] = Array.from({ length: trailingCount }).map((_, i) => ({
    date: addDays(monthEnd, i + 1),
    key: `blank-end-${i}`,
    isCurrentMonth: false,
    isToday: false,
  }));

  return [...leadingBlanks, ...monthDays, ...trailingBlanks];
}

function buildWeekDays(dateKey: string) {
  const weekStart = getStartOfWeek(parseDateKey(dateKey));

  return Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(weekStart, index);

    return {
      date,
      key: createDateKey(date),
      isToday: createDateKey(date) === createDateKey(new Date()),
    };
  });
}

function buildTimelineSlots(startHour: number, endHour: number) {
  return Array.from({ length: (endHour - startHour) * 2 }).map((_, index) => {
    const absoluteMinutes = index * SLOT_MINUTES;
    const hour = startHour + Math.floor(absoluteMinutes / 60);
    const minute = absoluteMinutes % 60;

    return {
      key: `${hour}-${minute}`,
      index,
      hour,
      minute,
    };
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function roundToNearestSlot(value: number) {
  return Math.round(value / SLOT_MINUTES) * SLOT_MINUTES;
}

function getMinutesFromDayStart(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function getTimelineWindow(events: CalendarEvent[]) {
  const timedEvents = events.filter((event) => !event.all_day);

  if (timedEvents.length === 0) {
    return {
      startHour: DEFAULT_TIMELINE_START_HOUR,
      endHour: DEFAULT_TIMELINE_END_HOUR,
    };
  }

  const earliestEventMinute = timedEvents.reduce(
    (earliestMinute, event) =>
      Math.min(earliestMinute, getMinutesFromDayStart(new Date(event.starts_at))),
    MAX_TIMELINE_END_HOUR * 60
  );
  const latestEventMinute = timedEvents.reduce(
    (latestMinute, event) =>
      Math.max(latestMinute, getMinutesFromDayStart(new Date(event.ends_at))),
    0
  );

  const startHour = Math.max(
    MIN_TIMELINE_START_HOUR,
    Math.min(DEFAULT_TIMELINE_START_HOUR, Math.floor(earliestEventMinute / 60) - 1)
  );
  const endHour = Math.min(
    MAX_TIMELINE_END_HOUR,
    Math.max(DEFAULT_TIMELINE_END_HOUR, Math.ceil(latestEventMinute / 60) + 1)
  );

  return { startHour, endHour };
}

function isSameMonth(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth();
}

function formatEventTime(event: Pick<CalendarEvent, "starts_at" | "ends_at" | "all_day">) {
  if (event.all_day) return "Dia inteiro";
  return `${formatShortTime(event.starts_at)} - ${formatShortTime(event.ends_at)}`;
}

function getEventClientName(client: CalendarClient | null) {
  if (!client) return null;
  return client.client_type === "pj" && client.nome_fantasia
    ? client.nome_fantasia
    : client.full_name;
}

function buildTimelineLayouts(events: CalendarEvent[], startHour: number, endHour: number) {
  const dayStartMinutes = startHour * 60;
  const dayEndMinutes = endHour * 60;
  const totalMinutes = dayEndMinutes - dayStartMinutes;

  const normalizedEvents = events
    .filter((event) => !event.all_day)
    .map((event) => {
      const start = new Date(event.starts_at);
      const end = new Date(event.ends_at);
      const unclampedStart = getMinutesFromDayStart(start) - dayStartMinutes;
      const unclampedEnd = getMinutesFromDayStart(end) - dayStartMinutes;
      const startMinutes = clamp(unclampedStart, 0, totalMinutes - SLOT_MINUTES);
      const endMinutes = clamp(
        Math.max(unclampedEnd, startMinutes + SLOT_MINUTES),
        startMinutes + SLOT_MINUTES,
        totalMinutes
      );

      return {
        event,
        startMinutes,
        endMinutes,
      };
    })
    .sort((left, right) =>
      left.startMinutes === right.startMinutes
        ? left.endMinutes - right.endMinutes
        : left.startMinutes - right.startMinutes
    );

  const clusters: Array<typeof normalizedEvents> = [];
  let clusterStartIndex = 0;

  while (clusterStartIndex < normalizedEvents.length) {
    const currentCluster = [normalizedEvents[clusterStartIndex]];
    let clusterEnd = normalizedEvents[clusterStartIndex].endMinutes;
    let nextIndex = clusterStartIndex + 1;

    while (nextIndex < normalizedEvents.length) {
      const candidate = normalizedEvents[nextIndex];
      if (candidate.startMinutes >= clusterEnd) break;
      currentCluster.push(candidate);
      clusterEnd = Math.max(clusterEnd, candidate.endMinutes);
      nextIndex += 1;
    }

    clusters.push(currentCluster);
    clusterStartIndex = nextIndex;
  }

  return clusters.flatMap((cluster) => {
    const activeColumns: Array<{ column: number; endMinutes: number }> = [];
    const columnAssignments = new Map<string, number>();
    let columnCount = 0;

    cluster.forEach((item) => {
      for (let index = activeColumns.length - 1; index >= 0; index -= 1) {
        if (activeColumns[index].endMinutes <= item.startMinutes) {
          activeColumns.splice(index, 1);
        }
      }

      const usedColumns = new Set(activeColumns.map((active) => active.column));
      let assignedColumn = 0;
      while (usedColumns.has(assignedColumn)) assignedColumn += 1;

      activeColumns.push({
        column: assignedColumn,
        endMinutes: item.endMinutes,
      });
      columnAssignments.set(item.event.id, assignedColumn);
      columnCount = Math.max(columnCount, assignedColumn + 1);
    });

    return cluster.map((item) => ({
      event: item.event,
      top: (item.startMinutes / SLOT_MINUTES) * SLOT_HEIGHT,
      height: Math.max(((item.endMinutes - item.startMinutes) / SLOT_MINUTES) * SLOT_HEIGHT, 38),
      leftPct: (columnAssignments.get(item.event.id) ?? 0) * (100 / columnCount),
      widthPct: 100 / columnCount,
    }));
  });
}

function CompactMetricCard({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card p-5">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      </div>
      {badge ? (
        <span className="inline-flex shrink-0 rounded-full border border-border/50 bg-card px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {badge}
        </span>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide",
        STATUS_BADGE_TONE[status] ?? STATUS_BADGE_TONE.planejado
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function ClientPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
      {label}
    </span>
  );
}

function MonthEventChip({
  event,
  selected,
  onSelect,
  onHover,
  onDragStart,
  onDragEnd,
}: {
  event: CalendarEvent;
  selected: boolean;
  onSelect: (event: CalendarEvent) => void;
  onHover: (eventId: string | null) => void;
  onDragStart: (eventId: string) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={() => onDragStart(event.id)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => onHover(event.id)}
      onMouseLeave={() => onHover(null)}
      onClick={(mouseEvent) => {
        mouseEvent.stopPropagation();
        onSelect(event);
      }}
      className={cn(
        "group relative w-full overflow-hidden rounded-xl border border-border/60 bg-background/85 px-2.5 py-2 text-left shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:border-primary/25 hover:bg-card hover:shadow-md",
        selected ? "border-primary/45 ring-1 ring-primary/20" : ""
      )}
    >
      <span
        className={cn(
          "absolute bottom-2 left-0 top-2 w-1 rounded-full",
          EVENT_TYPE_ACCENT[event.event_type] ?? EVENT_TYPE_ACCENT.outro
        )}
      />
      <div className="pl-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-[11px] font-semibold text-foreground">{event.title}</p>
          <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
            {event.all_day ? "Dia" : formatShortTime(event.starts_at)}
          </span>
        </div>
        <p className="mt-1 truncate text-[10px] text-muted-foreground">
          {EVENT_TYPE_LABEL[event.event_type] ?? "Evento"}
        </p>
        {event.client_name || event.project_name ? (
          <p className="mt-1 truncate text-[10px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100">
            {[event.client_name, event.project_name].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
    </button>
  );
}

function TimelineEventBlock({
  event,
  style,
  selected,
  isResizing,
  showDetails,
  onSelect,
  onHover,
  onDragStart,
  onDragEnd,
  onResizeStart,
}: {
  event: CalendarEvent;
  style: {
    top: number;
    height: number;
    left: string;
    width: string;
  };
  selected: boolean;
  isResizing: boolean;
  showDetails: boolean;
  onSelect: (event: CalendarEvent) => void;
  onHover: (eventId: string | null) => void;
  onDragStart: (eventId: string) => void;
  onDragEnd: () => void;
  onResizeStart: (event: CalendarEvent, clientY: number) => void;
}) {
  return (
    <button
      type="button"
      draggable
      onDragStart={() => onDragStart(event.id)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => onHover(event.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(event)}
      className={cn(
        "group absolute overflow-hidden rounded-xl border border-border/60 bg-background/92 px-2 py-1.5 text-left shadow-sm backdrop-blur-sm transition-all duration-200 ease-out hover:-translate-y-px hover:border-primary/25 hover:shadow-md",
        selected ? "border-primary/50 ring-1 ring-primary/20" : "",
        isResizing ? "border-primary/60 shadow-md" : ""
      )}
      style={style}
    >
      <span
        className={cn(
          "absolute bottom-1.5 left-0 top-1.5 w-1 rounded-full",
          EVENT_TYPE_ACCENT[event.event_type] ?? EVENT_TYPE_ACCENT.outro
        )}
      />
      <div className="flex h-full flex-col justify-between pl-2.5">
        <div>
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-[11px] font-semibold text-foreground">{event.title}</p>
            <span className="shrink-0 text-[10px] font-medium text-muted-foreground">
              {event.all_day ? "Dia" : formatShortTime(event.starts_at)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
            {event.all_day ? "Dia inteiro" : formatEventTime(event)}
          </p>
          {showDetails && (event.client_name || event.project_name || event.channel) ? (
            <p className="mt-1 truncate text-[10px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              {[event.client_name, event.project_name, event.channel].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </div>

        {!event.all_day ? (
          <button
            type="button"
            aria-label="Ajustar duracao do evento"
            className="absolute bottom-1 right-1 h-3 w-6 cursor-ns-resize rounded-full bg-foreground/10 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            onMouseDown={(mouseEvent) => {
              mouseEvent.preventDefault();
              mouseEvent.stopPropagation();
              onResizeStart(event, mouseEvent.clientY);
            }}
          />
        ) : null}
      </div>
    </button>
  );
}

function AgendaListItem({
  event,
  selected,
  onSelect,
}: {
  event: CalendarEvent;
  selected: boolean;
  onSelect: (event: CalendarEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      className={cn(
        "w-full rounded-2xl border border-border/60 bg-background/70 px-3 py-3 text-left transition-all duration-150 ease-out hover:border-primary/25 hover:bg-card",
        selected ? "border-primary/45 bg-primary/5" : ""
      )}
    >
      <div className="flex items-start gap-3">
        <div className="w-14 shrink-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {event.all_day ? "Dia" : formatShortTime(event.starts_at)}
          </p>
          {!event.all_day ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {formatShortTime(event.ends_at)}
            </p>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <p className="truncate text-sm font-semibold text-foreground" title={event.title}>
              {event.title}
            </p>
            <StatusPill status={event.status} />
          </div>

          <div className="flex flex-wrap gap-2">
            {event.client_name ? <ClientPill label={event.client_name} /> : null}
            {event.channel ? <ClientPill label={event.channel} /> : null}
          </div>
        </div>
      </div>
    </button>
  );
}

/**
 * Mapa de dominios para filtro de tarefas no calendario.
 * Mesmo padrao de DOMAIN_PRESETS em Tasks.tsx.
 * Cada dominio filtra por category da team_task.
 */
const CALENDAR_DOMAIN_ROLES: Record<string, string[]> = {
  comercial: ["comercial"],
  financeiro: ["financeiro"],
  juridico: ["juridico"],
  desenvolvimento: ["desenvolvimento"],
  suporte: ["suporte"],
  marketing: ["marketing"],
};

export default function AdminMarketingCalendar() {
  const { user, isAdmin, isMarketing, isSuperAdmin, roles } = useAuth();
  const { domain } = useParams<{ domain?: string }>();
  const domainCategories = domain ? CALENDAR_DOMAIN_ROLES[domain] : undefined;
  const hasLoadedCalendarRef = useRef(false);
  const resizeSessionRef = useRef<ResizeSession>(null);
  const resizePreviewRef = useRef<string | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<CalendarView>("semana");
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => createDateKey(new Date()));
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [clients, setClients] = useState<CalendarClient[]>([]);
  const [projects, setProjects] = useState<CalendarProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [dragOverDateKey, setDragOverDateKey] = useState<string | null>(null);
  const [resizingEventId, setResizingEventId] = useState<string | null>(null);
  const [resizePreviewEndAt, setResizePreviewEndAt] = useState<string | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Task integration state (edit/create tasks directly from the calendar)
  const [taskMembers, setTaskMembers] = useState<TeamMember[]>([]);
  const [taskMemberMap, setTaskMemberMap] = useState<Map<string, TeamMember>>(new Map());
  const [openTask, setOpenTask] = useState<TeamTask | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);

  useEffect(() => {
    const loadMembers = async () => {
      const { data, error } = await supabase
        .from("team_members_with_role")
        .select("id, user_id, full_name, system_role, is_active");
      if (error || !data) return;
      const list = data as unknown as TeamMember[];
      setTaskMembers(list);
      setTaskMemberMap(new Map(list.filter((m) => m.user_id).map((m) => [m.user_id, m])));
    };
    void loadMembers();
  }, []);
  const [timelineScrollbarWidth, setTimelineScrollbarWidth] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [channelFilter, setChannelFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");
  const [form, setForm] = useState<EventFormState>(() =>
    defaultFormForDate(createDateKey(new Date()))
  );
  const calendarDays = useMemo(() => buildCalendarDays(monthCursor), [monthCursor]);
  const weekDays = useMemo(() => buildWeekDays(selectedDate), [selectedDate]);
  const selectedDateObject = useMemo(() => parseDateKey(selectedDate), [selectedDate]);
  const timelineDays = useMemo<CalendarDay[]>(
    () => (view === "dia" ? weekDays.filter((day) => day.key === selectedDate) : weekDays),
    [selectedDate, view, weekDays]
  );
  const filteredProjects = useMemo(
    () =>
      projects.filter((project) => (form.client_id ? project.client_id === form.client_id : true)),
    [form.client_id, projects]
  );
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === editingId) ?? null,
    [editingId, events]
  );
  const availableChannels = useMemo(
    () =>
      Array.from(new Set(events.map((event) => event.channel).filter(Boolean) as string[])).sort(
        (left, right) => left.localeCompare(right, "pt-BR")
      ),
    [events]
  );
  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const matchesChannel = channelFilter === "all" || event.channel === channelFilter;
        const matchesClient = clientFilter === "all" || event.client_id === clientFilter;
        return matchesChannel && matchesClient;
      }),
    [channelFilter, clientFilter, events]
  );
  const visibleEvents = useMemo(
    () =>
      filteredEvents.map((event) =>
        event.id === resizingEventId && resizePreviewEndAt
          ? {
              ...event,
              ends_at: resizePreviewEndAt,
            }
          : event
      ),
    [filteredEvents, resizePreviewEndAt, resizingEventId]
  );
  const eventsByDay = useMemo(() => {
    return visibleEvents.reduce<Record<string, CalendarEvent[]>>((accumulator, event) => {
      const dateKey = createDateKey(new Date(event.starts_at));
      if (!accumulator[dateKey]) accumulator[dateKey] = [];
      accumulator[dateKey].push(event);
      return accumulator;
    }, {});
  }, [visibleEvents]);
  const selectedDayEvents = useMemo(
    () =>
      (eventsByDay[selectedDate] ?? []).sort((left, right) =>
        left.starts_at.localeCompare(right.starts_at)
      ),
    [eventsByDay, selectedDate]
  );
  const weeklyEvents = useMemo(
    () =>
      weekDays
        .flatMap((day) => eventsByDay[day.key] ?? [])
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at)),
    [eventsByDay, weekDays]
  );
  const timelineEvents = useMemo(
    () =>
      timelineDays
        .flatMap((day) => eventsByDay[day.key] ?? [])
        .sort((left, right) => left.starts_at.localeCompare(right.starts_at)),
    [eventsByDay, timelineDays]
  );
  const timelineWindow = useMemo(() => getTimelineWindow(timelineEvents), [timelineEvents]);
  const timelineSlots = useMemo(
    () => buildTimelineSlots(timelineWindow.startHour, timelineWindow.endHour),
    [timelineWindow.endHour, timelineWindow.startHour]
  );
  const timelineHeight = useMemo(
    () => (timelineWindow.endHour - timelineWindow.startHour) * HOUR_HEIGHT,
    [timelineWindow.endHour, timelineWindow.startHour]
  );
  const monthlyEvents = useMemo(
    () =>
      visibleEvents.filter((event) => {
        const date = new Date(event.starts_at);
        return (
          date.getFullYear() === monthCursor.getFullYear() &&
          date.getMonth() === monthCursor.getMonth()
        );
      }),
    [monthCursor, visibleEvents]
  );
  const timelineLayoutsByDay = useMemo(
    () =>
      Object.fromEntries(
        timelineDays.map((day) => [
          day.key,
          buildTimelineLayouts(
            (eventsByDay[day.key] ?? []).filter((event) => !event.all_day),
            timelineWindow.startHour,
            timelineWindow.endHour
          ),
        ])
      ) as Record<string, TimelineLayout[]>,
    [eventsByDay, timelineDays, timelineWindow.endHour, timelineWindow.startHour]
  );
  const currentPeriodEvents = useMemo(() => {
    if (view === "mes") return monthlyEvents;
    if (view === "semana") return weeklyEvents;
    return selectedDayEvents;
  }, [monthlyEvents, selectedDayEvents, view, weeklyEvents]);
  const periodClientCount = useMemo(
    () => new Set(currentPeriodEvents.map((event) => event.client_id).filter(Boolean)).size,
    [currentPeriodEvents]
  );
  const periodContentCount = useMemo(
    () =>
      currentPeriodEvents.filter((event) =>
        ["post", "story", "campanha"].includes(event.event_type)
      ).length,
    [currentPeriodEvents]
  );
  const periodPublishedCount = useMemo(
    () => currentPeriodEvents.filter((event) => event.status === "publicado").length,
    [currentPeriodEvents]
  );
  const periodAllDayCount = useMemo(
    () => currentPeriodEvents.filter((event) => event.all_day).length,
    [currentPeriodEvents]
  );
  const periodBusyDays = useMemo(
    () =>
      new Set(
        currentPeriodEvents.map((event) => createDateKey(new Date(event.starts_at))).filter(Boolean)
      ).size,
    [currentPeriodEvents]
  );
  const currentPeriodLabel = useMemo(() => {
    if (view === "dia") return getDateLabel(selectedDate);
    if (view === "semana") return getWeekRangeLabel(selectedDate);
    return getMonthLabel(monthCursor);
  }, [monthCursor, selectedDate, view]);
  const periodMetrics = useMemo(() => {
    if (view === "mes") {
      return [
        {
          label: "Eventos do mes",
          value: String(currentPeriodEvents.length),
          badge: `${periodBusyDays} dias`,
        },
        {
          label: "Conteudo",
          value: String(periodContentCount),
          badge: "posts",
        },
        {
          label: "Publicados",
          value: String(periodPublishedCount),
          badge: "status",
        },
        {
          label: "Clientes",
          value: String(periodClientCount),
          badge: clientFilter === "all" ? undefined : "filtrado",
        },
      ];
    }

    if (view === "semana") {
      return [
        {
          label: "Eventos na semana",
          value: String(currentPeriodEvents.length),
          badge: `${periodBusyDays} dias`,
        },
        {
          label: "Conteudo",
          value: String(periodContentCount),
          badge: "producao",
        },
        {
          label: "Publicados",
          value: String(periodPublishedCount),
          badge: "entregues",
        },
        {
          label: "Clientes",
          value: String(periodClientCount),
          badge: periodAllDayCount > 0 ? `${periodAllDayCount} all day` : undefined,
        },
      ];
    }

    return [
      {
        label: "Eventos do dia",
        value: String(currentPeriodEvents.length),
        badge: `${periodAllDayCount} all day`,
      },
      {
        label: "Conteudo",
        value: String(periodContentCount),
        badge: "marketing",
      },
      {
        label: "Publicados",
        value: String(periodPublishedCount),
        badge: "status",
      },
      {
        label: "Clientes",
        value: String(periodClientCount),
      },
    ];
  }, [
    clientFilter,
    currentPeriodEvents.length,
    periodAllDayCount,
    periodBusyDays,
    periodClientCount,
    periodContentCount,
    periodPublishedCount,
    view,
  ]);
  const canRemoveEvent = isSuperAdmin || isMarketing;

  resizePreviewRef.current = resizePreviewEndAt;

  const syncMonthCursorWithDate = (date: Date) => {
    const normalizedDate = startOfMonth(date);
    setMonthCursor((current) => (isSameMonth(current, normalizedDate) ? current : normalizedDate));
  };

  useEffect(() => {
    let active = true;

    const loadCalendar = async () => {
      const isInitialLoad = !hasLoadedCalendarRef.current;

      if (isInitialLoad) {
        setLoading(true);
      } else {
        setIsRefreshing(true);
      }

      setPageError(null);

      const { gridStart, queryEnd } = getCalendarRange(monthCursor);
      const [eventsRes, clientsRes, projectsRes, tasksRes] = await Promise.all([
        supabase
          .from("marketing_calendar_events")
          .select("*, clients(id, client_type, full_name, nome_fantasia), projects(id, name)")
          .gte("starts_at", gridStart.toISOString())
          .lt("starts_at", queryEnd.toISOString())
          .order("starts_at", { ascending: true }),
        supabase
          .from("clients")
          .select("id, client_type, full_name, nome_fantasia, is_active")
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("projects")
          .select("id, client_id, name, status")
          .neq("status", "cancelado")
          .order("created_at", { ascending: false }),
        // Load team tasks that have dates, to show on calendar
        supabase
          .from("team_tasks")
          .select("*")
          .not("starts_at", "is", null)
          .gte("starts_at", gridStart.toISOString())
          .lt("starts_at", queryEnd.toISOString())
          .neq("status", "concluida")
          .order("starts_at", { ascending: true }),
      ]);

      if (!active) return;

      const hardError = eventsRes.error ?? clientsRes.error ?? projectsRes.error ?? tasksRes.error;
      if (hardError) {
        if (isInitialLoad) {
          setPageError(hardError.message);
        } else {
          toast.error("Não foi possível atualizar o calendario.", {
            description: hardError.message,
          });
        }

        if (isInitialLoad) setLoading(false);
        setIsRefreshing(false);
        return;
      }

      // Marketing calendar events: mostrar em calendario geral e marketing
      // Em calendarios de outros dominios, ocultar (sao eventos de marketing)
      const showMarketingEvents = !domainCategories || domainCategories.includes("marketing");
      const mappedEvents: CalendarEvent[] = showMarketingEvents
        ? ((eventsRes.data as Record<string, unknown>[] | null) ?? []).map((item) => {
            const client = item["clients"] as CalendarClient | null;
            const project = item["projects"] as { id: string; name: string } | null;

            return {
              ...(item as unknown as Database["public"]["Tables"]["marketing_calendar_events"]["Row"]),
              client_name: getEventClientName(client),
              project_name: project?.name ?? null,
            };
          })
        : [];

      // Convert team_tasks into CalendarEvent shape (virtual events for the calendar)
      // Quando acessado via /calendario/:domain, filtra por category do dominio
      const taskEvents: CalendarEvent[] = (
        (tasksRes.data as Record<string, unknown>[] | null) ?? []
      )
        .filter((t) => {
          // Filtro de dominio: so mostra tarefas da category do dominio
          // ou atribuidas ao usuario atual
          if (domainCategories) {
            const taskCategory = (t["category"] as string) ?? "geral";
            const taskAssignedTo = t["assigned_to"] as string | null;
            if (!domainCategories.includes(taskCategory) && taskAssignedTo !== user?.id) {
              return false;
            }
          }

          const taskRoles = t["role_visibility"] as string[] | null;
          const taskAssignedTo = t["assigned_to"] as string | null;
          // Role-based visibility: admin sees all, others see assigned or role-visible
          if (isAdmin) return true;
          if (taskAssignedTo === user?.id) return true;
          if (taskRoles?.length) {
            return taskRoles.some((r) => roles.includes(r as never));
          }
          return false;
        })
        .map((t) => {
          const startsAt = t["starts_at"] as string;
          const endsAt = (t["ends_at"] as string | null) ?? startsAt;
          const categoryLabel: Record<string, string> = {
            desenvolvimento: "Dev",
            marketing: "Mkt",
            suporte: "Suporte",
            financeiro: "Fin",
            reuniao: "Reunião",
            geral: "Geral",
          };
          return {
            id: `task-${t["id"] as string}`,
            title: `[Tarefa] ${t["title"] as string}`,
            description: (t["description"] as string | null) ?? "",
            event_type: "entrega",
            channel: null,
            status: "planejado",
            all_day: false,
            starts_at: startsAt,
            ends_at: endsAt,
            client_id: (t["client_id"] as string | null) ?? null,
            project_id: (t["project_id"] as string | null) ?? null,
            created_by: (t["created_by"] as string | null) ?? null,
            created_at: t["created_at"] as string,
            updated_at: t["updated_at"] as string,
            client_name: categoryLabel[(t["category"] as string) ?? "geral"] ?? "Tarefa",
            project_name: null,
          } satisfies CalendarEvent;
        });

      setEvents([...mappedEvents, ...taskEvents]);
      setClients((clientsRes.data as CalendarClient[] | null) ?? []);
      setProjects((projectsRes.data as CalendarProject[] | null) ?? []);
      hasLoadedCalendarRef.current = true;
      setLoading(false);
      setIsRefreshing(false);
    };

    void loadCalendar();

    return () => {
      active = false;
    };
  }, [monthCursor, reloadToken, domainCategories, user?.id, isAdmin, roles]);

  useLayoutEffect(() => {
    if (view === "mes") {
      setTimelineScrollbarWidth(0);
      return;
    }

    const measureScrollbar = () => {
      const nextScrollbarWidth = timelineScrollRef.current
        ? timelineScrollRef.current.offsetWidth - timelineScrollRef.current.clientWidth
        : 0;

      setTimelineScrollbarWidth(nextScrollbarWidth);
    };

    const frameId = window.requestAnimationFrame(measureScrollbar);
    window.addEventListener("resize", measureScrollbar);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", measureScrollbar);
    };
  }, [loading, timelineDays.length, timelineHeight, view]);

  useEffect(() => {
    if (!calendarDays.some((day) => day.key === selectedDate)) {
      const fallbackDate = createDateKey(startOfMonth(monthCursor));
      setSelectedDate(fallbackDate);
      if (!editingId) setForm(defaultFormForDate(fallbackDate));
    }
  }, [calendarDays, editingId, monthCursor, selectedDate]);

  useEffect(() => {
    if (!resizingEventId || !resizeSessionRef.current) return;

    const handleMouseMove = (mouseEvent: MouseEvent) => {
      const resizeSession = resizeSessionRef.current;
      if (!resizeSession) return;

      const deltaMinutes = roundToNearestSlot(
        ((mouseEvent.clientY - resizeSession.startClientY) / SLOT_HEIGHT) * SLOT_MINUTES
      );
      const nextEndMs = Math.max(
        resizeSession.originalStartMs + SLOT_MINUTES * 60 * 1000,
        resizeSession.originalEndMs + deltaMinutes * 60 * 1000
      );

      setResizePreviewEndAt(new Date(nextEndMs).toISOString());
    };

    const handleMouseUp = () => {
      const resizeSession = resizeSessionRef.current;
      const nextEndAt = resizePreviewRef.current;

      resizeSessionRef.current = null;
      setResizingEventId(null);
      setResizePreviewEndAt(null);

      if (!resizeSession || !nextEndAt) return;

      const originalEndAt = new Date(resizeSession.originalEndMs).toISOString();
      if (nextEndAt === originalEndAt) return;

      const persistResize = async () => {
        setMovingEventId(resizeSession.eventId);

        const { error } = await supabase
          .from("marketing_calendar_events")
          .update({
            ends_at: nextEndAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", resizeSession.eventId);

        setMovingEventId(null);

        if (error) {
          toast.error("Não foi possível ajustar a duracao do evento.", {
            description: error.message,
          });
          return;
        }

        setEvents((current) =>
          current.map((event) =>
            event.id === resizeSession.eventId
              ? {
                  ...event,
                  ends_at: nextEndAt,
                }
              : event
          )
        );

        if (editingId === resizeSession.eventId) {
          setForm((current) => ({
            ...current,
            ends_at: current.all_day
              ? nextEndAt.slice(0, 10)
              : toLocalDateTimeInput(new Date(nextEndAt)),
          }));
        }

        toast.success("Duracao atualizada.");
      };

      void persistResize();
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [editingId, resizingEventId]);

  useEffect(() => {
    if (!isEditorOpen) return;

    const handleKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        setIsEditorOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isEditorOpen]);

  const reloadCurrentRange = () => {
    setReloadToken((current) => current + 1);
  };

  const resetForm = (dateKey = selectedDate, hour = 9, minute = 0, allDay = false) => {
    setEditingId(null);
    setForm(allDay ? defaultAllDayFormForDate(dateKey) : defaultFormForDate(dateKey, hour, minute));
  };

  const focusTitleField = () => {
    window.setTimeout(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }, 0);
  };

  const handleCreateForSlot = (dateKey: string, hour = 9, minute = 0, allDay = false) => {
    setSelectedDate(dateKey);
    resetForm(dateKey, hour, minute, allDay);
    setIsEditorOpen(true);
    focusTitleField();
  };

  const handleSelectEvent = async (event: CalendarEvent) => {
    // Task virtual events: open the same detail modal used on the Tasks page.
    if (event.id.startsWith("task-")) {
      const taskId = event.id.slice("task-".length);
      const { data, error } = await supabase
        .from("team_tasks")
        .select("*")
        .eq("id", taskId)
        .maybeSingle();
      if (error || !data) {
        toast.error("Não foi possível carregar a tarefa.", {
          description: error?.message,
        });
        return;
      }
      setOpenTask(data as unknown as TeamTask);
      return;
    }
    setEditingId(event.id);
    setSelectedDate(createDateKey(new Date(event.starts_at)));
    setForm({
      title: event.title,
      description: event.description ?? "",
      event_type: event.event_type,
      channel: event.channel ?? "",
      status: event.status,
      all_day: event.all_day,
      starts_at: event.all_day
        ? event.starts_at.slice(0, 10)
        : toLocalDateTimeInput(new Date(event.starts_at)),
      ends_at: event.all_day
        ? event.ends_at.slice(0, 10)
        : toLocalDateTimeInput(new Date(event.ends_at)),
      client_id: event.client_id ?? "",
      project_id: event.project_id ?? "",
    });
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
  };

  const handleNavigate = (direction: -1 | 1) => {
    if (view === "mes") {
      const nextDate = new Date(
        selectedDateObject.getFullYear(),
        selectedDateObject.getMonth() + direction,
        selectedDateObject.getDate()
      );
      setSelectedDate(createDateKey(nextDate));
      syncMonthCursorWithDate(nextDate);
      return;
    }

    const amount = view === "semana" ? 7 * direction : direction;
    const nextDate = addDays(selectedDateObject, amount);
    setSelectedDate(createDateKey(nextDate));
    syncMonthCursorWithDate(nextDate);
  };

  const handleToday = () => {
    const today = new Date();
    setSelectedDate(createDateKey(today));
    syncMonthCursorWithDate(today);
  };

  const handleMoveEventToSlot = async (
    eventId: string,
    targetDateKey: string,
    targetHour?: number,
    targetMinute = 0
  ) => {
    const calendarEvent = events.find((event) => event.id === eventId);
    if (!calendarEvent) return;

    const originalStart = new Date(calendarEvent.starts_at);
    const originalEnd = new Date(calendarEvent.ends_at);
    const durationMs = originalEnd.getTime() - originalStart.getTime();
    const currentDateKey = createDateKey(originalStart);

    if (
      currentDateKey === targetDateKey &&
      (typeof targetHour !== "number" ||
        (originalStart.getHours() === targetHour && originalStart.getMinutes() === targetMinute))
    ) {
      setDraggingEventId(null);
      setDragOverDateKey(null);
      return;
    }

    const nextStart = calendarEvent.all_day
      ? new Date(`${targetDateKey}T00:00:00`)
      : new Date(parseDateKey(targetDateKey));

    if (!calendarEvent.all_day) {
      nextStart.setHours(
        typeof targetHour === "number" ? targetHour : originalStart.getHours(),
        typeof targetHour === "number" ? targetMinute : originalStart.getMinutes(),
        0,
        0
      );
    }

    const nextEnd = new Date(nextStart.getTime() + durationMs);

    setMovingEventId(eventId);
    const { error } = await supabase
      .from("marketing_calendar_events")
      .update({
        starts_at: nextStart.toISOString(),
        ends_at: nextEnd.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", eventId);
    setMovingEventId(null);
    setDraggingEventId(null);
    setDragOverDateKey(null);

    if (error) {
      toast.error("Não foi possível mover o evento.", { description: error.message });
      return;
    }

    setEvents((current) =>
      current.map((event) =>
        event.id === eventId
          ? {
              ...event,
              starts_at: nextStart.toISOString(),
              ends_at: nextEnd.toISOString(),
            }
          : event
      )
    );

    setSelectedDate(targetDateKey);
    syncMonthCursorWithDate(parseDateKey(targetDateKey));

    if (editingId === eventId) {
      setForm((current) => ({
        ...current,
        starts_at: calendarEvent.all_day
          ? targetDateKey
          : toLocalDateTimeInput(new Date(nextStart)),
        ends_at: calendarEvent.all_day
          ? createDateKey(nextEnd)
          : toLocalDateTimeInput(new Date(nextEnd)),
      }));
    }

    toast.success("Evento reagendado.");
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Informe o titulo do evento.");
      return;
    }

    const startsAt = form.all_day
      ? new Date(`${form.starts_at.slice(0, 10)}T00:00:00`)
      : new Date(form.starts_at);
    const endsAt = form.all_day
      ? new Date(`${form.ends_at.slice(0, 10)}T23:59:00`)
      : new Date(form.ends_at);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      toast.error("Revise as datas e horarios do evento.");
      return;
    }

    if (endsAt < startsAt) {
      toast.error("O fim precisa ser posterior ao início.");
      return;
    }

    const selectedProject = projects.find((project) => project.id === form.project_id);
    const resolvedClientId = form.client_id || selectedProject?.client_id || null;

    setSaving(true);

    const payload: Database["public"]["Tables"]["marketing_calendar_events"]["Insert"] = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      event_type: form.event_type,
      channel: form.channel.trim() || null,
      status: form.status,
      all_day: form.all_day,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      client_id: resolvedClientId,
      project_id: form.project_id || null,
      created_by: editingId ? undefined : (user?.id ?? null),
      updated_at: new Date().toISOString(),
    };

    const request = editingId
      ? supabase.from("marketing_calendar_events").update(payload).eq("id", editingId)
      : supabase.from("marketing_calendar_events").insert(payload);

    const { error } = await request;
    setSaving(false);

    if (error) {
      toast.error("Não foi possível salvar o evento.", { description: error.message });
      return;
    }

    const nextDateKey = createDateKey(startsAt);
    setSelectedDate(nextDateKey);
    syncMonthCursorWithDate(startsAt);
    resetForm(nextDateKey, startsAt.getHours(), startsAt.getMinutes());
    setIsEditorOpen(false);
    toast.success(editingId ? "Evento atualizado." : "Evento criado.");
  };

  const handleDelete = async () => {
    if (!editingId) return;
    if (editingId.startsWith("task-")) return;
    if (!canRemoveEvent) {
      toast.error("Seu perfil não pode remover eventos.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("marketing_calendar_events").delete().eq("id", editingId);
    setSaving(false);

    if (error) {
      toast.error("Não foi possível remover o evento.", { description: error.message });
      return;
    }

    toast.success("Evento removido.");
    resetForm(selectedDate);
    setIsEditorOpen(false);
    reloadCurrentRange();
  };

  const handleResizeStart = (event: CalendarEvent, clientY: number) => {
    if (event.all_day) return;

    resizeSessionRef.current = {
      eventId: event.id,
      startClientY: clientY,
      originalStartMs: new Date(event.starts_at).getTime(),
      originalEndMs: new Date(event.ends_at).getTime(),
    };
    setResizingEventId(event.id);
    setResizePreviewEndAt(event.ends_at);
  };

  const handleGoogleAction = () => {
    toast("Google Agenda ainda não está configurada neste workspace.");
  };

  if (loading) return <PortalLoading />;

  if (pageError) {
    return (
      <AdminEmptyState
        icon={Clock}
        title="Não foi possível carregar o calendario"
        description={pageError}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">
            {currentPeriodLabel}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Calendario de marketing</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-border/60 bg-card p-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => handleNavigate(-1)}>
              <ArrowLeft size={16} />
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => handleNavigate(1)}>
              <ArrowRight size={16} />
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={handleToday}>
              Hoje
            </Button>
          </div>

          <div className="inline-flex rounded-lg border border-border/60 bg-card p-1">
            {(
              [
                { key: "dia" as const, label: "Dia" },
                { key: "semana" as const, label: "Semana" },
                { key: "mes" as const, label: "Mes" },
              ] as { key: CalendarView; label: string }[]
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setView(item.key);
                  syncMonthCursorWithDate(selectedDateObject);
                }}
                className={cn(
                  "min-w-fit rounded-md px-3 py-2 text-sm font-medium transition-all",
                  view === item.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Marketing Summary ── */}
      {events.length > 0 &&
        (() => {
          const statusCounts: Record<string, number> = {};
          for (const ev of events) {
            statusCounts[ev.status] = (statusCounts[ev.status] ?? 0) + 1;
          }
          const channelCounts: Record<string, number> = {};
          for (const ev of events) {
            const ch = ev.channel || "Sem canal";
            channelCounts[ch] = (channelCounts[ch] ?? 0) + 1;
          }
          return (
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
              {Object.entries(STATUS_LABEL).map(([key, label]) => (
                <div
                  key={key}
                  className="relative overflow-hidden rounded-xl border border-border/60 bg-background/70 p-2.5 pl-3.5"
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 w-[3px] rounded-l-xl",
                      key === "publicado"
                        ? "bg-success"
                        : key === "agendado"
                          ? "bg-accent"
                          : key === "em_producao"
                            ? "bg-warning"
                            : key === "cancelado"
                              ? "bg-destructive"
                              : "bg-primary"
                    )}
                  />
                  <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {statusCounts[key] ?? 0}
                  </p>
                </div>
              ))}
            </div>
          );
        })()}

      {/* ── Filters ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <select
          value={channelFilter}
          onChange={(event) => setChannelFilter(event.target.value)}
          className={cn(selectClass, "sm:w-48")}
        >
          <option value="all">Todos os canais</option>
          {availableChannels.map((channel) => (
            <option key={channel} value={channel}>
              {channel}
            </option>
          ))}
        </select>

        <select
          value={clientFilter}
          onChange={(event) => setClientFilter(event.target.value)}
          className={cn(selectClass, "sm:w-52")}
        >
          <option value="all">Todos os clientes</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {getEventClientName(client) ?? "Cliente"}
            </option>
          ))}
        </select>

        <Button type="button" size="sm" onClick={() => handleCreateForSlot(selectedDate)}>
          + Novo evento
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowCreateTask(true)}>
          + Nova tarefa
        </Button>
      </div>

      <section className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {periodMetrics.map((metric) => (
          <CompactMetricCard
            key={metric.label}
            label={metric.label}
            value={metric.value}
            badge={metric.badge}
          />
        ))}
      </section>

      <div>
        <div>
          <Card className="rounded-2xl border-border/60 bg-card shadow-card hover:shadow-card">
            <CardContent className="p-4 md:p-5">
              {view === "mes" ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-7 gap-2">
                    {WEEKDAY_LABELS.map((label) => (
                      <div
                        key={label}
                        className="rounded-lg bg-muted/50 px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                      >
                        {label}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {calendarDays.map((day) => {
                      if (!day.isCurrentMonth) {
                        return <div key={day.key} className="min-h-[140px] rounded-xl" />;
                      }

                      const dayEvents = (eventsByDay[day.key] ?? []).sort((left, right) =>
                        left.starts_at.localeCompare(right.starts_at)
                      );
                      const previewEvents = dayEvents.slice(0, 4);
                      const hiddenCount = Math.max(dayEvents.length - previewEvents.length, 0);

                      return (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => setSelectedDate(day.key)}
                          onDoubleClick={(mouseEvent) => {
                            mouseEvent.preventDefault();
                            mouseEvent.stopPropagation();
                            handleCreateForSlot(day.key);
                          }}
                          onDragOver={(dragEvent) => {
                            dragEvent.preventDefault();
                            if (draggingEventId) setDragOverDateKey(day.key);
                          }}
                          onDrop={(dropEvent) => {
                            dropEvent.preventDefault();
                            if (draggingEventId)
                              void handleMoveEventToSlot(draggingEventId, day.key);
                          }}
                          onDragLeave={() => {
                            if (dragOverDateKey === day.key) setDragOverDateKey(null);
                          }}
                          className={cn(
                            "min-h-[140px] rounded-xl border px-3 py-3 text-left transition-all",
                            day.isCurrentMonth
                              ? "border-border/60 bg-background/60"
                              : "border-border/40 bg-background/30 text-muted-foreground",
                            selectedDate === day.key ? "border-primary/45 bg-primary/5" : "",
                            day.isToday ? "shadow-sm" : "",
                            dragOverDateKey === day.key && draggingEventId
                              ? "border-accent/45 bg-accent/5"
                              : "hover:border-primary/25"
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={cn(
                                "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                                day.isToday
                                  ? "bg-primary text-primary-foreground"
                                  : selectedDate === day.key
                                    ? "bg-primary/10 text-primary"
                                    : "bg-transparent text-foreground"
                              )}
                            >
                              {day.date.getDate()}
                            </span>
                            {dayEvents.length > 0 ? (
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                                {dayEvents.length}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-3 space-y-2">
                            {previewEvents.length === 0 ? (
                              <div className="rounded-xl border border-dashed border-border/50 px-3 py-4 text-center text-[11px] text-muted-foreground">
                                Duplo clique para criar.
                              </div>
                            ) : (
                              previewEvents.map((event) => (
                                <MonthEventChip
                                  key={event.id}
                                  event={event}
                                  selected={editingId === event.id}
                                  onSelect={handleSelectEvent}
                                  onHover={setHoveredEventId}
                                  onDragStart={setDraggingEventId}
                                  onDragEnd={() => {
                                    setDraggingEventId(null);
                                    setDragOverDateKey(null);
                                  }}
                                />
                              ))
                            )}

                            {hiddenCount > 0 ? (
                              <p className="px-1 text-[11px] font-medium text-muted-foreground">
                                +{hiddenCount} a mais
                              </p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border/50 bg-background/60">
                  <div
                    style={{
                      paddingRight: timelineScrollbarWidth
                        ? `${timelineScrollbarWidth}px`
                        : undefined,
                    }}
                  >
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `72px repeat(${timelineDays.length}, minmax(0, 1fr))`,
                      }}
                    >
                      <div className="border-b border-r border-border/60 bg-background/70 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Horario
                      </div>

                      {timelineDays.map((day) => (
                        <button
                          key={day.key}
                          type="button"
                          onClick={() => setSelectedDate(day.key)}
                          className={cn(
                            "border-b border-r border-border/60 px-3 py-3 text-left transition-colors last:border-r-0",
                            selectedDate === day.key ? "bg-primary/5" : "bg-background/70"
                          )}
                        >
                          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                            {WEEKDAY_LABELS[day.date.getDay()]}
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <span
                              className={cn(
                                "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold",
                                day.isToday
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-background text-foreground"
                              )}
                            >
                              {day.date.getDate()}
                            </span>
                            <span className="text-sm font-semibold text-foreground">
                              {day.date.toLocaleDateString("pt-BR", { month: "short" })}
                            </span>
                          </div>
                        </button>
                      ))}

                      <div className="border-b border-r border-border/60 bg-background/70 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Dia inteiro
                      </div>

                      {timelineDays.map((day) => {
                        const allDayEvents = (eventsByDay[day.key] ?? []).filter(
                          (event) => event.all_day
                        );

                        return (
                          <div
                            key={`${day.key}-all-day`}
                            onDragOver={(dragEvent) => {
                              dragEvent.preventDefault();
                              if (draggingEventId) setDragOverDateKey(day.key);
                            }}
                            onDrop={(dropEvent) => {
                              dropEvent.preventDefault();
                              if (draggingEventId)
                                void handleMoveEventToSlot(draggingEventId, day.key);
                            }}
                            className={cn(
                              "min-h-[76px] border-b border-r border-border/60 px-2 py-2 last:border-r-0",
                              selectedDate === day.key ? "bg-primary/5" : "bg-background/50",
                              dragOverDateKey === day.key && draggingEventId ? "bg-accent/5" : ""
                            )}
                          >
                            {allDayEvents.length === 0 ? (
                              <button
                                type="button"
                                onDoubleClick={(mouseEvent) => {
                                  mouseEvent.preventDefault();
                                  mouseEvent.stopPropagation();
                                  handleCreateForSlot(day.key, 9, 0, true);
                                }}
                                onClick={() => {
                                  setSelectedDate(day.key);
                                }}
                                className="flex h-full w-full items-center justify-center rounded-xl border border-dashed border-border/50 bg-background/55 px-3 py-3 text-[11px] text-muted-foreground transition-colors hover:border-primary/25 hover:text-foreground"
                              >
                                Criar evento
                              </button>
                            ) : (
                              <div className="space-y-2">
                                {allDayEvents.map((event) => (
                                  <MonthEventChip
                                    key={event.id}
                                    event={event}
                                    selected={editingId === event.id}
                                    onSelect={handleSelectEvent}
                                    onHover={setHoveredEventId}
                                    onDragStart={setDraggingEventId}
                                    onDragEnd={() => {
                                      setDraggingEventId(null);
                                      setDragOverDateKey(null);
                                    }}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div
                    ref={timelineScrollRef}
                    className="max-h-[calc(100vh-24rem)] overflow-x-hidden overflow-y-auto"
                    style={{ scrollbarGutter: "stable" }}
                  >
                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `72px repeat(${timelineDays.length}, minmax(0, 1fr))`,
                      }}
                    >
                      <div className="border-r border-border/60 bg-background/70">
                        {Array.from({
                          length: timelineWindow.endHour - timelineWindow.startHour,
                        }).map((_, index) => {
                          const hour = timelineWindow.startHour + index;
                          return (
                            <div
                              key={hour}
                              className="flex items-start justify-end border-t border-border/50 pr-3 pt-1 first:border-t-0"
                              style={{ height: `${HOUR_HEIGHT}px` }}
                            >
                              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                {formatHourLabel(hour)}
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {timelineDays.map((day) => {
                        const layouts = timelineLayoutsByDay[day.key] ?? [];

                        return (
                          <div
                            key={`${day.key}-timeline`}
                            onDragLeave={() => {
                              if (dragOverDateKey === day.key) setDragOverDateKey(null);
                            }}
                            className={cn(
                              "relative border-r border-border/60 bg-background/30 last:border-r-0",
                              selectedDate === day.key ? "bg-primary/5" : "",
                              dragOverDateKey === day.key && draggingEventId ? "bg-accent/5" : ""
                            )}
                            style={{
                              height: `${timelineHeight}px`,
                            }}
                          >
                            {timelineSlots.map((slot) => (
                              <button
                                key={`${day.key}-${slot.key}`}
                                type="button"
                                onClick={() => setSelectedDate(day.key)}
                                onDoubleClick={(mouseEvent) => {
                                  mouseEvent.preventDefault();
                                  mouseEvent.stopPropagation();
                                  handleCreateForSlot(day.key, slot.hour, slot.minute);
                                }}
                                onDragOver={(dragEvent) => {
                                  dragEvent.preventDefault();
                                  if (draggingEventId) setDragOverDateKey(day.key);
                                }}
                                onDrop={(dropEvent) => {
                                  dropEvent.preventDefault();
                                  if (draggingEventId) {
                                    void handleMoveEventToSlot(
                                      draggingEventId,
                                      day.key,
                                      slot.hour,
                                      slot.minute
                                    );
                                  }
                                }}
                                className="absolute inset-x-0 text-left"
                                style={{
                                  top: `${slot.index * SLOT_HEIGHT}px`,
                                  height: `${SLOT_HEIGHT}px`,
                                }}
                              >
                                <span
                                  className={cn(
                                    "pointer-events-none absolute inset-x-0 top-0 border-t",
                                    slot.minute === 0 ? "border-border/55" : "border-border/30"
                                  )}
                                />
                              </button>
                            ))}

                            {layouts.map((layout) => (
                              <TimelineEventBlock
                                key={layout.event.id}
                                event={layout.event}
                                selected={editingId === layout.event.id}
                                isResizing={resizingEventId === layout.event.id}
                                showDetails={layout.height >= 62}
                                onSelect={handleSelectEvent}
                                onHover={setHoveredEventId}
                                onDragStart={setDraggingEventId}
                                onDragEnd={() => {
                                  setDraggingEventId(null);
                                  setDragOverDateKey(null);
                                }}
                                onResizeStart={handleResizeStart}
                                style={{
                                  top: layout.top + 2,
                                  height: layout.height - 4,
                                  left: `calc(${layout.leftPct}% + 2px)`,
                                  width: `calc(${layout.widthPct}% - 4px)`,
                                }}
                              />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {isEditorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            onClick={closeEditor}
            aria-label="Fechar modal de evento"
          />

          <Card className="relative z-10 w-full max-w-4xl border-border/60 bg-card shadow-2xl hover:shadow-2xl">
            <CardContent className="max-h-[calc(100vh-3rem)] space-y-5 overflow-y-auto p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {editingId ? "Detalhe do evento" : "Novo evento"}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
                    {editingId ? "Editar compromisso" : "Criar compromisso"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{getDateLabel(selectedDate)}</p>
                </div>

                <div className="flex items-center gap-2">
                  {selectedEvent ? <StatusPill status={selectedEvent.status} /> : null}
                  <Button type="button" variant="ghost" size="icon" onClick={closeEditor}>
                    <X size={16} />
                  </Button>
                </div>
              </div>

              {selectedEvent ? (
                <div className="rounded-2xl border border-border/60 bg-background/60 p-3">
                  <p className="text-sm font-semibold text-foreground">{selectedEvent.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {formatEventTime(selectedEvent)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selectedEvent.client_name ? (
                      <ClientPill label={selectedEvent.client_name} />
                    ) : null}
                    {selectedEvent.project_name ? (
                      <ClientPill label={selectedEvent.project_name} />
                    ) : null}
                    {selectedEvent.channel ? <ClientPill label={selectedEvent.channel} /> : null}
                  </div>
                </div>
              ) : null}

              <Field>
                <Label>Titulo</Label>
                <Input
                  ref={titleInputRef}
                  value={form.title}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, title: event.target.value }))
                  }
                  placeholder="Ex: Post institucional da semana"
                />
              </Field>

              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <Label>Tipo</Label>
                  <select
                    value={form.event_type}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, event_type: event.target.value }))
                    }
                    className={selectClass}
                  >
                    {Object.entries(EVENT_TYPE_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field>
                  <Label>Status</Label>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, status: event.target.value }))
                    }
                    className={selectClass}
                  >
                    {Object.entries(STATUS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <Label>Canal</Label>
                  <select
                    value={form.channel}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, channel: event.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="">Sem canal</option>
                    {CHANNEL_OPTIONS.map((channel) => (
                      <option key={channel} value={channel}>
                        {channel}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field>
                  <Label>Modo</Label>
                  <select
                    value={form.all_day ? "all_day" : "timed"}
                    onChange={(event) => {
                      const nextAllDay = event.target.value === "all_day";
                      const currentDateKey = selectedDate;

                      setForm((current) => ({
                        ...current,
                        all_day: nextAllDay,
                        starts_at: nextAllDay
                          ? current.starts_at.slice(0, 10) || currentDateKey
                          : `${current.starts_at.slice(0, 10) || currentDateKey}T09:00`,
                        ends_at: nextAllDay
                          ? current.ends_at.slice(0, 10) || currentDateKey
                          : `${current.ends_at.slice(0, 10) || currentDateKey}T10:00`,
                      }));
                    }}
                    className={selectClass}
                  >
                    <option value="timed">Com horario</option>
                    <option value="all_day">Dia inteiro</option>
                  </select>
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <Label>Inicio</Label>
                  <Input
                    type={form.all_day ? "date" : "datetime-local"}
                    value={form.starts_at}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, starts_at: event.target.value }))
                    }
                  />
                </Field>

                <Field>
                  <Label>Fim</Label>
                  <Input
                    type={form.all_day ? "date" : "datetime-local"}
                    value={form.ends_at}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, ends_at: event.target.value }))
                    }
                  />
                </Field>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Field>
                  <Label>Cliente</Label>
                  <select
                    value={form.client_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        client_id: event.target.value,
                        project_id: "",
                      }))
                    }
                    className={selectClass}
                  >
                    <option value="">Sem cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {getEventClientName(client) ?? "Cliente"}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field>
                  <Label>Projeto</Label>
                  <select
                    value={form.project_id}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, project_id: event.target.value }))
                    }
                    className={selectClass}
                  >
                    <option value="">Sem projeto</option>
                    {filteredProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field>
                <Label>Descrição</Label>
                <Textarea
                  rows={5}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Briefing rapido, CTA, responsavel e observações."
                />
              </Field>

              <div className="flex flex-wrap justify-between gap-2 border-t border-border/60 pt-4">
                <div>
                  {editingId && canRemoveEvent ? (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void handleDelete()}
                      disabled={saving}
                    >
                      Remover
                    </Button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => resetForm(selectedDate)}
                    disabled={saving}
                  >
                    Limpar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={closeEditor}
                    disabled={saving}
                  >
                    Fechar
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void handleSave()}
                    loading={saving}
                    loadingText="Salvando..."
                  >
                    {editingId ? "Salvar alterações" : "Criar evento"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showCreateTask && (
        <CreateTaskModal
          members={taskMembers}
          onClose={() => setShowCreateTask(false)}
          onCreated={() => {
            setShowCreateTask(false);
            setReloadToken((n) => n + 1);
          }}
        />
      )}

      {openTask && (
        <TaskDetailModal
          task={openTask}
          members={taskMembers}
          memberMap={taskMemberMap}
          onClose={() => setOpenTask(null)}
          onUpdated={() => {
            setOpenTask(null);
            setReloadToken((n) => n + 1);
          }}
          onDeleted={() => {
            setOpenTask(null);
            setReloadToken((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
