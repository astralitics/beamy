import { NavLink, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/sidebar";
import HomePage from "./pages/home";
import ClientsPage from "./pages/clients";
import ServicesPage from "./pages/services";
import VendorsPage from "./pages/vendors";

export default function App() {
  return (
    <div className="flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/services" element={<ServicesPage />} />
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
        <p className="text-sm text-slate-500">404</p>
        <h1 className="mt-2 text-xl font-semibold">Nothing here yet.</h1>
        <NavLink to="/" className="mt-4 inline-block text-sm text-sky-600">
          Back to Home →
        </NavLink>
      </div>
    </div>
  );
}
