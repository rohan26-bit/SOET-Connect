import { useId } from "react";

function Input({
  id: explicitId,
  name,
  label,
  error,
  helperText,
  icon: Icon = null,
  type = "text",
  required = false,
  className = "",
  disabled = false,
  ...props
}) {
  const generatedId = useId();
  const inputId = explicitId || name || generatedId;
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;

  const describedBy = error ? errorId : helperText ? helperId : undefined;

  return (
    <div className={`form-group ${className}`.trim()}>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
          {required && <span className="required-indicator" aria-hidden="true"> *</span>}
        </label>
      )}

      <div className={`input-container ${Icon ? "has-icon" : ""}`}>
        {Icon && <Icon size={18} className="input-icon" aria-hidden="true" />}
        <input
          id={inputId}
          name={name}
          type={type}
          required={required}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={`form-input ${error ? "has-error" : ""}`}
          {...props}
        />
      </div>

      {error && (
        <span id={errorId} className="form-error" role="alert">
          {error}
        </span>
      )}

      {!error && helperText && (
        <span id={helperId} className="form-helper">
          {helperText}
        </span>
      )}
    </div>
  );
}

export default Input;
