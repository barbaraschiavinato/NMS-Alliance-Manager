"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { CompactViewIcon, ExtendedViewIcon } from "@/components/shared/icons";
import { EventCard } from "@/components/cards/event-card";
import { EventDayList } from "@/components/sections/event-day-list";
import { EventDetailBlocks } from "@/components/sections/event-detail-blocks";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { Hero, HeroAddButton } from "@/components/layout/hero";
import { Tabs } from "@/components/layout/tabs";
import { AdminPanel } from "@/components/modals/admin-panel";
import { MemberProfilePanel } from "@/components/modals/member-profile-panel";
import { EventForm, type EventFormValues } from "@/components/modals/event-form";
import { DetailBackLink, useDetailReturn } from "@/components/shared/detail-page";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { Toast } from "@/components/shared/toast";
import { useLocale } from "@/components/providers/locale-provider";
import { eventsForTab, eventTypes, isPastEvent, type EventTab, type ParticipationStatus } from "@/lib/events/events";
import type { EventView } from "@/lib/events/event-views";
import type { AllianceMember, AllianceSettings } from "@/lib/members/member-types";
import type { TaxiStationOption } from "@/lib/messages/private-messages-store";
import { dispatchAppEvent } from "@/lib/navigation/app-events";
import { detailOrigins, eventDetailHref, type DetailOrigin } from "@/lib/navigation/detail-links";
import { listPageSize } from "@/lib/navigation/pagination";

export type EventDetail = Readonly<{ id: string; origin: DetailOrigin }>;
type ViewMode = "compact" | "extended";
type ToastState = Readonly<{ message: string; tone: "success" | "error" }>;

const viewModeKey = "nms-events-view";
const viewModeListeners = new Set<() => void>();
// Kept here as well, so the switch still works when storage is unavailable.
let chosenViewMode: ViewMode | null = null;

function subscribeViewMode(listener: () => void) {
  viewModeListeners.add(listener);
  return () => {
    viewModeListeners.delete(listener);
  };
}

function readViewMode(): ViewMode {
  if (chosenViewMode) return chosenViewMode;
  try {
    return window.localStorage.getItem(viewModeKey) === "extended" ? "extended" : "compact";
  } catch {
    return "compact";
  }
}

function storeViewMode(mode: ViewMode) {
  chosenViewMode = mode;
  try {
    window.localStorage.setItem(viewModeKey, mode);
  } catch {
    // The preference is a convenience only.
  }
  for (const listener of viewModeListeners) listener();
}

async function eventRequest(
  url: string,
  method: string,
  init: RequestInit = {},
): Promise<{ events: EventView[]; id?: string }> {
  const response = await fetch(url, { method, cache: "no-store", ...init });
  const payload = (await response.json().catch(() => ({}))) as { events?: EventView[]; id?: string; error?: string };
  if (!response.ok || !Array.isArray(payload.events)) throw new Error(payload.error ?? "errors.request_failed");
  return { events: payload.events, id: payload.id };
}

