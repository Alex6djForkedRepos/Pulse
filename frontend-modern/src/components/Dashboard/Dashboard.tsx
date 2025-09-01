import { createSignal, createMemo, createEffect, Show } from 'solid-js';
import type { VM, Container, Node } from '@/types/api';
import { VirtualizedGuestTable } from './VirtualizedGuestTable';
import { useWebSocket } from '@/App';
import { getAlertStyles } from '@/utils/alerts';
import { createTooltipSystem } from '@/components/shared/Tooltip';
import { ComponentErrorBoundary } from '@/components/ErrorBoundary';
import { parseFilterStack, evaluateFilterStack } from '@/utils/searchQuery';
import { UnifiedNodeSelector } from '@/components/shared/UnifiedNodeSelector';
import { DashboardFilter } from './DashboardFilter';

interface DashboardProps {
  vms: VM[];
  containers: Container[];
  nodes: Node[];
}

type ViewMode = 'all' | 'vm' | 'lxc';
type StatusMode = 'all' | 'running' | 'stopped';
type GroupingMode = 'grouped' | 'flat';


export function Dashboard(props: DashboardProps) {
  const { connected, activeAlerts, initialDataReceived } = useWebSocket();
  const [search, setSearch] = createSignal('');
  const [isSearchLocked, setIsSearchLocked] = createSignal(false);
  const [selectedNode, setSelectedNode] = createSignal<string | null>(null);
  
  // Initialize from localStorage with proper type checking
  const storedViewMode = localStorage.getItem('dashboardViewMode');
  const [viewMode, setViewMode] = createSignal<ViewMode>(
    (storedViewMode === 'all' || storedViewMode === 'vm' || storedViewMode === 'lxc') ? storedViewMode : 'all'
  );
  
  // Sort nodes by cluster membership and name
  const sortedNodes = createMemo(() => {
    const nodes = [...props.nodes];
    return nodes.sort((a, b) => {
      // First, group by cluster membership (clustered first, then standalone)
      if (a.isClusterMember && !b.isClusterMember) return -1;
      if (!a.isClusterMember && b.isClusterMember) return 1;
      
      // Then sort by cluster name (if both are clustered)
      if (a.isClusterMember && b.isClusterMember && a.clusterName !== b.clusterName) {
        return (a.clusterName || '').localeCompare(b.clusterName || '');
      }
      
      // Finally, sort by node name
      return a.name.localeCompare(b.name);
    });
  });
  
  const storedStatusMode = localStorage.getItem('dashboardStatusMode');
  const [statusMode, setStatusMode] = createSignal<StatusMode>(
    (storedStatusMode === 'all' || storedStatusMode === 'running' || storedStatusMode === 'stopped') ? storedStatusMode : 'all'
  );
  
  // Grouping mode - grouped by node or flat list
  const storedGroupingMode = localStorage.getItem('dashboardGroupingMode');
  const [groupingMode, setGroupingMode] = createSignal<GroupingMode>(
    (storedGroupingMode === 'grouped' || storedGroupingMode === 'flat') ? storedGroupingMode : 'grouped'
  );
  
  
  const [showFilters, setShowFilters] = createSignal(
    localStorage.getItem('dashboardShowFilters') !== null 
      ? localStorage.getItem('dashboardShowFilters') === 'true'
      : false // Default to collapsed
  );
  
  // Sorting state - default to VMID ascending (matches Proxmox order)
  const [sortKey, setSortKey] = createSignal<string | null>('vmid');
  const [sortDirection, setSortDirection] = createSignal<'asc' | 'desc'>('asc');
  
  // Create tooltip system
  const TooltipComponent = createTooltipSystem();
  
  
  
  // Create a mapping from node name to host URL
  const nodeHostMap = createMemo(() => {
    const map: Record<string, string> = {};
    props.nodes.forEach(node => {
      if (node.host) {
        map[node.name] = node.host;
      }
    });
    return map;
  });
  
  // Persist filter states to localStorage
  createEffect(() => {
    localStorage.setItem('dashboardViewMode', viewMode());
  });
  
  createEffect(() => {
    localStorage.setItem('dashboardStatusMode', statusMode());
  });
  
  createEffect(() => {
    localStorage.setItem('dashboardGroupingMode', groupingMode());
  });
  
  
  
  createEffect(() => {
    localStorage.setItem('dashboardShowFilters', showFilters().toString());
  });
  

  // Sort handler
  const handleSort = (key: string) => {
    if (sortKey() === key) {
      // Toggle direction for the same column
      setSortDirection(sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      // New column - set key and default direction
      setSortKey(key);
      // Set default sort direction based on column type
      if (key === 'cpu' || key === 'memory' || key === 'disk' || key === 'diskRead' || 
          key === 'diskWrite' || key === 'networkIn' || key === 'networkOut' || key === 'uptime') {
        setSortDirection('desc');
      } else {
        setSortDirection('asc');
      }
    }
  };

  // Handle keyboard shortcuts
  let searchInputRef: HTMLInputElement | undefined;
  
  
  createEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      const isInputField = target.tagName === 'INPUT' || 
                          target.tagName === 'TEXTAREA' || 
                          target.tagName === 'SELECT' ||
                          target.contentEditable === 'true';
      
      // Escape key behavior
      if (e.key === 'Escape') {
        // First check if we have search/filters to clear (including tag filters)
        const hasActiveFilters = search().trim() || 
                                sortKey() !== 'vmid' || 
                                sortDirection() !== 'asc';
        
        if (hasActiveFilters) {
          // Clear ALL filters including search text and tag filters
          setSearch('');
          setIsSearchLocked(false);
          setSortKey('vmid');
          setSortDirection('asc');
          
          // Blur the search input if it's focused
          if (searchInputRef && document.activeElement === searchInputRef) {
            searchInputRef.blur();
          }
        } else if (showFilters()) {
          // No search/filters active, so collapse the filters section
          setShowFilters(false);
        }
        // If filters are already collapsed, do nothing
      } else if (!isInputField && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // If it's a printable character and user is not in an input field
        // Expand filters section if collapsed
        if (!showFilters()) {
          setShowFilters(true);
        }
        // Focus the search input and let the character be typed
        if (searchInputRef) {
          searchInputRef.focus();
          // Don't prevent default - let the character be typed
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  });
  

  // Combine VMs and containers into a single list
  const allGuests = createMemo(() => {
    const vms = props.vms || [];
    const containers = props.containers || [];
    const guests: (VM | Container)[] = [...vms, ...containers];
    return guests;
  });


  // Filter guests based on current settings
  const filteredGuests = createMemo(() => {
    let guests = allGuests();

    // Filter by selected node
    const node = selectedNode();
    console.log('Filtering guests - selected node:', node, 'total guests:', guests.length);
    if (node) {
      guests = guests.filter(g => g.node === node);
      console.log('After node filter:', guests.length);
    }

    // Filter by type
    if (viewMode() === 'vm') {
      guests = guests.filter(g => g.type === 'qemu');
    } else if (viewMode() === 'lxc') {
      guests = guests.filter(g => g.type === 'lxc');
    }

    // Filter by status
    if (statusMode() === 'running') {
      guests = guests.filter(g => g.status === 'running');
    } else if (statusMode() === 'stopped') {
      guests = guests.filter(g => g.status !== 'running');
    }

    // Apply search/filter
    const searchTerm = search().trim();
    if (searchTerm) {
      // Split by commas first
      const searchParts = searchTerm.split(',').map(t => t.trim()).filter(t => t);
      
      // Separate filters from text searches
      const filters: string[] = [];
      const textSearches: string[] = [];
      
      searchParts.forEach(part => {
        if (part.includes('>') || part.includes('<') || part.includes(':')) {
          filters.push(part);
        } else {
          textSearches.push(part.toLowerCase());
        }
      });
      
      // Apply filters if any
      if (filters.length > 0) {
        // Join filters with AND operator
        const filterString = filters.join(' AND ');
        const stack = parseFilterStack(filterString);
        if (stack.filters.length > 0) {
          guests = guests.filter(g => evaluateFilterStack(g, stack));
        }
      }
      
      // Apply text search if any
      if (textSearches.length > 0) {
        guests = guests.filter(g => 
          textSearches.some(term => 
            g.name.toLowerCase().includes(term) ||
            g.vmid.toString().includes(term) ||
            g.node.toLowerCase().includes(term) ||
            g.status.toLowerCase().includes(term)
          )
        );
      }
    }


    // Don't filter by thresholds anymore - dimming is handled in GuestRow component

    return guests;
  });

  // Group by node or return flat list based on grouping mode
  const groupedGuests = createMemo(() => {
    const guests = filteredGuests();
    
    // If flat mode, return all guests in a single group
    if (groupingMode() === 'flat') {
      const groups: Record<string, (VM | Container)[]> = { '': guests };
      // Sort the flat list
      const key = sortKey();
      const dir = sortDirection();
      if (key) {
        groups[''] = groups[''].sort((a, b) => {
          let aVal: string | number | boolean | null | undefined = (a as any)[key] as string | number | boolean | null | undefined;
          let bVal: string | number | boolean | null | undefined = (b as any)[key] as string | number | boolean | null | undefined;
          
          // Special handling for percentage-based columns
          if (key === 'cpu') {
            // CPU is displayed as percentage
            aVal = a.cpu * 100;
            bVal = b.cpu * 100;
          } else if (key === 'memory') {
            // Memory is displayed as percentage (use pre-calculated usage)
            aVal = a.memory ? (a.memory.usage || 0) : 0;
            bVal = b.memory ? (b.memory.usage || 0) : 0;
          } else if (key === 'disk') {
            // Disk is displayed as percentage
            aVal = a.disk.total > 0 ? (a.disk.used / a.disk.total) * 100 : 0;
            bVal = b.disk.total > 0 ? (b.disk.used / b.disk.total) * 100 : 0;
          }
          
          // Handle null/undefined/empty values - put at end for both asc and desc
          const aIsEmpty = aVal === null || aVal === undefined || aVal === '';
          const bIsEmpty = bVal === null || bVal === undefined || bVal === '';
          
          if (aIsEmpty && bIsEmpty) return 0;
          if (aIsEmpty) return 1;
          if (bIsEmpty) return -1;
          
          // Type-specific value preparation
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            // Numeric comparison
            const comparison = aVal < bVal ? -1 : 1;
            return dir === 'asc' ? comparison : -comparison;
          } else {
            // String comparison (case-insensitive)
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            
            if (aStr === bStr) return 0;
            const comparison = aStr < bStr ? -1 : 1;
            return dir === 'asc' ? comparison : -comparison;
          }
        });
      }
      return groups;
    }
    
    // Original grouped by node logic
    const groups: Record<string, (VM | Container)[]> = {};
    guests.forEach(guest => {
      if (!groups[guest.node]) {
        groups[guest.node] = [];
      }
      groups[guest.node].push(guest);
    });

    // Sort within each node group
    const key = sortKey();
    const dir = sortDirection();
    if (key) {
      Object.keys(groups).forEach(node => {
        groups[node] = groups[node].sort((a, b) => {
          let aVal: string | number | boolean | null | undefined = (a as any)[key] as string | number | boolean | null | undefined;
          let bVal: string | number | boolean | null | undefined = (b as any)[key] as string | number | boolean | null | undefined;
          
          // Special handling for percentage-based columns
          if (key === 'cpu') {
            // CPU is displayed as percentage
            aVal = a.cpu * 100;
            bVal = b.cpu * 100;
          } else if (key === 'memory') {
            // Memory is displayed as percentage (use pre-calculated usage)
            aVal = a.memory ? (a.memory.usage || 0) : 0;
            bVal = b.memory ? (b.memory.usage || 0) : 0;
          } else if (key === 'disk') {
            // Disk is displayed as percentage
            aVal = a.disk.total > 0 ? (a.disk.used / a.disk.total) * 100 : 0;
            bVal = b.disk.total > 0 ? (b.disk.used / b.disk.total) * 100 : 0;
          }
          
          // Handle null/undefined/empty values - put at end for both asc and desc
          const aIsEmpty = aVal === null || aVal === undefined || aVal === '';
          const bIsEmpty = bVal === null || bVal === undefined || bVal === '';
          
          if (aIsEmpty && bIsEmpty) return 0;
          if (aIsEmpty) return 1;
          if (bIsEmpty) return -1;
          
          // Type-specific value preparation
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            // Numeric comparison
            const comparison = aVal < bVal ? -1 : 1;
            return dir === 'asc' ? comparison : -comparison;
          } else {
            // String comparison (case-insensitive)
            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            
            if (aStr === bStr) return 0;
            const comparison = aStr < bStr ? -1 : 1;
            return dir === 'asc' ? comparison : -comparison;
          }
        });
      });
    }

    return groups;
  });

  const totalStats = createMemo(() => {
    const guests = filteredGuests();
    const running = guests.filter(g => g.status === 'running').length;
    const vms = guests.filter(g => g.type === 'qemu').length;
    const containers = guests.filter(g => g.type === 'lxc').length;
    return {
      total: guests.length,
      running,
      stopped: guests.length - running,
      vms,
      containers
    };
  });


  const handleNodeSelect = (nodeId: string | null, nodeType: 'pve' | 'pbs' | null) => {
    console.log('handleNodeSelect called:', nodeId, nodeType);
    // Track selected node for filtering
    if (nodeType === 'pve' || nodeType === null) {
      setSelectedNode(nodeId);
      console.log('Set selected node to:', nodeId);
      // Show filters if a node is selected
      if (nodeId && !showFilters()) {
        setShowFilters(true);
      }
    }
  };

  const handleTagClick = (tag: string) => {
    const currentSearch = search().trim();
    const tagFilter = `tags:${tag}`;
    
    // Check if this tag filter already exists
    if (currentSearch.includes(tagFilter)) {
      // Remove the tag filter
      let newSearch = currentSearch;
      
      // Handle different cases of where the tag filter might be
      if (currentSearch === tagFilter) {
        // It's the only filter
        newSearch = '';
      } else if (currentSearch.startsWith(tagFilter + ',')) {
        // It's at the beginning
        newSearch = currentSearch.replace(tagFilter + ',', '').trim();
      } else if (currentSearch.endsWith(', ' + tagFilter)) {
        // It's at the end
        newSearch = currentSearch.replace(', ' + tagFilter, '').trim();
      } else if (currentSearch.includes(', ' + tagFilter + ',')) {
        // It's in the middle
        newSearch = currentSearch.replace(', ' + tagFilter + ',', ',').trim();
      } else if (currentSearch.includes(tagFilter + ', ')) {
        // It's at the beginning with space after comma
        newSearch = currentSearch.replace(tagFilter + ', ', '').trim();
      }
      
      setSearch(newSearch);
      if (!newSearch) {
        setIsSearchLocked(false);
      }
    } else {
      // Add the tag filter
      if (!currentSearch || isSearchLocked()) {
        setSearch(tagFilter);
        setIsSearchLocked(false);
      } else {
        // Add tag filter to existing search with comma separator
        setSearch(`${currentSearch}, ${tagFilter}`);
      }
      
      // Make sure filters are visible
      if (!showFilters()) {
        setShowFilters(true);
      }
    }
  };



  return (
    <div>
      {/* Unified Node Selector */}
      <UnifiedNodeSelector 
        currentTab="dashboard"
        onNodeSelect={handleNodeSelect}
        nodes={props.nodes}
        filteredVms={filteredGuests().filter(g => g.type === 'qemu')}
        filteredContainers={filteredGuests().filter(g => g.type === 'lxc')}
        searchTerm={search()}
      />
      
      {/* Removed old node table - keeping the rest unchanged */}
      <Show when={false}>
        <div class="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-200 dark:border-gray-700">
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Node</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">CPU</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Memory</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Disk</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">VMs</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Containers</th>
                  <th class="px-2 py-1 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Uptime</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
                <For each={sortedNodes()}>
                  {(node) => {
                    const isOnline = () => node.status === 'online' && node.uptime > 0;
                    const cpuPercent = () => Math.round(node.cpu * 100);
                    const memPercent = () => Math.round(node.memory?.usage || 0);
                    const diskPercent = () => node.disk ? Math.round((node.disk.used / node.disk.total) * 100) : 0;
                    
                    // Count VMs and containers for this node
                    const nodeVMs = () => props.vms.filter(vm => vm.node === node.name).length;
                    const nodeContainers = () => props.containers.filter(ct => ct.node === node.name).length;
                    
                    const isSelected = () => search().includes(`node:${node.name}`);
                    
                    return (
                      <tr 
                        class={`hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors ${
                          isSelected() ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                        }`}
                        onClick={() => {
                          const currentSearch = search();
                          const nodeFilter = `node:${node.name}`;
                          
                          if (currentSearch.includes(nodeFilter)) {
                            setSearch(currentSearch.replace(nodeFilter, '').trim().replace(/,\s*,/g, ',').replace(/^,|,$/g, ''));
                            setIsSearchLocked(false);
                          } else {
                            const cleanedSearch = currentSearch.replace(/node:\w+/g, '').trim().replace(/,\s*,/g, ',').replace(/^,|,$/g, '');
                            const newSearch = cleanedSearch ? `${cleanedSearch}, ${nodeFilter}` : nodeFilter;
                            setSearch(newSearch);
                            setIsSearchLocked(true);
                            
                            if (!showFilters()) {
                              setShowFilters(true);
                            }
                          }
                        }}
                      >
                        <td class="p-1 px-2 whitespace-nowrap">
                          <div class="flex items-center gap-1">
                            <a 
                              href={node.host || `https://${node.name}:8006`}
                              target="_blank"
                              onClick={(e) => e.stopPropagation()}
                              class="font-medium text-xs text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400"
                            >
                              {node.name}
                            </a>
                            <Show when={node.isClusterMember !== undefined}>
                              <span class={`text-[9px] px-1 py-0 rounded text-[8px] font-medium ${
                                node.isClusterMember 
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400'
                              }`}>
                                {node.isClusterMember ? node.clusterName : 'Standalone'}
                              </span>
                            </Show>
                          </div>
                        </td>
                        <td class="p-1 px-2 whitespace-nowrap">
                          <div class="flex items-center gap-1">
                            <span class={`h-2 w-2 rounded-full ${
                              isOnline() ? 'bg-green-500' : 'bg-red-500'
                            }`} />
                            <span class="text-xs text-gray-600 dark:text-gray-400">
                              {isOnline() ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </td>
                        <td class="p-1 px-2 min-w-[180px]">
                          <MetricBar 
                            value={cpuPercent()} 
                            label={`${cpuPercent()}%`}
                            sublabel={node.cpuInfo?.cores ? `${node.cpuInfo.cores} cores` : undefined}
                            type="cpu"
                          />
                        </td>
                        <td class="p-1 px-2 min-w-[180px]">
                          <MetricBar 
                            value={memPercent()} 
                            label={`${memPercent()}%`}
                            sublabel={node.memory ? `${formatBytes(node.memory.used)}/${formatBytes(node.memory.total)}` : undefined}
                            type="memory"
                          />
                        </td>
                        <td class="p-1 px-2 min-w-[180px]">
                          <MetricBar 
                            value={diskPercent()} 
                            label={`${diskPercent()}%`}
                            sublabel={node.disk ? `${formatBytes(node.disk.used)}/${formatBytes(node.disk.total)}` : undefined}
                            type="disk"
                          />
                        </td>
                        <td class="p-1 px-2 whitespace-nowrap text-center">
                          <span class="text-xs text-gray-700 dark:text-gray-300">{nodeVMs()}</span>
                        </td>
                        <td class="p-1 px-2 whitespace-nowrap text-center">
                          <span class="text-xs text-gray-700 dark:text-gray-300">{nodeContainers()}</span>
                        </td>
                        <td class="p-1 px-2 whitespace-nowrap">
                          <span class="text-xs text-gray-600 dark:text-gray-400">
                            {formatUptime(node.uptime)}
                          </span>
                        </td>
                      </tr>
                    );
                  }}
                </For>
              </tbody>
            </table>
          </div>
        </div>
      </Show>
      
      {/* Dashboard Filter */}
      <DashboardFilter
        search={search}
        setSearch={setSearch}
        isSearchLocked={isSearchLocked}
        viewMode={viewMode}
        setViewMode={setViewMode}
        statusMode={statusMode}
        setStatusMode={setStatusMode}
        groupingMode={groupingMode}
        setGroupingMode={setGroupingMode}
        setSortKey={setSortKey}
        setSortDirection={setSortDirection}
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
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">Loading dashboard data...</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">Connecting to monitoring service</p>
          </div>
        </div>
      </Show>

      {/* Empty State - No PVE Nodes Configured */}
      <Show when={connected() && initialDataReceived() && props.nodes.filter(n => n.type === 'pve').length === 0 && props.vms.length === 0 && props.containers.length === 0}>
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
          <div class="text-center">
            <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">No Proxmox VE nodes configured</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400 mb-4">Add a Proxmox VE node in the Settings tab to start monitoring your infrastructure.</p>
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

      {/* Disconnected State */}
      <Show when={!connected()}>
        <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-600 rounded-lg p-8">
          <div class="text-center">
            <svg class="mx-auto h-12 w-12 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 class="text-sm font-medium text-red-800 dark:text-red-200 mb-2">Connection Lost</h3>
            <p class="text-xs text-red-700 dark:text-red-300">Unable to connect to the backend server. Attempting to reconnect...</p>
          </div>
        </div>
      </Show>

      {/* Table View - Always use virtualized table for consistency and performance */}
      <Show when={connected() && initialDataReceived() && filteredGuests().length > 0}>
        <VirtualizedGuestTable
          guests={filteredGuests()}
          groupedGuests={groupedGuests()}
          groupingMode={groupingMode()}
          sortKey={sortKey()}
          sortDirection={sortDirection()}
          activeAlerts={activeAlerts}
          getAlertStyles={getAlertStyles}
          handleTagClick={handleTagClick}
          handleSort={handleSort}
          search={search()}
          nodeHostMap={nodeHostMap()}
        />
      </Show>

      <Show when={connected() && initialDataReceived() && filteredGuests().length === 0 && (props.vms.length > 0 || props.containers.length > 0)}>
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8 mb-4">
          <div class="text-center">
            <svg class="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h3 class="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">No guests found</h3>
            <p class="text-xs text-gray-600 dark:text-gray-400">
              {search() && search().trim() !== '' 
                ? `No guests match your search "${search()}"` 
                : 'No guests match your current filters'}
            </p>
          </div>
        </div>
      </Show>
      
      {/* Stats */}
      <Show when={connected() && initialDataReceived()}>
      <div class="mb-4">
        <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded">
          <span class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <span class="h-2 w-2 bg-green-500 rounded-full"></span>
            {totalStats().running} running
          </span>
          <span class="text-gray-400">|</span>
          <span class="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
            <span class="h-2 w-2 bg-red-500 rounded-full"></span>
            {totalStats().stopped} stopped
          </span>
        </div>
      </div>
      </Show>
      
      
      {/* Tooltip System */}
      <TooltipComponent />
    </div>
  );
}