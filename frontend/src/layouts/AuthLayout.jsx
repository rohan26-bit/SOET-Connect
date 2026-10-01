import { Outlet, Link } from "react-router-dom";

function AuthLayout() {
  return (
    <div className="auth-layout">
      <div className="auth-container">
        <header className="auth-header">
          <Link to="/dashboard" className="auth-logo">
            <div className="logo-mark">S</div>
            <div>
              <h2>SOET Connect</h2>
              <span>School of Engineering and Technology</span>
            </div>
          </Link>
        </header>

        <main className="auth-card">
          <Outlet />
        </main>

        <footer className="auth-footer">
          <p>© {new Date().getFullYear()} SOET Connect. All rights reserved.</p>
        </footer>
      </div>
    </div>
  );
}

export default AuthLayout;
