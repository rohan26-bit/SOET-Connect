import { useState } from "react";
import {
  CalendarDays,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  Eye,
} from "lucide-react";

import { initialEvents } from "../data/mockData";
import EventForm from "../components/EventForm";

function Events() {
  const [events, setEvents] = useState(initialEvents);
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);

  const handleCreate = () => {
    setEditingEvent(null);
    setShowForm(true);
    setSelectedEvent(null);
  };

  const handleEdit = (event) => {
    setEditingEvent(event);
    setShowForm(true);
    setSelectedEvent(null);
  };

  const handleSave = (formData) => {
    if (editingEvent) {
      setEvents((previous) =>
        previous.map((event) =>
          event.id === editingEvent.id
            ? { ...formData, id: editingEvent.id }
            : event
        )
      );
    } else {
      const newEvent = {
        ...formData,
        id: Date.now(),
      };

      setEvents((previous) => [newEvent, ...previous]);
    }

    setShowForm(false);
    setEditingEvent(null);
  };

  const handleDelete = (id) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this event?"
    );

    if (!confirmed) {
      return;
    }

    setEvents((previous) =>
      previous.filter((event) => event.id !== id)
    );

    if (selectedEvent?.id === id) {
      setSelectedEvent(null);
    }
  };

  const handleView = (event) => {
    setSelectedEvent(event);
    setShowForm(false);
  };

  return (
    <div className="events-page">
      <div className="page-heading events-heading">
        <div>
          <h2>Event Management</h2>
          <p>
            Create, manage, and monitor SOET Connect events.
          </p>
        </div>

        <button className="button primary" onClick={handleCreate}>
          <Plus size={18} />
          Create Event
        </button>
      </div>

      {showForm && (
        <EventForm
          event={editingEvent}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingEvent(null);
          }}
        />
      )}

      {selectedEvent && !showForm && (
        <div className="event-details-panel">
          <div className="details-header">
            <div>
              <p className="details-label">Event Details</p>
              <h3>{selectedEvent.title}</h3>
            </div>

            <button
              className="close-button"
              onClick={() => setSelectedEvent(null)}
            >
              ×
            </button>
          </div>

          <p className="event-description">
            {selectedEvent.description}
          </p>

          <div className="details-grid">
            <div>
              <span>Event Type</span>
              <strong>{selectedEvent.eventType}</strong>
            </div>

            <div>
              <span>Organizer</span>
              <strong>{selectedEvent.organizer}</strong>
            </div>

            <div>
              <span>Date</span>
              <strong>{selectedEvent.date}</strong>
            </div>

            <div>
              <span>Time</span>
              <strong>{selectedEvent.time}</strong>
            </div>

            <div>
              <span>Location</span>
              <strong>{selectedEvent.location}</strong>
            </div>

            <div>
              <span>Visibility</span>
              <strong>{selectedEvent.visibility}</strong>
            </div>

            <div>
              <span>Registration Deadline</span>
              <strong>{selectedEvent.registrationDeadline}</strong>
            </div>
          </div>
        </div>
      )}

      <div className="events-summary">
        <span>{events.length} events</span>
      </div>

      <div className="events-list">
        {events.length === 0 ? (
          <div className="empty-state">
            <CalendarDays size={40} />
            <h3>No events found</h3>
            <p>Create your first event to get started.</p>
          </div>
        ) : (
          events.map((event) => (
            <div className="event-card" key={event.id}>
              <div className="event-card-content">
                <div className="event-card-top">
                  <div>
                    <span className="event-type">
                      {event.eventType}
                    </span>
                    <h3>{event.title}</h3>
                  </div>

                  <span className="visibility-badge">
                    {event.visibility}
                  </span>
                </div>

                <p>{event.description}</p>

                <div className="event-meta">
                  <span>
                    <CalendarDays size={15} />
                    {event.date}
                  </span>

                  <span>
                    <Clock size={15} />
                    {event.time}
                  </span>

                  <span>
                    <MapPin size={15} />
                    {event.location}
                  </span>
                </div>
              </div>

              <div className="event-actions">
                <button
                  className="icon-button"
                  title="View"
                  onClick={() => handleView(event)}
                >
                  <Eye size={17} />
                </button>

                <button
                  className="icon-button"
                  title="Edit"
                  onClick={() => handleEdit(event)}
                >
                  <Pencil size={17} />
                </button>

                <button
                  className="icon-button delete"
                  title="Delete"
                  onClick={() => handleDelete(event.id)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Events;