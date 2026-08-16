import { useEffect, useState } from "react";

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
  const [formData, setFormData] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (event) {
      setFormData(event);
    } else {
      setFormData(emptyForm);
    }

    setErrors({});
  }, [event]);

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
      newErrors.title = "Title is required.";
    }

    if (!formData.description.trim()) {
      newErrors.description = "Description is required.";
    }

    if (!formData.date) {
      newErrors.date = "Date is required.";
    }

    if (!formData.time) {
      newErrors.time = "Time is required.";
    }

    if (!formData.location.trim()) {
      newErrors.location = "Location is required.";
    }

    if (!formData.organizer.trim()) {
      newErrors.organizer = "Organizer is required.";
    }

    if (!formData.eventType) {
      newErrors.eventType = "Event type is required.";
    }

    if (!formData.registrationDeadline) {
      newErrors.registrationDeadline =
        "Registration deadline is required.";
    }

    if (
      formData.date &&
      formData.registrationDeadline &&
      formData.registrationDeadline > formData.date
    ) {
      newErrors.registrationDeadline =
        "Registration deadline must be before the event date.";
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
    <form className="event-form" onSubmit={handleSubmit}>
      <div className="form-header">
        <div>
          <h3>{event ? "Edit Event" : "Create Event"}</h3>
          <p>
            {event
              ? "Update the event information."
              : "Add a new event to SOET Connect."}
          </p>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group full-width">
          <label>Title *</label>
          <input
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Enter event title"
          />
          {errors.title && (
            <span className="form-error">{errors.title}</span>
          )}
        </div>

        <div className="form-group full-width">
          <label>Description *</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Describe the event"
            rows="4"
          />
          {errors.description && (
            <span className="form-error">{errors.description}</span>
          )}
        </div>

        <div className="form-group">
          <label>Date *</label>
          <input
            type="date"
            name="date"
            value={formData.date}
            onChange={handleChange}
          />
          {errors.date && (
            <span className="form-error">{errors.date}</span>
          )}
        </div>

        <div className="form-group">
          <label>Time *</label>
          <input
            type="time"
            name="time"
            value={formData.time}
            onChange={handleChange}
          />
          {errors.time && (
            <span className="form-error">{errors.time}</span>
          )}
        </div>

        <div className="form-group">
          <label>Location / Online *</label>
          <input
            name="location"
            value={formData.location}
            onChange={handleChange}
            placeholder="SOET Campus / Online"
          />
          {errors.location && (
            <span className="form-error">{errors.location}</span>
          )}
        </div>

        <div className="form-group">
          <label>Organizer *</label>
          <input
            name="organizer"
            value={formData.organizer}
            onChange={handleChange}
            placeholder="Event organizer"
          />
          {errors.organizer && (
            <span className="form-error">{errors.organizer}</span>
          )}
        </div>

        <div className="form-group">
          <label>Event Type *</label>
          <select
            name="eventType"
            value={formData.eventType}
            onChange={handleChange}
          >
            <option value="">Select event type</option>
            <option value="Networking">Networking</option>
            <option value="Workshop">Workshop</option>
            <option value="Career">Career</option>
            <option value="Seminar">Seminar</option>
            <option value="Meetup">Meetup</option>
            <option value="Other">Other</option>
          </select>
          {errors.eventType && (
            <span className="form-error">{errors.eventType}</span>
          )}
        </div>

        <div className="form-group">
          <label>Registration Deadline *</label>
          <input
            type="date"
            name="registrationDeadline"
            value={formData.registrationDeadline}
            onChange={handleChange}
          />
          {errors.registrationDeadline && (
            <span className="form-error">
              {errors.registrationDeadline}
            </span>
          )}
        </div>

        <div className="form-group">
          <label>Visibility *</label>
          <select
            name="visibility"
            value={formData.visibility}
            onChange={handleChange}
          >
            <option value="Everyone">Everyone</option>
            <option value="Students">Students</option>
            <option value="Alumni">Alumni</option>
            <option value="Students + Alumni">
              Students + Alumni
            </option>
          </select>
        </div>
      </div>

      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
        >
          Cancel
        </button>

        <button type="submit" className="button primary">
          {event ? "Save Changes" : "Create Event"}
        </button>
      </div>
    </form>
  );
}

export default EventForm;