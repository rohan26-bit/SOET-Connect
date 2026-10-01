import { useState, useMemo } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Eye,
  Search,
  Filter,
  RotateCcw,
  Info,
  AlertCircle,
  Building2,
  Users,
  Sparkles,
  History,
  X,
  CalendarCheck,
} from "lucide-react";

import { initialEvents } from "../data/mockData";
import EventForm from "../components/EventForm";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";

// Helper to determine if an event is upcoming or past relative to current date
function isEventUpcoming(dateString) {
  if (!dateString) return true;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDate = new Date(dateString + "T23:59:59");
  return eventDate >= today;
}

// Format date for the event date badge
function parseDateParts(dateString) {
  if (!dateString) return { day: "—", month: "—" };
  const d = new Date(dateString + "T00:00:00");
  const day = d.getDate() || "—";
  const month = d.toLocaleString("default", { month: "short" }).toUpperCase() || "—";
  return { day, month };
}

function Events() {
  // Local demo state — preserves local CRUD behavior without fabricating backend persistence
  const [events, setEvents] = useState(initialEvents);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedTimeframe, setSelectedTimeframe] = useState("all");

  // Modal states
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [deletingEvent, setDeletingEvent] = useState(null);
  const [localFeedback, setLocalFeedback] = useState(null);

  // Extract distinct event categories for filter dropdown
  const categories = useMemo(() => {
    const set = new Set(events.map((e) => e.eventType).filter(Boolean));
    return Array.from(set).sort();
  }, [events]);

  // Client-side search and filtering
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Timeframe filter (Upcoming vs Past)
      const upcoming = isEventUpcoming(event.date);
      if (selectedTimeframe === "upcoming" && !upcoming) {
        return false;
      }
      if (selectedTimeframe === "past" && upcoming) {
        return false;
      }

      // Category filter
      if (selectedCategory !== "all" && event.eventType !== selectedCategory) {
        return false;
      }

      // Search query across title, category, location, organizer, description, visibility
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase().trim();
        const matchTitle = event.title?.toLowerCase().includes(query);
        const matchCategory = event.eventType?.toLowerCase().includes(query);
        const matchLocation = event.location?.toLowerCase().includes(query);
        const matchOrganizer = event.organizer?.toLowerCase().includes(query);
        const matchDesc = event.description?.toLowerCase().includes(query);
        const matchVis = event.visibility?.toLowerCase().includes(query);

        if (!matchTitle && !matchCategory && !matchLocation && !matchOrganizer && !matchDesc && !matchVis) {
          return false;
        }
      }

      return true;
    });
  }, [events, searchQuery, selectedCategory, selectedTimeframe]);

  // Counts for catalog overview pills
  const totalCount = events.length;
  const upcomingCount = events.filter((e) => isEventUpcoming(e.date)).length;
  const pastCount = totalCount - upcomingCount;

  const isFiltered =
    searchQuery.trim() !== "" ||
    selectedCategory !== "all" ||
    selectedTimeframe !== "all";

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedTimeframe("all");
  };

  // Local CRUD actions
  const handleOpenCreate = () => {
    setEditingEvent(null);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (event) => {
    setEditingEvent(event);
    setShowCreateModal(true);
  };

  const handleSaveEvent = (formData) => {
    if (editingEvent) {
      setEvents((prev) =>
        prev.map((e) => (e.id === editingEvent.id ? { ...formData, id: editingEvent.id } : e))
      );
      setLocalFeedback("Event updated in local demo view.");
    } else {
      const newEvent = {
        ...formData,
        id: Date.now(),
      };
      setEvents((prev) => [newEvent, ...prev]);
      setLocalFeedback("New event created in local demo view.");
    }

    setShowCreateModal(false);
    setEditingEvent(null);
    setTimeout(() => setLocalFeedback(null), 4000);
  };

  const handleConfirmDelete = () => {
    if (!deletingEvent) return;

    setEvents((prev) => prev.filter((e) => e.id !== deletingEvent.id));
    if (selectedEvent?.id === deletingEvent.id) {
      setSelectedEvent(null);
    }
    setLocalFeedback(`Event "${deletingEvent.title}" removed from local view.`);
    setDeletingEvent(null);
    setTimeout(() => setLocalFeedback(null), 4000);
  };

  return (
    <div className="events-page">
      {/* Page Header & Intro Section */}
      <section className="events-header-section" aria-label="Events Overview">
        <div className="events-intro">
          <div className="events-badge">
            <Sparkles size={14} aria-hidden="true" />
            <span>Programs & Activities Hub</span>
          </div>
          <h2>Campus & Alumni Events</h2>
          <p>
            Browse academic conferences, alumni networking meets, career workshops, and technical talks organized for SOET students and graduates.
          </p>
        </div>

        {/* Demo Mode Notice Banner */}
        <div className="demo-notice-pill" role="status">
          <Info size={16} aria-hidden="true" />
          <span>Demo Data Mode — Local event catalog. Backend registration & CRUD APIs in progress</span>
        </div>
      </section>

      {/* Catalog Overview Stat Pills */}
      <section className="events-stats-bar" aria-label="Catalog Overview">
        <div className="stat-pill stat-pill-primary">
          <CalendarDays size={16} aria-hidden="true" />
          <span><strong>{totalCount}</strong> Total Events</span>
        </div>
        <div className="stat-pill stat-pill-intern">
          <span className="pill-dot pill-dot-intern" aria-hidden="true"></span>
          <span><strong>{upcomingCount}</strong> Upcoming</span>
        </div>
        <div className="stat-pill stat-pill-fulltime">
          <History size={15} aria-hidden="true" />
          <span><strong>{pastCount}</strong> Past Sessions</span>
        </div>

        <Button
          variant="primary"
          size="sm"
          icon={Plus}
          onClick={handleOpenCreate}
          className="create-event-top-btn"
          aria-label="Create a new event in local demo mode"
        >
          Create Event
        </Button>
      </section>

      {/* Local Action Feedback Notification */}
      {localFeedback && (
        <div className="local-feedback-banner" role="status" aria-live="polite">
          <Info size={16} aria-hidden="true" />
          <span>{localFeedback} (Demo mode — changes are client-side only)</span>
          <button
            type="button"
            className="feedback-dismiss-btn"
            onClick={() => setLocalFeedback(null)}
            aria-label="Dismiss message"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Search & Filter Controls */}
      <Card
        className="events-controls-card"
        title="Search & Filter Events"
        subtitle="Search locally by title, topic, speaker, organizer, or location"
      >
        <div className="events-filter-grid">
          {/* Accessible Search Input */}
          <div className="filter-group search-group">
            <label htmlFor="event-search" className="filter-label">
              Search Events
            </label>
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" aria-hidden="true" />
              <input
                id="event-search"
                type="search"
                className="filter-input search-input"
                placeholder="Search by title, category, location, or organizer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search events by title, category, location, or organizer"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search input"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Timeframe Filter (Upcoming / Past) */}
          <div className="filter-group">
            <label htmlFor="event-timeframe-filter" className="filter-label">
              Schedule / Timeframe
            </label>
            <div className="select-wrapper">
              <select
                id="event-timeframe-filter"
                className="filter-select"
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                aria-label="Filter events by timeframe"
              >
                <option value="all">All Events ({totalCount})</option>
                <option value="upcoming">Upcoming Only ({upcomingCount})</option>
                <option value="past">Past Events ({pastCount})</option>
              </select>
            </div>
          </div>

          {/* Category Filter */}
          <div className="filter-group">
            <label htmlFor="event-category-filter" className="filter-label">
              Event Category
            </label>
            <div className="select-wrapper">
              <select
                id="event-category-filter"
                className="filter-select"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                aria-label="Filter by event category"
              >
                <option value="all">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Active Filters Summary & Reset */}
        <div className="filter-actions-bar">
          <div className="filter-results-count">
            <Filter size={14} aria-hidden="true" />
            <span>
              Showing <strong>{filteredEvents.length}</strong> of{" "}
              <strong>{totalCount}</strong> events
            </span>
            {isFiltered && <span className="filtered-indicator">(Filtered)</span>}
          </div>

          {isFiltered && (
            <Button
              variant="outline"
              size="sm"
              icon={RotateCcw}
              onClick={handleResetFilters}
              aria-label="Reset all search queries and filters"
              className="reset-filters-btn"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Events Listing Section */}
      <section className="events-listings-section" aria-label="Available Events">
        {filteredEvents.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={
              isFiltered
                ? "No matching events found"
                : "No events in catalog"
            }
            description={
              isFiltered
                ? `No events match your current filters${
                    searchQuery ? ` for "${searchQuery}"` : ""
                  }. Try adjusting your keywords or clearing the category and schedule filters.`
                : "There are currently no events in the catalog. You can create a new event locally to test the layout."
            }
            action={
              isFiltered ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={RotateCcw}
                  onClick={handleResetFilters}
                >
                  Clear All Filters
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  onClick={handleOpenCreate}
                >
                  Create First Event
                </Button>
              )
            }
          />
        ) : (
          <div className="events-list-container">
            {filteredEvents.map((event) => {
              const { day, month } = parseDateParts(event.date);
              const upcoming = isEventUpcoming(event.date);

              return (
                <article key={event.id} className="event-item-card">
                  {/* Left: Date Badge */}
                  <div className="event-date-badge-box" aria-hidden="true">
                    <span className="event-day-val">{day}</span>
                    <span className="event-month-val">{month}</span>
                  </div>

                  {/* Middle: Content & Meta */}
                  <div className="event-card-main">
                    <div className="event-card-header-row">
                      <div className="event-title-cluster">
                        <h3 className="event-title-text">{event.title}</h3>
                        <div className="event-badge-group">
                          <span className="badge-tag">{event.eventType}</span>
                          <span
                            className={`event-timing-pill ${
                              upcoming ? "timing-upcoming" : "timing-past"
                            }`}
                          >
                            {upcoming ? "Upcoming" : "Past Event"}
                          </span>
                          {event.visibility && (
                            <span className="event-visibility-pill">
                              <Users size={11} aria-hidden="true" />
                              {event.visibility}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {event.description && (
                      <p className="event-desc-text">{event.description}</p>
                    )}

                    <div className="event-details-meta-row">
                      <span>
                        <Clock size={13} aria-hidden="true" />
                        {event.time}
                      </span>
                      <span>
                        <MapPin size={13} aria-hidden="true" />
                        {event.location}
                      </span>
                      <span>
                        <Building2 size={13} aria-hidden="true" />
                        {event.organizer}
                      </span>
                      {event.registrationDeadline && (
                        <span className="event-deadline-meta">
                          <CalendarDays size={13} aria-hidden="true" />
                          Deadline: {event.registrationDeadline}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="event-card-actions-col">
                    <div className="event-primary-actions">
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Eye}
                        onClick={() => setSelectedEvent(event)}
                        aria-label={`View full details for ${event.title}`}
                      >
                        Details
                      </Button>

                      <Button
                        variant={upcoming ? "primary" : "secondary"}
                        size="sm"
                        icon={CalendarCheck}
                        onClick={() => setSelectedEvent(event)}
                        aria-label={`Register for ${event.title}`}
                      >
                        {upcoming ? "Register" : "View"}
                      </Button>
                    </div>

                    {/* Admin Local CRUD Actions */}
                    <div className="event-admin-actions" aria-label="Event local management">
                      <button
                        type="button"
                        className="event-icon-btn"
                        onClick={() => handleOpenEdit(event)}
                        aria-label={`Edit ${event.title}`}
                        title="Edit event (Local Demo)"
                      >
                        <Pencil size={15} aria-hidden="true" />
                      </button>

                      <button
                        type="button"
                        className="event-icon-btn delete"
                        onClick={() => setDeletingEvent(event)}
                        aria-label={`Delete ${event.title}`}
                        title="Delete event (Local Demo)"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Event Details & Registration Notice Modal */}
      <Modal
        isOpen={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        title="Event Details"
        size="lg"
        footer={
          <div className="event-modal-actions">
            <Button
              variant="secondary"
              onClick={() => setSelectedEvent(null)}
            >
              Close
            </Button>
            <Button
              variant="primary"
              disabled
              aria-disabled="true"
              title="Event registration endpoints are currently in development"
            >
              Register (Awaiting Backend)
            </Button>
          </div>
        }
      >
        {selectedEvent && (
          <div className="event-modal-content">
            <header className="event-modal-header">
              <div className="event-modal-date-box" aria-hidden="true">
                <span className="modal-date-day">
                  {parseDateParts(selectedEvent.date).day}
                </span>
                <span className="modal-date-month">
                  {parseDateParts(selectedEvent.date).month}
                </span>
              </div>
              <div className="event-modal-title-wrap">
                <h3>{selectedEvent.title}</h3>
                <p className="event-modal-organizer">
                  Organized by <strong>{selectedEvent.organizer}</strong>
                </p>
                <div className="event-modal-badges">
                  <span className="badge-tag">{selectedEvent.eventType}</span>
                  <span
                    className={`event-timing-pill ${
                      isEventUpcoming(selectedEvent.date)
                        ? "timing-upcoming"
                        : "timing-past"
                    }`}
                  >
                    {isEventUpcoming(selectedEvent.date)
                      ? "Upcoming Event"
                      : "Past Event"}
                  </span>
                  <span className="event-visibility-pill">
                    <Users size={12} aria-hidden="true" />
                    {selectedEvent.visibility}
                  </span>
                </div>
              </div>
            </header>

            {/* Key Event Metadata Grid */}
            <div className="event-details-grid">
              <div className="detail-field">
                <span className="detail-label">
                  <CalendarDays size={14} aria-hidden="true" /> Date
                </span>
                <strong className="detail-value">{selectedEvent.date}</strong>
              </div>

              <div className="detail-field">
                <span className="detail-label">
                  <Clock size={14} aria-hidden="true" /> Time
                </span>
                <strong className="detail-value">{selectedEvent.time}</strong>
              </div>

              <div className="detail-field">
                <span className="detail-label">
                  <MapPin size={14} aria-hidden="true" /> Location
                </span>
                <strong className="detail-value">{selectedEvent.location}</strong>
              </div>

              <div className="detail-field">
                <span className="detail-label">
                  <CalendarDays size={14} aria-hidden="true" /> Registration Deadline
                </span>
                <strong className="detail-value highlight-deadline">
                  {selectedEvent.registrationDeadline || "Open until event"}
                </strong>
              </div>
            </div>

            {/* Full Description */}
            <div className="event-modal-description">
              <h4>Event Overview & Description</h4>
              <p className="modal-description-text">
                {selectedEvent.description}
              </p>
            </div>

            {/* Honest Backend Registration Callout */}
            <div className="backend-readiness-callout" role="note">
              <AlertCircle size={20} className="callout-icon" aria-hidden="true" />
              <div className="callout-body">
                <strong>Event Registration Service Notice (Demo Mode):</strong>
                <p>
                  Direct event registration, ticketing, and participant capacity management are currently in development by the backend engineering team.
                </p>
                <p className="callout-subtext">
                  Registration will be enabled once the backend event-registration service is deployed. No registration request was sent and no ticket was fabricated.
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Accessible Event Create / Edit Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingEvent(null);
        }}
        title={editingEvent ? "Edit Event" : "Create New Event"}
        size="lg"
      >
        <EventForm
          event={editingEvent}
          onSave={handleSaveEvent}
          onCancel={() => {
            setShowCreateModal(false);
            setEditingEvent(null);
          }}
        />
      </Modal>

      {/* Accessible Event Delete Confirmation Modal */}
      <Modal
        isOpen={deletingEvent !== null}
        onClose={() => setDeletingEvent(null)}
        title="Confirm Event Deletion"
        size="sm"
        footer={
          <div className="delete-modal-actions">
            <Button
              variant="secondary"
              onClick={() => setDeletingEvent(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={handleConfirmDelete}
            >
              Delete Event
            </Button>
          </div>
        }
      >
        {deletingEvent && (
          <div className="delete-modal-body">
            <p>
              Are you sure you want to delete{" "}
              <strong>"{deletingEvent.title}"</strong>?
            </p>
            <p className="delete-modal-subtext">
              This action will remove the event from your local demo catalog view. This will not affect backend databases as event endpoints are not yet connected.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Events;