import { useState } from "react";
import Button from "./ui/Button";
import Input from "./ui/Input";
import { Info } from "lucide-react";

const emptyForm = {
  title: "",
  description: "",
  date: "",
  time: "",
  location: "",
  organizer: "",
  eventType: "",
  registrationDeadline: "",
  visibility: "Everyone",
};

function EventForm({ event, onSave, onCancel }) {
  const [formData, setFormData] = useState(event || emptyForm);
  const [prevEvent, setPrevEvent] = useState(event);
  const [errors, setErrors] = useState({});

  if (event !== prevEvent) {
    setPrevEvent(event);
    setFormData(event || emptyForm);
    setErrors({});
  }

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((previous) => ({
        ...previous,
        [name]: "",
      }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = "Event title is required.";
    }

    if (!formData.description.trim()) {
      newErrors.description = "Event description is required.";
    }

    if (!formData.date) {
      newErrors.date = "Event date is required.";
    }

    if (!formData.time) {
      newErrors.time = "Event time is required.";
    }

    if (!formData.location.trim()) {
      newErrors.location = "Location or meeting link is required.";
    }

    if (!formData.organizer.trim()) {
      newErrors.organizer = "Organizer name is required.";
    }

    if (!formData.eventType) {
      newErrors.eventType = "Please select an event type.";
    }

    if (!formData.registrationDeadline) {
      newErrors.registrationDeadline = "Registration deadline is required.";
    } else if (formData.date && formData.registrationDeadline > formData.date) {
      newErrors.registrationDeadline = "Registration deadline must be on or before the event date.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    onSave(formData);
  };

  return (
    <form className="event-form" onSubmit={handleSubmit} noValidate>
      <div className="form-header">
        <div>
          <h3>{event ? "Edit Event" : "Create New Event"}</h3>
          <p>
            {event
              ? "Update event details for the local catalog preview."
              : "Add an event to the SOET Connect local catalog."}
          </p>
        </div>

        <div className="demo-notice-pill" role="note">
          <Info size={14} aria-hidden="true" />
          <span>Local Demo Mode — Not persisted to backend</span>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group full-width">
          <Input
            id="event-title"
            name="title"
            label="Event Title"
            required
            value={formData.title}
            onChange={handleChange}
            placeholder="e.g. Annual Alumni Career Summit"
            error={errors.title}
          />
        </div>

        <div className="form-group full-width">
          <label htmlFor="event-description" className="form-label">
            Event Description <span className="required-indicator" aria-hidden="true">*</span>
          </label>
          <textarea
            id="event-description"
            name="description"
            className={`form-input form-textarea ${errors.description ? "has-error" : ""}`}
            value={formData.description}
            onChange={handleChange}
            placeholder="Provide a comprehensive summary of the event schedule and topics..."
            rows={4}
            required
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? "event-desc-error" : undefined}
          />
          {errors.description && (
            <span id="event-desc-error" className="form-error" role="alert">
              {errors.description}
            </span>
          )}
        </div>

        <div className="form-group">
          <Input
            id="event-date"
            name="date"
            type="date"
            label="Event Date"
            required
            value={formData.date}
            onChange={handleChange}
            error={errors.date}
          />
        </div>

        <div className="form-group">
          <Input
            id="event-time"
            name="time"
            type="time"
            label="Event Time"
            required
            value={formData.time}
            onChange={handleChange}
            error={errors.time}
          />
        </div>

        <div className="form-group">
          <Input
            id="event-location"
            name="location"
            label="Location / Platform"
            required
            value={formData.location}
            onChange={handleChange}
            placeholder="e.g. Auditorium / Online (Zoom)"
            error={errors.location}
          />
        </div>

        <div className="form-group">
          <Input
            id="event-organizer"
            name="organizer"
            label="Organizer"
            required
            value={formData.organizer}
            onChange={handleChange}
            placeholder="e.g. SOET Alumni Association"
            error={errors.organizer}
          />
        </div>

        <div className="form-group">
          <label htmlFor="event-type" className="form-label">
            Event Category <span className="required-indicator" aria-hidden="true">*</span>
          </label>
          <select
            id="event-type"
            name="eventType"
            className={`form-input filter-select ${errors.eventType ? "has-error" : ""}`}
            value={formData.eventType}
            onChange={handleChange}
            required
            aria-invalid={Boolean(errors.eventType)}
            aria-describedby={errors.eventType ? "event-type-error" : undefined}
          >
            <option value="">Select category</option>
            <option value="Networking">Networking</option>
            <option value="Workshop">Workshop</option>
            <option value="Career">Career</option>
            <option value="Seminar">Seminar</option>
            <option value="Meetup">Meetup</option>
            <option value="Other">Other</option>
          </select>
          {errors.eventType && (
            <span id="event-type-error" className="form-error" role="alert">
              {errors.eventType}
            </span>
          )}
        </div>

        <div className="form-group">
          <Input
            id="event-deadline"
            name="registrationDeadline"
            type="date"
            label="Registration Deadline"
            required
            value={formData.registrationDeadline}
            onChange={handleChange}
            error={errors.registrationDeadline}
          />
        </div>

        <div className="form-group full-width">
          <label htmlFor="event-visibility" className="form-label">
            Audience Visibility
          </label>
          <select
            id="event-visibility"
            name="visibility"
            className="form-input filter-select"
            value={formData.visibility}
            onChange={handleChange}
          >
            <option value="Everyone">Everyone (Public)</option>
            <option value="Students">Students Only</option>
            <option value="Alumni">Alumni Only</option>
            <option value="Students + Alumni">Students + Alumni</option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
        >
          Cancel
        </Button>

        <Button
          type="submit"
          variant="primary"
        >
          {event ? "Save Changes" : "Create Event"}
        </Button>
      </div>
    </form>
  );
}

export default EventForm;