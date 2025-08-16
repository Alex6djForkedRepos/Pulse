import { Component, createSignal, Show, onMount, lazy, Suspense } from 'solid-js';
import { setBasicAuth } from '@/utils/apiClient';

// Force include FirstRunSetup with lazy loading
const FirstRunSetup = lazy(() => import('./FirstRunSetup').then(m => ({ default: m.FirstRunSetup })));

interface LoginProps {
  onLogin: () => void;
}

export const Login: Component<LoginProps> = (props) => {
  const [username, setUsername] = createSignal('');
  const [password, setPassword] = createSignal('');
  const [error, setError] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [authStatus, setAuthStatus] = createSignal<{ hasAuthentication: boolean } | null>(null);
  const [loadingAuth, setLoadingAuth] = createSignal(true);
  
  onMount(async () => {
    console.log('[Login] Starting auth check...');
    try {
      const response = await fetch('/api/security/status');
      console.log('[Login] Auth check response:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('[Login] Auth status data:', data);
        setAuthStatus(data);
      } else {
        console.log('[Login] Auth check failed, assuming no auth');
        // On error, assume no auth configured
        setAuthStatus({ hasAuthentication: false });
      }
    } catch (err) {
      console.error('[Login] Failed to check auth status:', err);
      // On error, assume no auth configured
      setAuthStatus({ hasAuthentication: false });
    } finally {
      console.log('[Login] Auth check complete, setting loading to false');
      setLoadingAuth(false);
    }
  });

  const handleSubmit = async (e: Event) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Test the credentials directly first
      const response = await fetch('/api/state', {
        headers: {
          'Authorization': `Basic ${btoa(`${username()}:${password()}`)}`,
          'X-Requested-With': 'XMLHttpRequest', // Prevent browser auth popup
          'Accept': 'application/json'
        },
        credentials: 'include' // Important for session cookie
      });

      if (response.ok) {
        // Credentials are valid, save them and notify parent
        setBasicAuth(username(), password());
        props.onLogin();
      } else if (response.status === 401) {
        setError('Invalid username or password');
        // Clear the input fields
        setUsername('');
        setPassword('');
      } else {
        setError('Server error. Please try again.');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  // Debug logging
  console.log('[Login] Render - loadingAuth:', loadingAuth(), 'authStatus:', authStatus());
  
  // Show loading state while checking auth status
  if (loadingAuth()) {
    return (
      <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900">
        <div class="text-center">
          <div class="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p class="text-gray-600 dark:text-gray-400">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Show FirstRunSetup if no authentication is configured
  const status = authStatus();
  
  if (status && status.hasAuthentication === false) {
    console.log('[Login] Showing FirstRunSetup because hasAuthentication is false');
    return (
      <Suspense fallback={
        <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900">
          <div class="text-center">
            <div class="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p class="text-gray-600 dark:text-gray-400">Loading setup...</p>
          </div>
        </div>
      }>
        <FirstRunSetup />
      </Suspense>
    );
  }

  // Show login form if authentication is configured
  return (
    <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-cyan-50 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900 py-12 px-4 sm:px-6 lg:px-8">
      <div class="max-w-md w-full space-y-8">
        <div class="animate-fade-in">
          <div class="flex justify-center mb-4">
            <div class="relative group">
              <div class="absolute -inset-1 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-full blur opacity-25 group-hover:opacity-75 transition duration-1000 group-hover:duration-200 animate-pulse-slow"></div>
              <img 
                src="/logo.svg" 
                alt="Pulse Logo" 
                class="relative w-24 h-24 transform transition duration-500 group-hover:scale-110"
              />
            </div>
          </div>
          <h2 class="mt-6 text-center text-3xl font-extrabold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            Welcome to Pulse
          </h2>
          <p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Enter your credentials to continue
          </p>
        </div>
        <form class="mt-8 space-y-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-lg rounded-lg p-8 shadow-xl animate-slide-up" onSubmit={handleSubmit}>
          <input type="hidden" name="remember" value="true" />
          <div class="space-y-4">
            <div class="relative">
              <label for="username" class="sr-only">
                Username
              </label>
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input
                id="username"
                name="username"
                type="text"
                autocomplete="username"
                required
                class="appearance-none relative block w-full pl-10 pr-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                placeholder="Username"
                value={username()}
                onInput={(e) => setUsername(e.currentTarget.value)}
              />
            </div>
            <div class="relative">
              <label for="password" class="sr-only">
                Password
              </label>
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg class="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                required
                class="appearance-none relative block w-full pl-10 pr-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                placeholder="Password"
                value={password()}
                onInput={(e) => setPassword(e.currentTarget.value)}
              />
            </div>
          </div>

          <Show when={error()}>
            <div class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <div class="flex">
                <div class="flex-shrink-0">
                  <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                  </svg>
                </div>
                <div class="ml-3">
                  <p class="text-sm text-red-800 dark:text-red-200">{error()}</p>
                </div>
              </div>
            </div>
          </Show>

          <div>
            <button
              type="submit"
              disabled={loading()}
              class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transform transition hover:scale-105 shadow-lg"
            >
              <Show when={loading()}>
                <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </Show>
              <Show when={loading()} fallback="Sign in to Pulse">
                Authenticating...
              </Show>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};