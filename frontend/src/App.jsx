import Events from "./pages/Events";
import { useState } from "react";

import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import Dashboard from "./pages/Dashboard";

function App() {
  const [activePage, setActivePage] = useState("dashboard");

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":
        return <Dashboard />;

      case "events":
        return <Events />;

      case "users":
        return (
          <div className="placeholder-page">
            <h2>User Management</h2>
            <p>This module will be implemented later.</p>
          </div>
        );

      case "verification":
        return (
          <div className="placeholder-page">
            <h2>Alumni Verification</h2>
            <p>This module will be implemented later.</p>
          </div>
        );

      case "opportunities":
        return (
          <div className="placeholder-page">
            <h2>Opportunities</h2>
            <p>This module will be implemented later.</p>
          </div>
        );

      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="main-content">
        <Header />
        <div className="content-area">{renderPage()}</div>
      </main>
    </div>
  );
}

export default App;