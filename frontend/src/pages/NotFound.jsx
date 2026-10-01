import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft } from "lucide-react";

function NotFound() {
  return (
    <div className="not-found-page">
      <div className="not-found-card">
        <div className="not-found-icon">
          <AlertCircle size={48} />
        </div>
        <h1>404 — Page Not Found</h1>
        <p>The page you are looking for does not exist or may have been moved.</p>
        <Link to="/dashboard" className="btn btn-primary not-found-btn">
          <ArrowLeft size={18} />
          <span>Back to Dashboard</span>
        </Link>
      </div>
    </div>
  );
}

export default NotFound;
