import { NavLink, Route, Routes } from "react-router-dom";
import { Sidebar } from "./components/sidebar";
import { RequireAuth } from "./components/require-auth";
import { OrgGate } from "./components/org-gate";
import HomePage from "./pages/home";
import ClientsPage from "./pages/clients";
import LoginPage from "./pages/login";
import RedeemInvitePage from "./pages/redeem";
import ProjectsPage from "./pages/projects";
import ProjectShell from "./pages/project/shell";
import ProjectOverview from "./pages/project/overview";
import ProjectBids from "./pages/project/bids";
import ProjectBidDetail from "./pages/project/bid-detail";
import ProjectWorkPlan from "./pages/project/work-plan";
import ProjectAssets from "./pages/project/assets";
import ProjectAssetDetail from "./pages/project/asset-detail";
import ProjectFurniture from "./pages/project/furniture";
import ProjectFurnitureDetail from "./pages/project/furniture-detail";
import ProjectRooms from "./pages/project/rooms";
import ProjectRoomDetail from "./pages/project/room-detail";
import ProjectMaterials from "./pages/project/materials";
import ProjectSpecs from "./pages/project/specs";
import ProjectMoney from "./pages/project/money";
import ProjectBillDetail from "./pages/project/bill-detail";
import ProjectInvoiceDetail from "./pages/project/invoice-detail";
import ProjectProposals from "./pages/project/proposals";
import ProjectProposalDetail from "./pages/project/proposal-detail";
import ProjectChangeOrders from "./pages/project/change-orders";
import ProjectChangeOrderDetail from "./pages/project/change-order-detail";
import ProjectAssistant from "./pages/project/assistant";
import ProjectActivity from "./pages/project/activity";
import ProjectDocuments from "./pages/project/documents";
import ProjectPlaceholder from "./pages/project/placeholder";
import ServicesPage from "./pages/services";
import SettingsPage from "./pages/settings";
import VendorsPage from "./pages/vendors";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<RedeemInvitePage />} />
      <Route path="/redeem" element={<RedeemInvitePage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <OrgGate>
              <AppShell />
            </OrgGate>
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

          {/* Project workspace mode — Vercel/Supabase pattern. Sidebar
              switches to project-nav when the URL matches /projects/:id/*. */}
          <Route path="/projects/:id" element={<ProjectShell />}>
            <Route index element={<ProjectOverview />} />
            <Route path="assistant" element={<ProjectAssistant />} />
            {/* `plan` is canonical; `work-plan` kept as alias for old bookmarks. */}
            <Route path="plan" element={<ProjectWorkPlan />} />
            <Route path="work-plan" element={<ProjectWorkPlan />} />
            <Route path="rooms" element={<ProjectRooms />} />
            <Route
              path="rooms/:roomId"
              element={<ProjectRoomDetail />}
            />
            <Route path="bids" element={<ProjectBids />} />
            <Route
              path="bids/:bidId"
              element={<ProjectBidDetail />}
            />
            <Route
              path="drawings"
              element={<ProjectPlaceholder tab="drawings" />}
            />
            <Route path="specs" element={<ProjectSpecs />} />
            <Route path="assets" element={<ProjectAssets />} />
            <Route
              path="assets/:assetId"
              element={<ProjectAssetDetail />}
            />
            <Route path="furniture" element={<ProjectFurniture />} />
            <Route
              path="furniture/:furnitureId"
              element={<ProjectFurnitureDetail />}
            />
            <Route path="materials" element={<ProjectMaterials />} />
            <Route
              path="rfis"
              element={<ProjectPlaceholder tab="rfis" />}
            />
            <Route
              path="punch"
              element={<ProjectPlaceholder tab="punch" />}
            />
            <Route
              path="site-logs"
              element={<ProjectPlaceholder tab="site-logs" />}
            />
            <Route
              path="documents"
              element={<ProjectDocuments />}
            />
            <Route path="money" element={<ProjectMoney />} />
            <Route
              path="bills/:billId"
              element={<ProjectBillDetail />}
            />
            <Route
              path="invoices/:invoiceId"
              element={<ProjectInvoiceDetail />}
            />
            <Route path="proposals" element={<ProjectProposals />} />
            <Route
              path="proposals/:proposalId"
              element={<ProjectProposalDetail />}
            />
            <Route
              path="change-orders"
              element={<ProjectChangeOrders />}
            />
            <Route
              path="change-orders/:changeOrderId"
              element={<ProjectChangeOrderDetail />}
            />
            <Route path="activity" element={<ProjectActivity />} />
          </Route>

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
