import { NavLink, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/sidebar";
import { RequireAuth } from "./components/require-auth";
import HomePage from "./pages/home";
import ClientsPage from "./pages/clients";
import LoginPage from "./pages/login";
import ProjectDetailPage from "./pages/project-detail";
import ProjectsPage from "./pages/projects";
import ServicesPage from "./pages/services";
import SettingsPage from "./pages/settings";
import VendorsPage from "./pages/vendors";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      />
    </Routes>
  );
}

function AppShell() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <p className="font-mono text-xs uppercase tracking-wider text-slate-400">
          404 · not on the plans
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-blueprint-900">
          Nothing built here yet.
        </h1>
        <NavLink
          to="/"
          className="mt-5 inline-block text-sm font-medium text-safety-700 hover:text-safety-800"
        >
          Back to home →
        </NavLink>
      </div>
    </div>
  );
}
