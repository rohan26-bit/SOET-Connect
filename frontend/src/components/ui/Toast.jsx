import { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

function Toast({
  message,
  type = "success",
  onClose,
  duration = 4000,
}) {
  useEffect(() => {
    if (!duration || !onClose) return;

    const timer = setTimeout(() => {
      onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (!message) return null;

  const iconMap = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
  };

  const Icon = iconMap[type] || Info;

  return (
    <div
      className={`ui-toast toast-${type}`}
      role="status"
      aria-live="polite"
    >
      <Icon size={18} className="toast-icon" aria-hidden="true" />
      <span className="toast-message">{message}</span>
      {onClose && (
        <button
          type="button"
          className="toast-close-btn"
          onClick={onClose}
          aria-label="Dismiss notification"
        >
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

export default Toast;
