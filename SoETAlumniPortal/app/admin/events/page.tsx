'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { eventService, EventItem } from '@/lib/services/eventService';
import { useAuth } from '@/components/AuthProvider';
import {
  Calendar, Plus, Trash2, MapPin, Clock, Users, X, Edit3,
  CheckCircle2, XCircle, Eye, EyeOff, Search, Filter
} from 'lucide-react';

const EVENT_TYPES = [
  'Seminar', 'Workshop', 'Webinar', 'Meetup', 'Hackathon',
  'Conference', 'Career Fair', 'Cultural Event', 'Sports Event', 'Other'
];

const VISIBILITY_OPTIONS = ['Everyone', 'Students Only', 'Alumni Only', 'Admin Only'];

interface EventFormData {
  title: string;
  organizer: string;
  description: string;
  event_date: string;
  start_time: string;
  location: string;
  event_type: string;
  registration_deadline: string;
  visibility: string;
}

const emptyForm: EventFormData = {
  title: '',
  organizer: '',
  description: '',
  event_date: '',
  start_time: '',
  location: '',
  event_type: '',
  registration_deadline: '',
  visibility: 'Everyone',
};

export default function AdminEventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventItem | null>(null);
  const [formData, setFormData] = useState<EventFormData>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await eventService.getAllEventsForAdmin();
      setEvents(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleStatusChange = async (eventId: string, status: 'approved' | 'rejected' | 'cancelled') => {
    try {
      await eventService.updateEventStatus(eventId, status);
      loadEvents();
    } catch (err: any) {
      alert(err.message || 'Failed to update event status.');
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm('Are you sure you want to permanently delete this event?')) return;
    try {
      await eventService.deleteEvent(eventId);
      loadEvents();
    } catch (err: any) {
      alert(err.message || 'Failed to delete event.');
    }
  };

  const openCreateModal = () => {
    setEditingEvent(null);
    setFormData(emptyForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEditModal = (event: EventItem) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      organizer: event.creator_name || '',
      description: event.description,
      event_date: event.event_date,
      start_time: event.start_time || '',
      location: event.location,
      event_type: '',
      registration_deadline: event.registration_deadline || '',
      visibility: 'Everyone',
    });
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);

    try {
      if (editingEvent) {
        // Update existing event
        const supabase = (await import('@/utils/supabase/client')).createClient();
        const { error } = await supabase
          .from('events')
          .update({
            title: formData.title,
            description: formData.description,
            event_date: formData.event_date,
            start_time: formData.start_time || null,
            location: formData.location,
            registration_deadline: formData.registration_deadline || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingEvent.id);

        if (error) throw new Error(error.message);
      } else {
        // Create new event (auto-approved since admin creates it)
        const supabase = (await import('@/utils/supabase/client')).createClient();
        const { error } = await supabase
          .from('events')
          .insert({
            created_by: user?.id,
            title: formData.title,
            description: formData.description,
            event_date: formData.event_date,
            start_time: formData.start_time || null,
            location: formData.location,
            registration_deadline: formData.registration_deadline || null,
            status: 'approved', // Admin-created events are auto-approved
          });

        if (error) throw new Error(error.message);
      }

      setShowModal(false);
      loadEvents();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save event.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredEvents = events
    .filter((e) => (filter === 'all' ? true : e.status === filter))
    .filter((e) =>
      searchQuery === '' ||
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.creator_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

  const stats = {
    total: events.length,
    approved: events.filter(e => e.status === 'approved').length,
    pending: events.filter(e => e.status === 'pending').length,
    rejected: events.filter(e => e.status === 'rejected').length,
  };

  return (
    <DashboardLayout>
      {/* Breadcrumbs */}
      <div className="flex items-center text-xs font-semibold text-slate-400 mb-6 uppercase tracking-wider">
        <span>Administration</span>
        <span className="mx-2 text-slate-300">/</span>
        <span className="text-blue-600">Events Management</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Events Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Create, manage, and moderate all campus events, meetups, and workshops.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-sm font-bold transition shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" /> Create Event
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Events', value: stats.total, color: 'blue' },
          { label: 'Approved', value: stats.approved, color: 'emerald' },
          { label: 'Pending', value: stats.pending, color: 'amber' },
          { label: 'Rejected', value: stats.rejected, color: 'red' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">{stat.label}</p>
            <p className={`text-2xl font-black text-${stat.color}-600 mt-1`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search events by title, location, or organizer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold capitalize transition ${
                filter === tab
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab} ({tab === 'all' ? stats.total : stats[tab as keyof typeof stats]})
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading events...</div>
      ) : filteredEvents.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm">
          <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Events Found</h3>
          <p className="text-xs text-slate-500 mt-1">Click &quot;Create Event&quot; to add a new event.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredEvents.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-3xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
            >
              <div>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-base font-bold text-slate-900">{event.title}</h3>
                    <div className="flex items-center gap-3 mt-1.5">
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-blue-600" />
                        {new Date(event.event_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                      {event.start_time && (
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          {event.start_time}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" /> {event.location}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 text-[10px] font-bold rounded-full uppercase shrink-0 ${
                    event.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                    event.status === 'rejected' ? 'bg-red-100 text-red-700' :
                    event.status === 'cancelled' ? 'bg-slate-100 text-slate-600' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {event.status}
                  </span>
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 my-3 bg-slate-50 p-3 rounded-xl leading-relaxed">
                  {event.description}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Organizer: <span className="font-semibold text-slate-700">{event.creator_name || 'Admin'}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {event.registration_count || 0} registered
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditModal(event)}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-bold"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(event.id)}
                    className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-bold"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {event.status !== 'approved' && (
                    <button
                      onClick={() => handleStatusChange(event.id, 'approved')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {event.status !== 'rejected' && event.status !== 'cancelled' && (
                    <button
                      onClick={() => handleStatusChange(event.id, 'rejected')}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl text-xs font-bold transition"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Event Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-900">
                {editingEvent ? 'Edit Event' : 'Create Event'}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center transition"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveEvent} className="p-6 space-y-5">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                  {formError}
                </div>
              )}

              {/* Title & Organizer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title *</label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition"
                    placeholder="Event title"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Organizer *</label>
                  <input
                    type="text"
                    required
                    value={formData.organizer}
                    onChange={(e) => setFormData({ ...formData, organizer: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition"
                    placeholder="Organizer name or department"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description *</label>
                <textarea
                  required
                  rows={4}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition resize-none"
                  placeholder="Describe the event..."
                />
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.event_date}
                    onChange={(e) => setFormData({ ...formData, event_date: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Time *</label>
                  <input
                    type="time"
                    required
                    value={formData.start_time}
                    onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition"
                  />
                </div>
              </div>

              {/* Location & Event Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Location / Online *</label>
                  <input
                    type="text"
                    required
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition"
                    placeholder="SOET Campus / Online"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Event Type *</label>
                  <select
                    required
                    value={formData.event_type}
                    onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition"
                  >
                    <option value="">Select type</option>
                    {EVENT_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Registration Deadline & Visibility */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Registration Deadline *</label>
                  <input
                    type="date"
                    required
                    value={formData.registration_deadline}
                    onChange={(e) => setFormData({ ...formData, registration_deadline: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Visibility *</label>
                  <select
                    required
                    value={formData.visibility}
                    onChange={(e) => setFormData({ ...formData, visibility: e.target.value })}
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition"
                  >
                    {VISIBILITY_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-lg shadow-blue-600/20 transition disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingEvent ? 'Update Event' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
