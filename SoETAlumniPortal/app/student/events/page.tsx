'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/components/AuthProvider';
import { eventService, EventItem, EventAttendeeItem } from '@/lib/services/eventService';
import { Calendar, MapPin, Clock, Plus, Users, CheckCircle2, AlertCircle, X } from 'lucide-react';

export default function EventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Create Event Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({
    title: '',
    description: '',
    event_date: '',
    start_time: '',
    end_time: '',
    location: '',
  });

  // Attendees Modal
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [attendees, setAttendees] = useState<EventAttendeeItem[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await eventService.getApprovedEvents(user?.id);
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [user]);

  const handleRegister = async (eventId: string) => {
    if (!user) return;
    setActionLoading(eventId);
    try {
      await eventService.registerForEvent(eventId, user.id);
      loadEvents();
    } catch (err: any) {
      alert(err.message || 'Registration failed.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelRegistration = async (eventId: string) => {
    if (!user) return;
    setActionLoading(eventId);
    try {
      await eventService.cancelRegistration(eventId, user.id);
      loadEvents();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel registration.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCreating(true);
    setCreateError(null);

    try {
      await eventService.createEvent({
        created_by: user.id,
        title: newEvent.title,
        description: newEvent.description,
        event_date: newEvent.event_date,
        start_time: newEvent.start_time || undefined,
        end_time: newEvent.end_time || undefined,
        location: newEvent.location,
      });

      setShowCreateModal(false);
      setNewEvent({
        title: '',
        description: '',
        event_date: '',
        start_time: '',
        end_time: '',
        location: '',
      });
      alert('Event submitted! It will be listed once reviewed by the administrator.');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create event.');
    } finally {
      setCreating(false);
    }
  };

  const viewAttendees = async (eventId: string) => {
    setSelectedEventId(eventId);
    setLoadingAttendees(true);
    try {
      const list = await eventService.getEventAttendees(eventId);
      setAttendees(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAttendees(false);
    }
  };

  const isAlumniOrAdmin = user?.role === 'alumni' || user?.role === 'admin';

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Campus & Network</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Events & Meetups</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">University & Alumni Events</h1>
          <p className="text-xs text-slate-500 mt-1">
            Join tech talks, annual alumni reunions, and career workshops.
          </p>
        </div>

        {isAlumniOrAdmin && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/25 transition cursor-pointer self-start md:self-auto"
          >
            <Plus className="w-4 h-4" /> Create New Event
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading events from database...</div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Upcoming Events</h3>
          <p className="text-xs text-slate-500 mt-1">Check back soon for new workshops and meetups.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl w-fit mb-4">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(event.event_date).toLocaleDateString()} {event.start_time ? `• ${event.start_time}` : ''}</span>
                </div>

                <h3 className="text-base font-bold text-slate-900 leading-snug mb-2">{event.title}</h3>
                <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-3">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{event.location}</span>
                </p>

                <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed mb-4">
                  {event.description}
                </p>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-1 text-xs text-slate-500 font-semibold">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>{event.registration_count} Attendees</span>
                </div>

                <div className="flex items-center gap-2">
                  {(event.created_by === user?.id || user?.role === 'admin') && (
                    <button
                      onClick={() => viewAttendees(event.id)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition"
                    >
                      Attendees
                    </button>
                  )}

                  {event.is_registered ? (
                    <button
                      disabled={actionLoading === event.id}
                      onClick={() => handleCancelRegistration(event.id)}
                      className="px-3 py-1.5 bg-emerald-100 hover:bg-red-100 text-emerald-700 hover:text-red-700 text-xs font-bold rounded-lg transition flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Registered
                    </button>
                  ) : (
                    <button
                      disabled={actionLoading === event.id}
                      onClick={() => handleRegister(event.id)}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg shadow-md shadow-blue-600/20 transition cursor-pointer"
                    >
                      {actionLoading === event.id ? 'Registering...' : 'Register'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Attendees Modal */}
      {selectedEventId && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative border border-slate-100">
            <button
              onClick={() => setSelectedEventId(null)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-slate-900 mb-1">Registered Attendees</h3>
            <p className="text-xs text-slate-500 mb-4">Total: {attendees.length} people</p>

            {loadingAttendees ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading attendee list...</div>
            ) : attendees.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No registrations yet.</div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-2">
                {attendees.map((att) => (
                  <div key={att.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{att.user_name}</div>
                      <div className="text-[10px] text-slate-500">{att.user_email}</div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded uppercase">
                      {att.user_role}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative border border-slate-100">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-700"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">Create an Event</h3>
            <p className="text-xs text-slate-500 mb-6">New events are reviewed by admins before being published.</p>

            {createError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateEvent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Event Title *
                </label>
                <input
                  type="text"
                  required
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="e.g. Annual Tech Symposium & Alumni Meet"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Event Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newEvent.event_date}
                    onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={newEvent.start_time}
                    onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    End Time
                  </label>
                  <input
                    type="time"
                    value={newEvent.end_time}
                    onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Location / Platform *
                </label>
                <input
                  type="text"
                  required
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  placeholder="e.g. Auditorium Hall A or Online Zoom"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Description *
                </label>
                <textarea
                  rows={3}
                  required
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Provide event overview, agenda, and speakers..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-600/20 disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'Submit Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
