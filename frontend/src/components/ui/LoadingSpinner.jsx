import { Loader2 } from "lucide-react";

function LoadingSpinner({
  size = "md",
  message = "Loading...",
  centered = true,
}) {
  const sizeMap = {
    sm: 20,
    md: 32,
    lg: 48,
  };

  const iconSize = sizeMap[size] || 32;

  const content = (
    <div className={`loading-spinner-wrapper size-${size}`} role="status">
      <Loader2 size={iconSize} className="spinner-icon" aria-hidden="true" />
      {message && <span className="loading-message">{message}</span>}
      <span className="sr-only">Loading, please wait...</span>
    </div>
  );

  if (centered) {
    return <div className="loading-centered-container">{content}</div>;
  }

  return content;
}

export default LoadingSpinner;
