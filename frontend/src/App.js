import "@/App.css";
import Landing from "@/landing/Landing";
import Privacy from "@/landing/Privacy";

function App() {
  const path = window.location.pathname;
  if (path === "/privacy" || path === "/privacy/") {
    return <Privacy />;
  }
  return <Landing />;
}

export default App;
