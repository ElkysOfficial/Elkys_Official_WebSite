import { lazy, Suspense } from "react";
import { Navigate, Outlet, Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/portal/auth/ProtectedRoute";
import hexagonalBg from "@/assets/icons/hexagonal.webp";
import MustChangePasswordGuard from "@/components/portal/auth/MustChangePasswordGuard";
import MustChangePasswordGuardAdmin from "@/components/portal/auth/MustChangePasswordGuardAdmin";
import TermsAcceptanceGuard from "@/components/portal/auth/TermsAcceptanceGuard";
import PortalRoleGuard from "@/components/portal/auth/PortalRoleGuard";

const AdminLayout = lazy(() => import("@/components/portal/admin/AdminLayout"));
const AdminPortalHome = lazy(() => import("@/components/portal/admin/AdminPortalHome"));
const AdminMarketingCalendar = lazy(() => import("./portal/admin/MarketingCalendar"));
const AdminClients = lazy(() => import("./portal/admin/Clients"));
const AdminClientCreate = lazy(() => import("./portal/admin/ClientCreate"));
const AdminClientDetail = lazy(() => import("./portal/admin/ClientDetail"));
const AdminProjects = lazy(() => import("./portal/admin/Projects"));
const AdminProjectCreate = lazy(() => import("./portal/admin/ProjectCreate"));
const AdminProjectDetail = lazy(() => import("./portal/admin/ProjectDetail"));
const AdminInternalDocuments = lazy(() => import("./portal/admin/InternalDocuments"));
const AdminFinance = lazy(() => import("./portal/admin/Finance"));
const AdminCommunications = lazy(() => import("./portal/admin/Communications"));
const AdminExpenseCreate = lazy(() => import("./portal/admin/ExpenseCreate"));
const AdminTeamCreate = lazy(() => import("./portal/admin/TeamCreate"));
const AdminTeamEdit = lazy(() => import("./portal/admin/TeamEdit"));
const AdminSupport = lazy(() => import("./portal/admin/Support"));
const AdminAuditLog = lazy(() => import("./portal/admin/AuditLog"));
const AdminCRM = lazy(() => import("./portal/admin/CRM"));
const AdminLeadDetail = lazy(() => import("./portal/admin/LeadDetail"));
const AdminProposalDetail = lazy(() => import("./portal/admin/ProposalDetail"));
const AdminBillingAutomation = lazy(() => import("./portal/admin/BillingAutomation"));
const AdminContracts = lazy(() => import("./portal/admin/Contracts"));
const AdminTasks = lazy(() => import("./portal/admin/Tasks"));
const AdminTeamHub = lazy(() => import("./portal/admin/TeamHub"));
const AdminProfile = lazy(() => import("./portal/admin/Profile"));
const ClientLayout = lazy(() => import("@/components/portal/client/ClientLayout"));
const ClientOverview = lazy(() => import("./portal/client/Overview"));
const ClientProjects = lazy(() => import("./portal/client/Projects"));
const ClientProjectDetail = lazy(() => import("./portal/client/ProjectDetail"));
const ClientFinance = lazy(() => import("./portal/client/Finance"));
const ClientSupport = lazy(() => import("./portal/client/Support"));
const ClientProposals = lazy(() => import("./portal/client/Proposals"));
const ClientProposalView = lazy(() => import("./portal/client/ProposalView"));
const ClientContracts = lazy(() => import("./portal/client/Contracts"));
const ClientProfile = lazy(() => import("./portal/client/Profile"));
const ChangePassword = lazy(() => import("./portal/client/ChangePassword"));
const AdminChangePassword = lazy(() => import("./portal/admin/ChangePassword"));

const LoadingFallback = () => (
  <div className="flex min-h-screen items-center justify-center bg-background">
    <div className="relative flex items-center justify-center">
      <span className="absolute h-16 w-16 animate-portal-ring rounded-full border-2 border-primary/30" />
      <img src={hexagonalBg} alt="" className="h-10 w-10 animate-portal-spin" draggable={false} />
    </div>
  </div>
);

/**
 * Portal routes rendered under <Route path="/portal/*"> in App.tsx.
 * All paths are relative to /portal/ since the parent already consumed
 * that prefix.  AuthProvider is provided by the PortalShell layout route.
 */
const PortalRoutes = () => (
  <Routes>
    {/* /portal → redirect to login (handles OAuth callback) */}
    <Route index element={<Navigate to="/login" replace />} />

    {/* First-access password change (client only, before portal) */}
    <Route
      path="cliente/alterar-senha"
      element={
        <ProtectedRoute requiredRole="cliente">
          <ChangePassword />
        </ProtectedRoute>
      }
    />

    {/* First-access password change (team members, before admin portal) */}
    <Route
      path="admin/alterar-senha"
      element={
        <ProtectedRoute requiredRole="admin">
          <AdminChangePassword />
        </ProtectedRoute>
      }
    />

    {/* Portal — com loading branded */}
    <Route
      element={
        <Suspense fallback={<LoadingFallback />}>
          <Outlet />
        </Suspense>
      }
    >
      {/* Admin / Team Portal */}
      <Route
        path="admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <MustChangePasswordGuardAdmin>
              <AdminLayout />
            </MustChangePasswordGuardAdmin>
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <AdminPortalHome />
            </PortalRoleGuard>
          }
        />
        <Route
          path="calendario"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <AdminMarketingCalendar />
            </PortalRoleGuard>
          }
        />
        <Route
          path="calendario/:domain"
          element={
            <PortalRoleGuard
              allowedRoles={[
                "admin_super",
                "admin",
                "comercial",
                "juridico",
                "financeiro",
                "po",
                "developer",
                "designer",
                "marketing",
                "support",
              ]}
            >
              <AdminMarketingCalendar />
            </PortalRoleGuard>
          }
        />
        <Route
          path="tarefas"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <AdminTasks />
            </PortalRoleGuard>
          }
        />
        <Route
          path="tarefas/:domain"
          element={
            <PortalRoleGuard
              allowedRoles={[
                "admin_super",
                "admin",
                "marketing",
                "developer",
                "designer",
                "po",
                "support",
                "financeiro",
                "comercial",
                "juridico",
              ]}
            >
              <AdminTasks />
            </PortalRoleGuard>
          }
        />
        <Route
          path="documentos/marketing-design"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "marketing"]}>
              <AdminInternalDocuments audience="marketing_design" />
            </PortalRoleGuard>
          }
        />
        <Route
          path="documentos/desenvolvedor"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "developer", "designer", "po"]}>
              <AdminInternalDocuments audience="developer" />
            </PortalRoleGuard>
          }
        />
        <Route
          path="comunicacoes"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "financeiro", "comercial"]}>
              <AdminCommunications />
            </PortalRoleGuard>
          }
        />
        <Route
          path="clientes"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "financeiro", "comercial"]}>
              <AdminClients />
            </PortalRoleGuard>
          }
        />
        <Route
          path="clientes/novo"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <AdminClientCreate />
            </PortalRoleGuard>
          }
        />
        <Route
          path="clientes/:id"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "financeiro", "comercial"]}>
              <AdminClientDetail />
            </PortalRoleGuard>
          }
        />
        <Route
          path="projetos"
          element={
            <PortalRoleGuard
              allowedRoles={[
                "admin_super",
                "admin",
                "developer",
                "designer",
                "po",
                "support",
                "financeiro",
              ]}
            >
              <AdminProjects />
            </PortalRoleGuard>
          }
        />
        <Route
          path="projetos/novo"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <AdminProjectCreate />
            </PortalRoleGuard>
          }
        />
        <Route
          path="projetos/:id"
          element={
            <PortalRoleGuard
              allowedRoles={[
                "admin_super",
                "admin",
                "developer",
                "designer",
                "po",
                "support",
                "financeiro",
              ]}
            >
              <AdminProjectDetail />
            </PortalRoleGuard>
          }
        />
        <Route
          path="financeiro"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "financeiro"]}>
              <AdminFinance />
            </PortalRoleGuard>
          }
        />
        <Route
          path="financeiro/nova-despesa"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "financeiro"]}>
              <AdminExpenseCreate />
            </PortalRoleGuard>
          }
        />
        <Route
          path="despesas"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "financeiro"]}>
              <Navigate to="/portal/admin/financeiro" replace state={{ financeTab: "despesas" }} />
            </PortalRoleGuard>
          }
        />
        <Route
          path="despesas/nova"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <Navigate
                to="/portal/admin/financeiro/nova-despesa"
                replace
                state={{ financeTab: "despesas" }}
              />
            </PortalRoleGuard>
          }
        />
        {/* Equipe hub (membros + notificacoes) */}
        <Route
          path="equipe"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <AdminTeamHub />
            </PortalRoleGuard>
          }
        />
        <Route
          path="equipe/novo"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <AdminTeamCreate />
            </PortalRoleGuard>
          }
        />
        <Route
          path="equipe/:id/editar"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <AdminTeamEdit />
            </PortalRoleGuard>
          }
        />
        <Route
          path="suporte"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "support"]}>
              <AdminSupport />
            </PortalRoleGuard>
          }
        />
        {/* CRM hub (leads + propostas + pipeline) — ownership Comercial */}
        <Route
          path="crm"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "comercial", "marketing"]}>
              <AdminCRM />
            </PortalRoleGuard>
          }
        />
        <Route
          path="leads/:id"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "comercial"]}>
              <AdminLeadDetail />
            </PortalRoleGuard>
          }
        />
        <Route
          path="propostas/nova"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "comercial"]}>
              <AdminProposalDetail />
            </PortalRoleGuard>
          }
        />
        <Route
          path="propostas/:id"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "comercial", "po"]}>
              <AdminProposalDetail />
            </PortalRoleGuard>
          }
        />
        {/* Financeiro standalone routes */}
        <Route
          path="cobranca-automatica"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "financeiro"]}>
              <AdminBillingAutomation />
            </PortalRoleGuard>
          }
        />
        {/* Juridico — gestao de contratos */}
        <Route
          path="contratos"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin", "juridico"]}>
              <AdminContracts />
            </PortalRoleGuard>
          }
        />
        <Route
          path="audit-log"
          element={
            <PortalRoleGuard allowedRoles={["admin_super", "admin"]}>
              <AdminAuditLog />
            </PortalRoleGuard>
          }
        />
        {/* Redirects for old standalone URLs */}
        <Route
          path="notificacoes"
          element={
            <Navigate to="/portal/admin/equipe" replace state={{ teamTab: "notificacoes" }} />
          }
        />
        <Route
          path="inadimplencia"
          element={
            <Navigate
              to="/portal/admin/financeiro"
              replace
              state={{ financeTab: "inadimplencia" }}
            />
          }
        />
        <Route
          path="receita-clientes"
          element={
            <Navigate
              to="/portal/admin/financeiro"
              replace
              state={{ financeTab: "receita-clientes" }}
            />
          }
        />
        <Route
          path="metas"
          element={
            <Navigate to="/portal/admin/financeiro" replace state={{ financeTab: "metas" }} />
          }
        />
        <Route
          path="leads"
          element={<Navigate to="/portal/admin/crm" replace state={{ crmTab: "leads" }} />}
        />
        <Route
          path="propostas"
          element={<Navigate to="/portal/admin/crm" replace state={{ crmTab: "propostas" }} />}
        />
        <Route
          path="pipeline"
          element={<Navigate to="/portal/admin/crm" replace state={{ crmTab: "pipeline" }} />}
        />
        <Route path="perfil" element={<AdminProfile />} />
      </Route>

      {/* Client Portal */}
      <Route
        path="cliente"
        element={
          <ProtectedRoute requiredRole="cliente">
            <MustChangePasswordGuard>
              <TermsAcceptanceGuard>
                <ClientLayout />
              </TermsAcceptanceGuard>
            </MustChangePasswordGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<ClientOverview />} />
        <Route path="propostas" element={<ClientProposals />} />
        <Route path="propostas/:id" element={<ClientProposalView />} />
        <Route path="contratos" element={<ClientContracts />} />
        <Route path="projetos" element={<ClientProjects />} />
        <Route path="projetos/:id" element={<ClientProjectDetail />} />
        <Route path="financeiro" element={<ClientFinance />} />
        <Route path="documentos" element={<Navigate to="/portal/cliente/projetos" replace />} />
        <Route path="suporte" element={<ClientSupport />} />
        <Route path="perfil" element={<ClientProfile />} />
      </Route>
    </Route>
  </Routes>
);

export default PortalRoutes;
