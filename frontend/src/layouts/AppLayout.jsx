import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";

function AppLayout() {
  return (
    <div className="app">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <Sidebar />
      <div className="main-content">
        <Header />
        <main id="main-content" className="content-area" tabIndex="-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AppLayout;
