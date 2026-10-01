import { Loader2 } from "lucide-react";

function Button({
  children,
  type = "button",
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  loading = false,
  icon: Icon = null,
  onClick,
  ...props
}) {
  const variantClass = `btn-${variant}`;
  const sizeClass = size !== "md" ? `btn-${size}` : "";
  const loadingClass = loading ? "btn-loading" : "";

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${loadingClass} ${className}`.trim()}
      disabled={disabled || loading}
      onClick={onClick}
      {...props}
    >
      {loading ? (
        <Loader2 size={16} className="btn-spinner" aria-hidden="true" />
      ) : Icon ? (
        <Icon size={16} className="btn-icon" aria-hidden="true" />
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export default Button;
