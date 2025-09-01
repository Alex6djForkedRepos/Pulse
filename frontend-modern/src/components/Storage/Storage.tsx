import { Component, For, Show, createSignal, createMemo, createEffect } from 'solid-js';
import { useWebSocket } from '@/App';
import { getAlertStyles } from '@/utils/alerts';
import { formatBytes } from '@/utils/format';
import { createTooltipSystem } from '@/components/shared/Tooltip';
import type { Storage as StorageType } from '@/types/api';
import { ComponentErrorBoundary } from '@/components/ErrorBoundary';
import { UnifiedNodeSelector } from '@/components/shared/UnifiedNodeSelector';
import { StorageFilter } from './StorageFilter';
import { VirtualizedStorage } from './VirtualizedStorage';


const Storage: Component = () => {
  const { state, connected, activeAlerts, initialDataReceived } = useWebSocket();
  const [viewMode, setViewMode] = createSignal<'node' | 'storage'>('node');
  const [searchTerm, setSearchTerm] = createSignal('');
  const [selectedNode, setSelectedNode] = createSignal<string | null>(null);
  // TODO: Implement sorting in sortedStorage function
  // const [sortKey, setSortKey] = createSignal('name');
  // const [sortDirection, setSortDirection] = createSignal<'asc' | 'desc'>('asc');
  
  // Create tooltip system
  const TooltipComponent = createTooltipSystem();
  
  // Create a mapping from node name to host URL
  const nodeHostMap = createMemo(() => {
    const map: Record<string, string> = {};
    (state.nodes || []).forEach(node => {
      if (node.host) {
        map[node.name] = node.host;
      }
    });
    return map;
  });
  
  // Load preferences from localStorage
  createEffect(() => {
    const savedViewMode = localStorage.getItem('storageViewMode');
    if (savedViewMode === 'storage') setViewMode('storage');
  });
  
  // Save preferences to localStorage
  createEffect(() => {
    localStorage.setItem('storageViewMode', viewMode());
  });
  
  
  // Filter storage - in storage view, filter out 0 capacity
  const filteredStorage = createMemo(() => {
    let storage = state.storage || [];
    
    // In storage view, filter out 0 capacity
    if (viewMode() === 'storage') {
      storage = storage.filter(s => s.total > 0);
    }
    
    return storage;
  });
  
  // Sort and filter storage
  const sortedStorage = createMemo(() => {
    let storage = [...filteredStorage()];
    
    // Apply node selection filter
    const nodeFilter = selectedNode();
    if (nodeFilter) {
      storage = storage.filter(s => s.node.toLowerCase() === nodeFilter.toLowerCase());
    }
    
    // Apply search filter
    const search = searchTerm().toLowerCase();
    if (search) {
      // Regular search
      storage = storage.filter(s => 
        s.name.toLowerCase().includes(search) ||
        s.node.toLowerCase().includes(search) ||
        s.type.toLowerCase().includes(search) ||
        s.content?.toLowerCase().includes(search) ||
        (s.status && s.status.toLowerCase().includes(search))
      );
    }
    
    // Always sort by name alphabetically for consistent order
    return storage.sort((a, b) => a.name.localeCompare(b.name));
  });
  
  // Group storage by node or storage
  const groupedStorage = createMemo(() => {
    const storage = sortedStorage();
    const mode = viewMode();
    
    if (mode === 'node') {
      const groups: Record<string, StorageType[]> = {};
      storage.forEach(s => {
        if (!groups[s.node]) groups[s.node] = [];
        groups[s.node].push(s);
      });
      return groups;
    } else {
      // Group by storage name - show all storage as-is for maximum compatibility
      const groups: Record<string, StorageType[]> = {};
      
      storage.forEach(s => {
        if (!groups[s.name]) groups[s.name] = [];
        groups[s.name].push(s);
      });
      
      return groups;
    }
  });
  
  const getProgressBarColor = (usage: number) => {
    // Match MetricBar component styling exactly - disk type thresholds
    if (usage >= 90) return 'bg-red-500/60 dark:bg-red-500/50';
    if (usage >= 80) return 'bg-yellow-500/60 dark:bg-yellow-500/50';
    return 'bg-green-500/60 dark:bg-green-500/50';
  };
  
  const resetFilters = () => {
    setSearchTerm('');
    setSelectedNode(null);
    setViewMode('node');
    // setSortKey('name');
    // setSortDirection('asc');
  };
  
  
  // Handle keyboard shortcuts
  let searchInputRef: HTMLInputElement | undefined;
  
  createEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.tagName === 'SELECT' ||
                          target.contentEditable === 'true';
      
      // Escape key behavior
      if (e.key === 'Escape') {
        // Clear search and reset filters
        if (searchTerm().trim() || selectedNode() || viewMode() !== 'node') {
          resetFilters();
          
          // Blur the search input if it's focused
          if (searchInputRef && document.activeElement === searchInputRef) {
            searchInputRef.blur();
          }
        }
      } else if (!isInputField && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // If it's a printable character and user is not in an input field
        // Focus the search input and let the character be typed
        if (searchInputRef) {
          searchInputRef.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });
  
  const handleNodeSelect = (nodeId: string | null) => {
    setSelectedNode(nodeId);
  };

  return (
    <div>
      {/* Node Selector */}
      <UnifiedNodeSelector 
        currentTab="storage" 
        onNodeSelect={handleNodeSelect}
        filteredStorage={sortedStorage()}
        searchTerm={searchTerm()}
      />
      
      {/* Storage Filter */}
      <StorageFilter
        search={searchTerm}
        setSearch={setSearchTerm}
        groupBy={viewMode}
        setGroupBy={setViewMode}
        setSortKey={() => {}}
        setSortDirection={() => {}}
        searchInputRef={(el) => searchInputRef = el}
      />
      
      {/* Loading State */}
      <Show when={connected() && !initialDataReceived()}>
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
          <div class="text-center">
            <svg class="animate-spin mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Loading storage data...</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">Connecting to monitoring service</p>
          </div>
        </div>
      </Show>

      {/* Helpful hint for no PVE nodes but still show content */}
      <Show when={connected() && initialDataReceived() && (state.nodes || []).filter((n) => n.type === 'pve').length === 0 && sortedStorage().length === 0 && searchTerm().trim() === ''}>
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
          <div class="text-center">
            <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">No storage configured</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-4">Add a Proxmox VE or PBS node in the Settings tab to start monitoring storage.</p>
            <button type="button"
              onClick={() => {
                const settingsTab = document.querySelector('[role="tab"]:last-child') as HTMLElement;
                settingsTab?.click();
              }}
              class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Go to Settings
            </button>
          </div>
        </div>
      </Show>
      
      {/* No results found message */}
      <Show when={connected() && initialDataReceived() && sortedStorage().length === 0 && searchTerm().trim() !== ''}>
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
          <div class="text-center">
            <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">No storage found</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">No storage matches your search "{searchTerm()}"</p>
          </div>
        </div>
      </Show>
      
      {/* Storage Table - shows for both PVE and PBS storage */}
      <Show when={connected() && initialDataReceived() && sortedStorage().length > 0}>
        <ComponentErrorBoundary name="Storage Table">
          <VirtualizedStorage
            storage={sortedStorage()}
            viewMode={viewMode()}
            activeAlerts={activeAlerts}
            nodeHostMap={nodeHostMap()}
          />
        </ComponentErrorBoundary>
      </Show>
      
      {/* Tooltip System */}
      <TooltipComponent />
    </div>
  );
};

export default Storage;