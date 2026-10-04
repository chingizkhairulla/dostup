import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import {
	BrowserRouter,
	Routes,
	Route,
	useLocation,
	useNavigate,
} from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import AuthSplash from '@/components/auth/AuthSplash'
import { useSimpleAuth } from '@/contexts/SimpleAuthContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { SimpleAuthProvider } from '@/contexts/SimpleAuthContext'
import { LanguageProvider } from '@/contexts/LanguageContext'
import { InstallPromptProvider } from '@/contexts/InstallPromptContext'
import ErrorBoundary from '@/components/ErrorBoundary'
import MarketplacePage from './pages/MarketplacePage'
import NewProductsPage from './pages/NewProductsPage'
import LoginPage from './pages/LoginPage'
import StorefrontPage from './pages/StorefrontPage'
import ProductPage from './pages/ProductPage'
import ProductRedirect from './pages/ProductRedirect'
import ProductPurchasePage from './pages/ProductPurchasePage'
import Dashboard from './pages/Dashboard'
import CreatorDashboard from './pages/CreatorDashboard'
import TeacherDashboard from './pages/TeacherDashboard'
import SchoolDashboard from './pages/SchoolDashboard'
import ModeratorDashboard from './pages/ModeratorDashboard'
import InstallPage from './pages/InstallPage'
import AuthCallback from './pages/AuthCallback'
import WelcomePage from './pages/WelcomePage'
import NotFound from './pages/NotFound'
import LegalPage from './pages/LegalPage'
import RequireProfile from '@/components/auth/RequireProfile'
import ScrollManager from '@/components/layout/ScrollManager'
import { MARKETPLACE_LOCATION, readLoginBackground } from '@/lib/loginModal'
import { ONBOARDING_PATH } from '@/lib/creatorAuth'

// Pages an identity without profiles may still open.
const ONBOARDING_ALLOWED_PATHS = new Set([
	ONBOARDING_PATH,
	'/auth/callback',
	'/terms',
	'/privacy',
	'/moderator',
])

const queryClient = new QueryClient()

function AppRoutes() {
	const location = useLocation()
	const navigate = useNavigate()
	const { status, needsOnboarding } = useSimpleAuth()
	const isLogin = location.pathname === '/login'
	const isAuthCallback = location.pathname === '/auth/callback'
	const background = readLoginBackground(location.state)
	const underlayLocation = isLogin
		? (background ?? MARKETPLACE_LOCATION)
		: location

	useEffect(() => {
		if (
			location.pathname === '/moderator' ||
			location.pathname === '/auth/callback'
		)
			return
		const modToken = localStorage.getItem('moderator_token')
		if (modToken) {
			navigate('/moderator', { replace: true })
			return
		}
		supabase.auth.getSession().then(({ data: { session } }) => {
			if (
				session?.user?.email?.trim().toLowerCase() ===
				'dostup.support@gmail.com'
			) {
				navigate('/moderator', { replace: true })
			}
		})
	}, [location.pathname, navigate])

	// Signed in without any profile: the role picker comes first.
	useEffect(() => {
		if (!needsOnboarding || status !== 'authenticated') return
		if (ONBOARDING_ALLOWED_PATHS.has(location.pathname)) return
		navigate(ONBOARDING_PATH, { replace: true })
	}, [location.pathname, navigate, needsOnboarding, status])

	if (status === 'loading' && !isAuthCallback) {
		return <AuthSplash />
	}

	return (
		<>
			<div
				className={isLogin ? 'pointer-events-none' : undefined}
				aria-hidden={isLogin || undefined}
				ref={node => {
					if (!node) return
					if (isLogin) node.setAttribute('inert', '')
					else node.removeAttribute('inert')
				}}
			>
				<Routes location={underlayLocation}>
					<Route path='/' element={<MarketplacePage />} />
					<Route path='/new' element={<NewProductsPage sort="newest" />} />
					<Route path='/top-rated' element={<NewProductsPage sort="rating" />} />
					<Route path='/terms' element={<LegalPage docId='terms' />} />
					<Route path='/privacy' element={<LegalPage docId='privacy' />} />
					<Route path='/s/:handle' element={<StorefrontPage />} />
					<Route path='/p/:productId' element={<ProductPage />} />
					<Route path='/auth/callback' element={<AuthCallback />} />
					<Route path={ONBOARDING_PATH} element={<WelcomePage />} />
					<Route path='/product/:productId' element={<ProductRedirect />} />
					<Route
						path='/checkout/:productId'
						element={<ProductPurchasePage />}
					/>
					<Route
						path='/dashboard'
						element={
							<RequireProfile>
								<Dashboard />
							</RequireProfile>
						}
					/>
					<Route
						path='/dashboard/account'
						element={
							<RequireProfile>
								<Dashboard />
							</RequireProfile>
						}
					/>
					<Route
						path='/dashboard/announcements'
						element={
							<RequireProfile>
								<Dashboard />
							</RequireProfile>
						}
					/>
					<Route
						path='/dashboard/schedule'
						element={
							<RequireProfile>
								<Dashboard />
							</RequireProfile>
						}
					/>
					<Route
						path='/dashboard/materials'
						element={
							<RequireProfile>
								<Dashboard />
							</RequireProfile>
						}
					/>
					<Route
						path='/dashboard/notifications'
						element={
							<RequireProfile>
								<Dashboard />
							</RequireProfile>
						}
					/>
					<Route
						path='/creator'
						element={
							<RequireProfile>
								<CreatorDashboard />
							</RequireProfile>
						}
					/>
					<Route path='/teacher' element={<TeacherDashboard />} />
					<Route
						path='/school'
						element={
							<RequireProfile>
								<SchoolDashboard />
							</RequireProfile>
						}
					/>
					<Route path='/moderator' element={<ModeratorDashboard />} />
					<Route path='/install' element={<InstallPage />} />
					<Route path='*' element={<NotFound />} />
				</Routes>
			</div>
			{isLogin && (
				<Routes>
					<Route path='/login' element={<LoginPage />} />
				</Routes>
			)}
		</>
	)
}

const App = () => (
	<ErrorBoundary>
		<QueryClientProvider client={queryClient}>
			<LanguageProvider>
				<InstallPromptProvider>
					<SimpleAuthProvider>
						<AuthProvider>
							<TooltipProvider>
								<Toaster />
								<Sonner />
								<BrowserRouter>
									<ScrollManager />
									<AppRoutes />
								</BrowserRouter>
							</TooltipProvider>
						</AuthProvider>
					</SimpleAuthProvider>
				</InstallPromptProvider>
			</LanguageProvider>
		</QueryClientProvider>
	</ErrorBoundary>
)

export default App
