import { Show, createSignal } from 'solid-js';
import { updateStore } from '@/stores/updates';

export function UpdateBanner() {
  const [isExpanded, setIsExpanded] = createSignal(false);
  
  // Get deployment type message
  const getUpdateInstructions = () => {
    const versionInfo = updateStore.versionInfo();
    const deploymentType = versionInfo?.deploymentType || 'systemd';
    
    switch (deploymentType) {
      case 'proxmoxve':
        return "ProxmoxVE users: type 'update' in console";
      case 'docker':
        return 'Docker: pull latest image';
      case 'source':
        return 'Source: pull and rebuild';
      default:
        return '';  // No message, just the version info
    }
  };
  
  const getShortMessage = () => {
    const info = updateStore.updateInfo();
    if (!info) return '';
    return `New version available: ${info.latestVersion}`;
  };
  
  return (
    <Show when={updateStore.isUpdateVisible()}>
      <div class="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 relative animate-slideDown">
        <div class="px-4 py-1.5">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              {/* Update icon */}
              <svg class="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2v6m0 0l3-3m-3 3l-3-3" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M2 17l.621 2.485A2 2 0 0 0 4.561 21h14.878a2 2 0 0 0 1.94-1.515L22 17" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium">{getShortMessage()}</span>
                {!isExpanded() && getUpdateInstructions() && (
                  <>
                    <span class="text-blue-600 dark:text-blue-400 text-sm hidden sm:inline">•</span>
                    <span class="text-blue-600 dark:text-blue-400 text-sm hidden sm:inline">{getUpdateInstructions()}</span>
                  </>
                )}
                {!isExpanded() && (
                  <a 
                    href={`https://github.com/rcourtman/Pulse/releases/tag/${updateStore.updateInfo()?.latestVersion}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 dark:text-blue-400 underline text-sm hidden sm:inline hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    View details →
                  </a>
                )}
              </div>
            </div>
            
            <div class="flex items-center gap-2">
              {/* Expand/Collapse button */}
              <button
                onClick={() => setIsExpanded(!isExpanded())}
                class="p-1 hover:bg-blue-100 dark:hover:bg-blue-800/30 rounded transition-colors"
                title={isExpanded() ? 'Show less' : 'Show more'}
              >
                <svg 
                  class={`w-4 h-4 transform transition-transform ${isExpanded() ? 'rotate-180' : ''}`} 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  stroke-width="2"
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
              
              {/* Dismiss button */}
              <button
                onClick={() => updateStore.dismissUpdate()}
                class="p-1 hover:bg-blue-100 dark:hover:bg-blue-800/30 rounded transition-colors"
                title="Dismiss this update"
              >
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          </div>
          
          {/* Expanded content */}
          <Show when={isExpanded()}>
            <div class="mt-2 pb-1">
              <div class="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                <p>
                  <span class="font-medium">Current:</span> {updateStore.versionInfo()?.version || 'Unknown'} → 
                  <span class="font-medium ml-1">Latest:</span> {updateStore.updateInfo()?.latestVersion}
                </p>
                {getUpdateInstructions() && (
                  <p>
                    <span class="font-medium">Quick upgrade:</span> {getUpdateInstructions()}
                  </p>
                )}
                <Show when={updateStore.updateInfo()?.isPrerelease}>
                  <p class="text-orange-600 dark:text-orange-400 text-xs">This is a pre-release version</p>
                </Show>
                <div class="flex gap-3 mt-2">
                  <a 
                    href={`https://github.com/rcourtman/Pulse/releases/tag/${updateStore.updateInfo()?.latestVersion}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-blue-600 dark:text-blue-400 underline hover:text-blue-700 dark:hover:text-blue-300 text-xs"
                  >
                    View release notes
                  </a>
                  <button
                    onClick={() => updateStore.dismissUpdate()}
                    class="text-blue-600/70 dark:text-blue-400/70 hover:text-blue-700 dark:hover:text-blue-300 text-xs underline"
                  >
                    Don't show again for this version
                  </button>
                </div>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}