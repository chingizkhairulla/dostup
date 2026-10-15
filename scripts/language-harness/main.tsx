import { Component, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@/index.css";

import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { InstallPromptProvider } from "@/contexts/InstallPromptContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { toLanguage } from "@/lib/language";

import CreatorProductsTab from "@/components/creator/CreatorProductsTab";
import CreatorMaterialsTab from "@/components/creator/CreatorMaterialsTab";
import CreatorUsersTab from "@/components/creator/CreatorUsersTab";
import CreatorScheduleTab from "@/components/creator/CreatorScheduleTab";
import ProductMaterialsManager from "@/components/creator/ProductMaterialsManager";
import ProductAnnouncementsManager from "@/components/creator/ProductAnnouncementsManager";
import CoverCropEditor from "@/components/creator/CoverCropEditor";
import SlotCreationWizard from "@/components/schedule/SlotCreationWizard";
import AccountSettingsView from "@/components/account/AccountSettingsView";
import NotificationPreferences from "@/components/NotificationPreferences";
import AccountSheet from "@/components/layout/BuyerAccountSheet";
import NotFound from "@/pages/NotFound";
import CreatorNotificationsTab from "@/components/creator/CreatorNotificationsTab";
import CreatorPendingPayments from "@/components/creator/CreatorPendingPayments";
import TeacherScheduleTab from "@/components/teacher/TeacherScheduleTab";
import TeacherNotificationsTab from "@/components/teacher/TeacherNotificationsTab";
import TeacherMaterialsManager from "@/components/teacher/TeacherMaterialsManager";
import HomeTab from "@/components/dashboard/HomeTab";
import ScheduleTab from "@/components/dashboard/ScheduleTab";
import MaterialsTab from "@/components/dashboard/MaterialsTab";
import NotificationsTab from "@/components/dashboard/NotificationsTab";
import ProductPreviewRoute from "@/pages/ProductPreviewRoute";

// One screen per `?scene=`, in the language given by `?lang=`. Real components
// only; the data comes from fakeSupabase.ts.

const params = new URLSearchParams(window.location.search);
// The product editor shows its preview in a frame pointed at this route; in
// the harness that frame loads this same file, so it has to answer as the app would.
const isPreviewFrame = window.location.pathname === "/preview/product";
const scene = isPreviewFrame ? "preview-frame" : (params.get("scene") ?? "editor");

// The app reads its language from storage on start; set it before anything
// renders so the first paint is already in the language under test, and give
// the session helpers the seller they expect.
if (params.has("lang")) localStorage.setItem("language", toLanguage(params.get("lang")));
localStorage.setItem("creator_token", "harness-token");
localStorage.setItem("creator_name", "Demo Seller");
localStorage.setItem("profile_type", "creator");
localStorage.setItem("profile_id", "profile-1");

function Wizard() {
  const { language } = useLanguage();
  return <SlotCreationWizard open onOpenChange={() => {}} language={language} onCreateSlots={() => {}} />;
}

function Cover() {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="max-w-md p-4">
      <CoverCropEditor
        source="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='384' height='240'><rect width='384' height='240' fill='%23ddd'/></svg>"
        mediaType="image"
        zoom={zoom}
        onZoom={setZoom}
        onPointerDown={() => {}}
        onPointerMove={() => {}}
        onPointerUp={() => {}}
        onCancel={() => {}}
        onSave={() => {}}
      />
    </div>
  );
}

const SCENES: Record<string, () => ReactNode> = {
  editor: () => <CreatorProductsTab creatorName="Demo Seller" />,
  "materials-tab": () => <CreatorMaterialsTab creatorName="Demo Seller" />,
  materials: () => (
    <ProductMaterialsManager productId="product-1" productTitle="SAT Math Bootcamp" isOpen onClose={() => {}} mode="edit" />
  ),
  "materials-add": () => (
    <ProductMaterialsManager productId="product-1" productTitle="SAT Math Bootcamp" isOpen onClose={() => {}} mode="add" />
  ),
  announcements: () => (
    <ProductAnnouncementsManager
      productId="product-1"
      productTitle="SAT Math Bootcamp"
      initialGroupLinkUrl="https://t.me/demo"
      initialGroupLinkLabel={null}
      onBack={() => {}}
    />
  ),
  users: () => <CreatorUsersTab creatorName="Demo Seller" />,
  schedule: () => <CreatorScheduleTab creatorName="Demo Seller" />,
  wizard: () => <Wizard />,
  cover: () => <Cover />,
  settings: () => (
    <AccountSettingsView
      role="creator"
      displayName="Demo Seller"
      createdAt="2026-01-15T10:00:00Z"
      userId="user-1"
      purchases={[{ id: "pu-1", created_at: "2026-09-20T10:00:00Z", amount: 45000, product: { title: "SAT Math Bootcamp" } }]}
    />
  ),
  reminders: () => (
    <div className="max-w-xl p-4">
      <NotificationPreferences userId="user-1" />
    </div>
  ),
  "account-sheet": () => <AccountSheet open onOpenChange={() => {}} />,
  "not-found": () => <NotFound />,
  "seller-notifications": () => <CreatorNotificationsTab creatorName="Demo Seller" lastViewedAt={null} />,
  "pending-payments": () => <CreatorPendingPayments creatorName="Demo Seller" />,
  "teacher-schedule": () => <TeacherScheduleTab teacherName="Demo Teacher" productIds={["product-1"]} />,
  "teacher-notifications": () => <TeacherNotificationsTab teacherName="Demo Teacher" productIds={["product-1"]} lastViewedAt={null} />,
  "teacher-materials": () => <TeacherMaterialsManager teacherId="teacher-1" productId="product-1" productTitle="SAT Math Bootcamp" />,
  "buyer-home": () => <HomeTab onBrowseCourses={() => {}} />,
  "buyer-schedule": () => <ScheduleTab />,
  "buyer-materials": () => <MaterialsTab />,
  "buyer-notifications": () => <NotificationsTab lastViewedAt={null} purchasedProductIds={["product-1"]} />,
  "preview-frame": () => <ProductPreviewRoute />,
};

/** A crash is reported as text the audit can read, not as a blank page. */
class Crash extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) return <pre id="harness-error">{String(this.state.error?.stack ?? this.state.error)}</pre>;
    return this.props.children;
  }
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const render = SCENES[scene];

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <InstallPromptProvider>
        <TooltipProvider>
          <MemoryRouter>
            <Sonner />
            <Crash>
              {/* The dashboards' own padding: some screens (the buyer's date strip)
                  use negative margins that assume it. */}
              <main id="harness-scene" data-scene={scene} className="px-4 py-6 md:px-6">
                {render ? render() : <pre id="harness-error">Unknown scene: {scene}</pre>}
              </main>
            </Crash>
          </MemoryRouter>
        </TooltipProvider>
      </InstallPromptProvider>
    </LanguageProvider>
  </QueryClientProvider>,
);