function jsonBody(body: unknown): RequestInit {
  return { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

export function EventsPage({
  currentMember,
  alliance,
  stations,
  missionCount,
  stationCount,
  userCount,
  offlineCount,
  detail,
}: Readonly<{
  currentMember: AllianceMember;
  alliance: AllianceSettings;
  stations: readonly TaxiStationOption[];
  missionCount: number;
  stationCount: number;
  userCount?: number;
  offlineCount?: number;
  detail?: EventDetail;
}>) {
  const router = useRouter();
  const returnDestination = useDetailReturn(detailOrigins[detail?.origin ?? "events"].href);
  const detailId = detail?.id;
  const { t } = useLocale();
  const [member, setMember] = useState(currentMember);
  const [settings, setSettings] = useState(alliance);
  const [adminOpen, setAdminOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [events, setEvents] = useState<EventView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<EventTab>("upcoming");
  const [typeFilter, setTypeFilter] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dialog, setDialog] = useState<{ event: EventView | null; source: EventView | null } | null>(null);
  const viewMode = useSyncExternalStore<ViewMode>(subscribeViewMode, readViewMode, () => "compact");
  const isStaff = member.role === "admin" || member.role === "moderator";
  const dismissToast = useCallback(() => setToast(null), []);
  const showError = useCallback((error: unknown, fallback: string) => {
    setToast({ message: error instanceof Error ? error.message : fallback, tone: "error" });
  }, []);
  const listUrl = detailId ? `/api/events?${new URLSearchParams({ detailEvent: detailId })}` : "/api/events";

  useEffect(() => {
    let active = true;
    eventRequest(listUrl, "GET")
      .then((result) => {
        if (active) setEvents(result.events);
      })
      .catch((error: unknown) => {
        if (active) showError(error, "events.error_unable_to_read");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listUrl, showError]);

  // Events move to "Past" while the page stays open.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filtered = useMemo(
    () => events.filter((event) => !typeFilter || event.type === typeFilter),
    [events, typeFilter],
  );
  const upcoming = useMemo(() => eventsForTab(filtered, "upcoming", now), [filtered, now]);
  const past = useMemo(() => eventsForTab(filtered, "past", now), [filtered, now]);
  const visible = tab === "upcoming" ? upcoming : past;
  const pagination = usePagination(visible, listPageSize, JSON.stringify([tab, typeFilter]));
  const selected = detail ? events.find((event) => event.id === detail.id) : undefined;

  async function save(values: EventFormValues) {
    const editing = dialog?.event ?? null;
    const { image, removeImage, ...fields } = values;
    const form = new FormData();
    form.set(
      "payload",
      JSON.stringify({ ...(editing ? { id: editing.id } : {}), ...fields, ...(removeImage ? { removeImage } : {}) }),
    );
    if (image) form.set("image", image);
    const saved = await eventRequest("/api/events", editing ? "PATCH" : "POST", { body: form });
    // Saving answers with every event: the detail page picks its own by ID.
    setEvents(saved.events);
    setDialog(null);
    setToast({ message: editing ? "events.event_updated" : "events.event_added", tone: "success" });
    // A duplicate made from a detail page opens the new event.
    if (detail && !editing && saved.id) router.push(eventDetailHref(saved.id));
    dispatchAppEvent("events-changed");
  }

  async function remove(event: EventView) {
    if (!window.confirm(t("events.delete_confirm", { event: event.title }))) return;
    try {
      setEvents((await eventRequest("/api/events", "DELETE", jsonBody({ id: event.id }))).events);
      dispatchAppEvent("events-changed");
      if (detail?.id === event.id) {
        router.replace(returnDestination);
        return;
      }
      setToast({ message: "events.event_deleted", tone: "success" });
    } catch (error) {
      showError(error, "events.error_unable_to_remove");
    }
  }

  async function change(url: string, method: string, body: unknown): Promise<boolean> {
    setBusy(true);
    try {
      setEvents((await eventRequest(url, method, jsonBody(body))).events);
      return true;
    } catch (error) {
      showError(error, "events.error_unable_to_save");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const cardActions = {
    onEdit: (event: EventView) => setDialog({ event, source: null }),
    onDuplicate: (event: EventView) => setDialog({ event: null, source: event }),
    onRemove: (event: EventView) => void remove(event),
  };

  return (
    <div className={`app-shell${member.pulseEffectsEnabled === false ? " pulse-effects-disabled" : ""}`}>
      <Sidebar
        activeSection="eventi"
        currentMember={member}
        missionCount={missionCount}
        settings={settings}
        stationCount={stationCount}
        offlineCount={offlineCount}
        userCount={userCount}
      />
      <section className="main-panel">
        <Header
          currentMember={member}
          onAdminOpen={() => setAdminOpen(true)}
          onProfileOpen={() => setProfileOpen(true)}
          onProfileSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
          sectionTitle="events.title"
          settings={settings}
        />
        {!detail && (
          <Hero settings={settings} subtitle={t("events.page_description")} title="events.title">
            <HeroAddButton label="events.add_event" onClick={() => setDialog({ event: null, source: null })} />
          </Hero>
        )}
        <main className="content-wrap events-page">
          {detail ? (
            <>
              <DetailBackLink {...detailOrigins[detail.origin]} />
              {loading ? (
                <LoadingSpinner />
              ) : selected ? (
                <>
                  <ul className="event-list event-detail-list">
                    <EventCard currentMemberId={member.publicId} event={selected} full now={now} {...cardActions} />
                  </ul>
                  <EventDetailBlocks
                    busy={busy}
                    currentMemberId={member.publicId}
                    event={selected}
                    isStaff={isStaff}
                    key={selected.id}
                    onDeleteMessage={(messageId) => {
                      if (window.confirm(t("events.delete_message_confirm"))) {
                        void change("/api/events/messages", "DELETE", { eventId: selected.id, messageId });
                      }
                    }}
                    onParticipation={(status: ParticipationStatus | null, memberId?: string) =>
                      void change("/api/events/participation", "PUT", {
                        eventId: selected.id,
                        status,
                        ...(memberId ? { memberId } : {}),
                      })
                    }
                    onSendMessage={(message, replyToId) =>
                      change("/api/events/messages", "POST", {
                        eventId: selected.id,
                        message,
                        ...(replyToId ? { replyToId } : {}),
                      })
                    }
                    past={isPastEvent(selected, now)}
                  />
                </>
              ) : (
                <p className="form-error">{t("events.error_unable_to_read")}</p>
              )}
            </>
          ) : (
            <section aria-label={t("events.title")} className="station-list-section">
              <div className="toolbar members-toolbar station-toolbar sticky-list-controls">
                <Tabs
                  className="member-filter-tabs"
                  items={[
                    {
                      key: "upcoming",
                      label: t("events.upcoming"),
                      count: upcoming.length,
                      selected: tab === "upcoming",
                      onSelect: () => setTab("upcoming"),
                    },
                    {
                      key: "past",
                      label: t("events.past"),
                      count: past.length,
                      selected: tab === "past",
                      onSelect: () => setTab("past"),
                    },
                  ]}
                  label={t("events.filter_events")}
                />
                <div className="toolbar-actions station-toolbar-actions event-toolbar-actions">
                  <select
                    aria-label={t("events.type")}
                    className="event-type-filter"
                    onChange={(event) => setTypeFilter(event.target.value)}
                    value={typeFilter}
                  >
                    <option value="">{t("events.all_types")}</option>
                    {eventTypes.map((type) => (
                      <option key={type} value={type}>
                        {t(`events.type_${type}`)}
                      </option>
                    ))}
                  </select>
                  <div aria-label={t("events.view")} className="event-view-switch" role="group">
                    {(["compact", "extended"] as const).map((mode) => (
                      <button
                        aria-label={t(`events.view_${mode}`)}
                        aria-pressed={viewMode === mode}
                        key={mode}
                        onClick={() => storeViewMode(mode)}
                        title={t(`events.view_${mode}`)}
                        type="button"
                      >
                        {mode === "compact" ? <CompactViewIcon size={15} /> : <ExtendedViewIcon size={15} />}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {loading ? (
                <div className="station-list-empty station-list-loading">
                  <LoadingSpinner />
                </div>
              ) : visible.length === 0 ? (
                <p className="station-list-empty">{t(tab === "upcoming" ? "events.no_upcoming" : "events.no_past")}</p>
              ) : viewMode === "compact" ? (
                <EventDayList events={pagination.items} now={now} />
              ) : (
                <ul className="event-list">
                  {pagination.items.map((event) => (
                    <EventCard
                      currentMemberId={member.publicId}
                      event={event}
                      key={event.id}
                      now={now}
                      {...cardActions}
                    />
                  ))}
                </ul>
              )}
              <Pagination {...pagination} />
            </section>
          )}
        </main>
      </section>
      {dialog && (
        <EventForm
          alliance={settings}
          event={dialog.event}
          onClose={() => setDialog(null)}
          onSave={save}
          source={dialog.source}
          stations={stations}
        />
      )}
      {toast && (
        <Toast
          autoCloseMs={toast.tone === "success" ? 5000 : undefined}
          message={toast.message}
          onClose={dismissToast}
          tone={toast.tone}
        />
      )}
      {adminOpen && member.role === "admin" && <AdminPanel onClose={() => setAdminOpen(false)} onSaved={setSettings} />}
      {profileOpen && (
        <MemberProfilePanel
          member={member}
          onClose={() => setProfileOpen(false)}
          onSaved={(profile) => setMember((current) => ({ ...current, ...profile }))}
        />
      )}
    </div>
  );
}
