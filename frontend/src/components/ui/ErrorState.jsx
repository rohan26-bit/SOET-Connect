import { AlertTriangle, RotateCcw } from "lucide-react";
import Button from "./Button";

function ErrorState({
  title = "Something went wrong",
  message = "An error occurred while loading this section. Please try again.",
  onRetry = null,
  className = "",
}) {
  return (
    <div className={`ui-error-state ${className}`.trim()} role="alert">
      <div className="error-state-icon" aria-hidden="true">
        <AlertTriangle size={40} />
      </div>
      <h3 className="error-state-title">{title}</h3>
      <p className="error-state-desc">{message}</p>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          icon={RotateCcw}
          onClick={onRetry}
          className="error-state-retry-btn"
        >
          Try Again
        </Button>
      )}
    </div>
  );
}

export default ErrorState;
