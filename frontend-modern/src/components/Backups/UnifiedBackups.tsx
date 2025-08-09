import { Component, createSignal, Show, For, createMemo, createEffect } from 'solid-js';
import { useWebSocket } from '@/App';
import { formatBytes, formatAbsoluteTime, formatRelativeTime } from '@/utils/format';
import { createLocalStorageBooleanSignal, STORAGE_KEYS } from '@/utils/localStorage';

type BackupType = 'snapshot' | 'local' | 'remote';
type GuestType = 'VM' | 'LXC' | 'Template' | 'ISO';

interface UnifiedBackup {
  backupType: BackupType;
  vmid: number;
  name: string;
  type: GuestType;
  node: string;
  backupTime: number;
  backupName: string;
  description: string;
  status: string;
  size: number | null;
  storage: string | null;
  datastore: string | null;
  namespace: string | null;
  verified: boolean | null;
  protected: boolean;
}

// Types for PBS backups - temporarily disabled to avoid unused warnings
// type PBSBackup = any;
// type PBSSnapshot = any;

interface DateGroup {
  label: string;
  items: UnifiedBackup[];
}

const UnifiedBackups: Component = () => {
  const { state } = useWebSocket();
  const [searchTerm, setSearchTerm] = createSignal('');
  const [typeFilter, setTypeFilter] = createSignal<'all' | GuestType>('all');
  const [backupTypeFilter, setBackupTypeFilter] = createSignal<'all' | BackupType>('all');
  const [sortKey, setSortKey] = createSignal<keyof UnifiedBackup>('backupTime');
  const [sortDirection, setSortDirection] = createSignal<'asc' | 'desc'>('desc');
  const [selectedDateRange, setSelectedDateRange] = createSignal<{ start: number; end: number } | null>(null);
  const [chartTimeRange, setChartTimeRange] = createSignal(30);
  const [tooltip, setTooltip] = createSignal<{ text: string; x: number; y: number } | null>(null);
  const [showFilters, setShowFilters] = createLocalStorageBooleanSignal(
    STORAGE_KEYS.BACKUPS_SHOW_FILTERS,
    false // Default to collapsed
  );
  const [useRelativeTime, setUseRelativeTime] = createLocalStorageBooleanSignal(
    STORAGE_KEYS.BACKUPS_USE_RELATIVE_TIME,
    false // Default to absolute time
  );

  // Helper functions
  const getDaySuffix = (day: number) => {
    if (day >= 11 && day <= 13) return 'th';
    switch (day % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  };

  const truncateMiddle = (str: string, maxLength: number) => {
    if (!str || str.length <= maxLength) return str;
    const start = Math.ceil(maxLength / 2) - 2;
    const end = Math.floor(maxLength / 2) - 2;
    return str.substring(0, start) + '...' + str.substring(str.length - end);
  };

  const formatTime = (timestamp: number) => {
    return useRelativeTime() ? formatRelativeTime(timestamp) : formatAbsoluteTime(timestamp);
  };

  // Check if we have any backup data yet
  const isLoading = createMemo(() => {
    return !state.pveBackups?.guestSnapshots && 
           !state.pveBackups?.storageBackups && 
           !state.pbsBackups?.length && 
           !state.pbs?.length;
  });

  // Normalize all backup data into unified format
  const normalizedData = createMemo(() => {
    const unified: UnifiedBackup[] = [];
    const seenBackups = new Set<string>(); // Track backups to avoid duplicates
    
    // Debug mode - remove in production
    const debugMode = false;

    // Normalize snapshots
    state.pveBackups?.guestSnapshots?.forEach((snapshot) => {
      unified.push({
        backupType: 'snapshot',
        vmid: snapshot.vmid,
        name: snapshot.name || '',
        type: snapshot.type === 'qemu' ? 'VM' : 'LXC',
        node: snapshot.node,
        backupTime: snapshot.time ? new Date(snapshot.time).getTime() / 1000 : 0,
        backupName: snapshot.name,
        description: snapshot.description || '',
        status: 'ok',
        size: null,
        storage: null,
        datastore: null,
        namespace: null,
        verified: null,
        protected: false
      });
    });

    // Process PBS backups FIRST from the new Go backend (state.pbsBackups)
    // This ensures we have the complete PBS data with namespaces
    state.pbsBackups?.forEach((backup) => {
      const backupDate = new Date(backup.backupTime);
      const dateStr = backupDate.toISOString().split('T')[0];
      const timeStr = backupDate.toISOString().split('T')[1].split('.')[0].replace(/:/g, '');
      const backupName = `${backup.backupType}/${backup.vmid}/${dateStr}_${timeStr}`;
      
      // Create a key that matches the format used by PVE storage backups
      // Use just the timestamp in seconds (Unix time) to match ctime format
      const backupTimeSeconds = Math.floor(backupDate.getTime() / 1000);
      const backupKey = `${backup.vmid}-${backupTimeSeconds}`;
      seenBackups.add(backupKey);
      
      if (debugMode) {
        console.log(`PBS backup: vmid=${backup.vmid}, time=${backupTimeSeconds}, key=${backupKey}, verified=${backup.verified}`);
      }
      
      unified.push({
        backupType: 'remote',
        vmid: parseInt(backup.vmid) || 0,
        name: backup.comment || '',
        type: (backup.backupType === 'vm' || backup.backupType === 'VM') ? 'VM' : 'LXC',
        node: backup.instance || 'PBS',
        backupTime: backupTimeSeconds,
        backupName: backupName,
        description: backup.comment || '',
        status: backup.verified ? 'verified' : 'unverified',
        size: backup.size || null,
        storage: null,
        datastore: backup.datastore || null,
        namespace: backup.namespace || 'root',
        verified: backup.verified || false,
        protected: backup.protected || false
      });
    });

    // Normalize local backups (including PBS through PVE storage)
    state.pveBackups?.storageBackups?.forEach((backup) => {
      // Skip templates and ISOs - they're not backups
      if (backup.type === 'vztmpl' || backup.type === 'iso') {
        return;
      }
      
      // Determine if this is actually a PBS backup based on storage
      const backupType = backup.isPBS ? 'remote' : 'local';
      
      // Skip PBS backups that we already have from direct PBS API
      if (backup.isPBS && backup.volid) {
        // Check if we already have this from PBS API using the same key format
        const backupKey = `${backup.vmid}-${backup.ctime}`;
        
        if (debugMode) {
          console.log(`PVE storage backup: vmid=${backup.vmid}, ctime=${backup.ctime}, key=${backupKey}, isPBS=${backup.isPBS}, skip=${seenBackups.has(backupKey)}`);
        }
        
        if (seenBackups.has(backupKey)) {
          return; // Skip duplicate
        }
      }
      
      // Determine the display type based on backup.type
      let displayType: GuestType;
      if (backup.type === 'qemu') {
        displayType = 'VM';
      } else if (backup.type === 'lxc') {
        displayType = 'LXC';
      } else {
        displayType = 'LXC'; // Default fallback (most people have more containers than VMs)
      }
      
      unified.push({
        backupType: backupType,
        vmid: backup.vmid || 0,
        name: backup.notes || backup.volid?.split('/').pop() || '',
        type: displayType,
        node: backup.node || '',
        backupTime: backup.ctime || 0,
        backupName: backup.volid?.split('/').pop() || '',
        description: backup.notes || '', // Use notes field for PBS backup descriptions
        status: 'ok', // PVE storage doesn't provide verification status
        size: backup.size || null,
        storage: backup.storage || null,
        datastore: backup.isPBS ? backup.storage : null,
        namespace: backup.isPBS ? 'root' : null,
        verified: null, // PVE storage doesn't provide verification status
        protected: backup.protected || false
      });
    });


    // Normalize PBS backups
    // NOTE: Legacy code - PBS backups are now handled differently in the Go backend
    // The 'backups' field doesn't exist on PBSInstance anymore, and 'snapshots' field
    // doesn't exist on PBSDatastore. This code is kept for reference but commented out.
    
    /*
    state.pbs?.forEach((pbsInstance) => {
      // Check if backups are at the instance level
      if (pbsInstance.backups && Array.isArray(pbsInstance.backups)) {
        pbsInstance.backups.forEach((backup: PBSBackup) => {
          unified.push({
            backupType: 'remote',
            vmid: backup.vmid || 0,
            name: backup.guestName || '',
            type: backup.type === 'vm' || backup.type === 'qemu' ? 'VM' : 'LXC',
            node: pbsInstance.name || 'PBS',
            backupTime: backup.ctime || backup.backupTime || 0,
            backupName: `${backup.vmid}/${new Date((backup.ctime || backup.backupTime || 0) * 1000).toISOString().split('T')[0]}`,
            description: backup.notes || backup.comment || '',
            status: backup.verified ? 'verified' : 'unverified',
            size: backup.size || null,
            storage: null,
            datastore: backup.datastore || null,
            namespace: backup.namespace || 'root',
            verified: backup.verified || false,
            protected: backup.protected || false
          });
        });
      }
      
      // Also check datastores for snapshots (original JS structure)
      if (pbsInstance.datastores && Array.isArray(pbsInstance.datastores)) {
        pbsInstance.datastores?.forEach((datastore) => {
          if (datastore.snapshots && Array.isArray(datastore.snapshots)) {
            datastore.snapshots.forEach((backup: PBSSnapshot) => {
              let totalSize = 0;
              if (backup.files && Array.isArray(backup.files)) {
                totalSize = backup.files.reduce((sum: number, file) => sum + (file.size || 0), 0);
              }
              
              unified.push({
                backupType: 'remote',
                vmid: backup['backup-id'] || 0,
                name: backup.comment || '',
                type: backup['backup-type'] === 'vm' || backup['backup-type'] === 'qemu' ? 'VM' : 'LXC',
                node: pbsInstance.name || 'PBS',
                backupTime: backup['backup-time'] || 0,
                backupName: `${backup['backup-id']}/${new Date((backup['backup-time'] || 0) * 1000).toISOString().split('T')[0]}`,
                description: backup.comment || '',
                status: backup.verified ? 'verified' : 'unverified',
                size: totalSize || null,
                storage: null,
                datastore: datastore.name || null,
                namespace: backup.namespace || 'root',
                verified: backup.verified || false,
                protected: backup.protected || false
              });
            });
          }
        });
      }
    });
    */

    return unified;
  });

  // Apply filters
  const filteredData = createMemo(() => {
    let data = normalizedData();
    const search = searchTerm().toLowerCase();
    const type = typeFilter();
    const backupType = backupTypeFilter();
    const dateRange = selectedDateRange();

    // Date range filter
    if (dateRange) {
      data = data.filter(item => 
        item.backupTime >= dateRange.start && item.backupTime <= dateRange.end
      );
    }

    // Search filter
    if (search) {
      const searchTerms = search.split(',').map(term => term.trim()).filter(term => term.length > 0);
      data = data.filter(item => 
        searchTerms.some(term => {
          const searchFields = [
            item.vmid?.toString(),
            item.name,
            item.node,
            item.backupName,
            item.description,
            item.storage,
            item.datastore,
            item.namespace
          ].filter(Boolean).map(field => field!.toString().toLowerCase());
          
          return searchFields.some(field => field.includes(term));
        })
      );
    }

    // Type filter
    if (type !== 'all') {
      data = data.filter(item => item.type === type);
    }

    // Backup type filter
    if (backupType !== 'all') {
      data = data.filter(item => item.backupType === backupType);
    }

    // Sort
    const key = sortKey();
    const dir = sortDirection();
    data = [...data].sort((a, b) => {
      let aVal = a[key];
      let bVal = b[key];
      
      // Handle null/undefined/empty values - put at end for both asc and desc
      const aIsEmpty = aVal === null || aVal === undefined || aVal === '';
      const bIsEmpty = bVal === null || bVal === undefined || bVal === '';
      
      if (aIsEmpty && bIsEmpty) return 0;
      if (aIsEmpty) return 1;
      if (bIsEmpty) return -1;
      
      // Type-specific value preparation
      if (key === 'size' || key === 'vmid' || key === 'backupTime') {
        // Ensure numeric comparison
        aVal = typeof aVal === 'number' ? aVal : Number(aVal) || 0;
        bVal = typeof bVal === 'number' ? bVal : Number(bVal) || 0;
      }
      
      // Type-safe comparison
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        if (aVal === bVal) return 0;
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

    return data;
  });

  // Group by date
  const groupedData = createMemo(() => {
    // If sorting by time, show date groups
    // Otherwise, show all items in a single group to preserve sort order
    if (sortKey() !== 'backupTime') {
      return [{
        label: 'All Backups',
        items: filteredData()
      }];
    }

    const groups: DateGroup[] = [];
    const groupMap = new Map<string, UnifiedBackup[]>();
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                    'July', 'August', 'September', 'October', 'November', 'December'];

    filteredData().forEach(item => {
      const date = new Date(item.backupTime * 1000);
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      
      let label: string;
      const month = months[date.getMonth()];
      const day = date.getDate();
      const suffix = getDaySuffix(day);
      const absoluteDate = `${month} ${day}${suffix}`;
      
      if (dateOnly.getTime() === today.getTime()) {
        label = `Today (${absoluteDate})`;
      } else if (dateOnly.getTime() === yesterday.getTime()) {
        label = `Yesterday (${absoluteDate})`;
      } else {
        label = absoluteDate;
      }
      
      if (!groupMap.has(label)) {
        groupMap.set(label, []);
      }
      groupMap.get(label)!.push(item);
    });

    // Convert to array
    groupMap.forEach((items, label) => {
      groups.push({ label, items });
    });

    // Sort groups based on sort direction
    if (sortDirection() === 'desc') {
      // Most recent first
      groups.sort((a, b) => {
        if (a.label.includes('Today')) return -1;
        if (b.label.includes('Today')) return 1;
        if (a.label.includes('Yesterday')) return b.label.includes('Today') ? 1 : -1;
        if (b.label.includes('Yesterday')) return a.label.includes('Today') ? -1 : 1;
        
        // For other dates, use the first item's date
        const dateA = a.items[0]?.backupTime || 0;
        const dateB = b.items[0]?.backupTime || 0;
        return dateB - dateA;
      });
    } else {
      // Oldest first
      groups.sort((a, b) => {
        if (a.label.includes('Today')) return 1;
        if (b.label.includes('Today')) return -1;
        if (a.label.includes('Yesterday')) return a.label.includes('Today') ? -1 : 1;
        if (b.label.includes('Yesterday')) return b.label.includes('Today') ? 1 : -1;
        
        // For other dates, use the first item's date
        const dateA = a.items[0]?.backupTime || 0;
        const dateB = b.items[0]?.backupTime || 0;
        return dateA - dateB;
      });
    }

    // Sort items within each group by time (already sorted by filteredData, but we need to maintain it)
    // The items come pre-sorted from filteredData(), so we don't need to re-sort them

    return groups;
  });

  // Sort handler
  const handleSort = (key: keyof UnifiedBackup) => {
    if (sortKey() === key) {
      // Toggle direction for the same column
      const newDir = sortDirection() === 'asc' ? 'desc' : 'asc';
      setSortDirection(newDir);
    } else {
      // New column - set key and default direction
      setSortKey(key);
      // Set default sort direction based on column type
      // For time and size, default to descending (newest/largest first)
      // For others, default to ascending
      if (key === 'backupTime' || key === 'size') {
        setSortDirection('desc');
      } else {
        setSortDirection('asc');
      }
    }
  };

  // Reset filters
  const resetFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setBackupTypeFilter('all');
    setSortKey('backupTime');
    setSortDirection('desc');
    setSelectedDateRange(null);
    setChartTimeRange(30);
  };

  // localStorage persistence is now handled by createLocalStorageBooleanSignal
  
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
        // First check if we have search/filters to clear
        if (searchTerm().trim() || typeFilter() !== 'all' || backupTypeFilter() !== 'all' || 
            selectedDateRange() !== null || sortKey() !== 'backupTime' || sortDirection() !== 'desc') {
          // Clear search and reset filters
          resetFilters();
          
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

  // Get age color class
  const getAgeColorClass = (timestamp: number) => {
    if (!timestamp) return 'text-gray-500 dark:text-gray-400';
    
    const now = Date.now() / 1000;
    const diff = now - timestamp;
    const days = diff / 86400;
    
    if (days < 3) return 'text-green-600 dark:text-green-400';
    if (days < 7) return 'text-yellow-600 dark:text-yellow-400';
    if (days < 30) return 'text-orange-500 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };

  // Get size color class
  const getSizeColor = (size: number | null) => {
    if (!size) return '';
    const gb = size / (1024 * 1024 * 1024);
    if (gb < 5) return 'text-green-600 dark:text-green-400';
    if (gb < 20) return 'text-yellow-600 dark:text-yellow-400';
    if (gb < 50) return 'text-orange-600 dark:text-orange-400';
    return 'text-red-600 dark:text-red-400';
  };


  // Calculate backup frequency data for chart
  const chartData = createMemo(() => {
    const days = chartTimeRange();
    const now = new Date();
    
    // Initialize data structure for each day
    const dailyData: { [key: string]: { snapshots: number; pve: number; pbs: number; total: number } } = {};
    
    // Create entries for each day in the range, including today
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      // Use local date string format (YYYY-MM-DD) instead of ISO to avoid timezone issues
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      dailyData[dateKey] = { snapshots: 0, pve: 0, pbs: 0, total: 0 };
    }
    
    // Calculate the actual start and end times for filtering
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);
    const startTime = startDate.getTime();
    
    const endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
    const endTime = endDate.getTime();
    
    // Use filtered data but WITHOUT date range filter for the chart
    // The chart should show the time range, and filters should affect what's counted
    let dataForChart = normalizedData();
    const search = searchTerm().toLowerCase();
    const type = typeFilter();
    const backupType = backupTypeFilter();
    
    // Apply search filter
    if (search) {
      const searchTerms = search.split(',').map(term => term.trim()).filter(term => term.length > 0);
      dataForChart = dataForChart.filter(item => 
        searchTerms.some(term => {
          const searchFields = [
            item.vmid?.toString(),
            item.name,
            item.node,
            item.backupName,
            item.description,
            item.storage,
            item.datastore,
            item.namespace
          ].filter(Boolean).map(field => field!.toString().toLowerCase());
          
          return searchFields.some(field => field.includes(term));
        })
      );
    }
    
    // Apply type filter
    if (type !== 'all') {
      dataForChart = dataForChart.filter(item => item.type === type);
    }
    
    // Apply backup type filter
    if (backupType !== 'all') {
      dataForChart = dataForChart.filter(item => item.backupType === backupType);
    }
    
    // Count backups per day within the chart time range
    dataForChart.forEach(backup => {
      const backupTime = backup.backupTime * 1000;
      if (backupTime >= startTime && backupTime <= endTime) {
        const date = new Date(backupTime);
        // Use local date string format (YYYY-MM-DD) to match the keys we created
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;
        
        if (dailyData[dateKey]) {
          dailyData[dateKey].total++;
          if (backup.backupType === 'snapshot') {
            dailyData[dateKey].snapshots++;
          } else if (backup.backupType === 'local') {
            dailyData[dateKey].pve++;
          } else if (backup.backupType === 'remote') {
            dailyData[dateKey].pbs++;
          }
        }
      }
    });
    
    // Convert to array and calculate max value for scaling
    const dataArray = Object.entries(dailyData).map(([date, counts]) => ({
      date,
      ...counts
    }));
    
    const maxValue = Math.max(...dataArray.map(d => d.total), 1);
    
    return { data: dataArray, maxValue };
  });


  return (
    <div class="space-y-4">
      {/* Backup Frequency Chart */}
      <div class="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
        <div class="flex justify-between items-center mb-3">
          <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300">Backup Frequency</h3>
          <div class="flex items-center gap-2 text-xs">
            <div class="flex items-center gap-1">
              <button
                onClick={() => setChartTimeRange(7)}
                class={`px-2 py-0.5 text-xs border rounded transition-colors ${
                  chartTimeRange() === 7
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                7d
              </button>
              <button
                onClick={() => setChartTimeRange(30)}
                class={`px-2 py-0.5 text-xs border rounded transition-colors ${
                  chartTimeRange() === 30
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                30d
              </button>
              <button
                onClick={() => setChartTimeRange(90)}
                class={`px-2 py-0.5 text-xs border rounded transition-colors ${
                  chartTimeRange() === 90
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                90d
              </button>
              <button
                onClick={() => setChartTimeRange(365)}
                class={`px-2 py-0.5 text-xs border rounded transition-colors ${
                  chartTimeRange() === 365
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'
                    : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                1y
              </button>
            </div>
            <div class="h-4 w-px bg-gray-300 dark:bg-gray-600"></div>
            <span class="text-gray-500 dark:text-gray-400">
              Last {chartTimeRange()} days
            </span>
            <Show when={selectedDateRange()}>
              <button
                onClick={() => setSelectedDateRange(null)}
                class="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors"
              >
                Clear filter
              </button>
            </Show>
          </div>
        </div>
        <div class="h-32 relative bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
          <Show 
            when={chartData().data.length > 0}
            fallback={
              <div class="h-full flex items-center justify-center">
                <p class="text-sm text-gray-500 dark:text-gray-400">No backup data for selected time range</p>
              </div>
            }
          >
            <svg 
              class="backup-frequency-svg w-full h-full" 
              style="cursor: pointer"
              ref={(el) => {
                // Use createEffect to reactively update the chart
                createEffect(() => {
                  if (!el) return;
                  
                  const data = chartData().data;
                  if (data.length === 0) return;
                  
                  // Wait for next frame to ensure dimensions are available
                  requestAnimationFrame(() => {
                    const rect = el.getBoundingClientRect();
                    if (rect.width === 0 || rect.height === 0) return;
                    
                    const margin = { top: 10, right: 10, bottom: 30, left: 30 };
                    const width = rect.width - margin.left - margin.right;
                    const height = 128 - margin.top - margin.bottom;
                
                el.setAttribute('viewBox', `0 0 ${rect.width} 128`);
                // Clear existing content safely
                while (el.firstChild) {
                  el.removeChild(el.firstChild);
                }
                
                // Create main group
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.setAttribute('transform', `translate(${margin.left},${margin.top})`);
                el.appendChild(g);
                
                const data = chartData().data;
                const maxValue = chartData().maxValue;
                const xScale = width / Math.max(data.length, 1);
                const barWidth = Math.max(1, Math.min(xScale - 2, 50));
                const yScale = height / maxValue;
                
                // Add grid lines
                const gridGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                gridGroup.setAttribute('class', 'grid-lines');
                g.appendChild(gridGroup);
                
                // Y-axis grid lines
                const gridCount = 5;
                for (let i = 0; i <= gridCount; i++) {
                  const y = height - (i * height / gridCount);
                  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                  line.setAttribute('x1', '0');
                  line.setAttribute('y1', y.toString());
                  line.setAttribute('x2', width.toString());
                  line.setAttribute('y2', y.toString());
                  line.setAttribute('stroke', 'currentColor');
                  line.setAttribute('stroke-opacity', '0.1');
                  line.setAttribute('class', 'text-gray-300 dark:text-gray-600');
                  gridGroup.appendChild(line);
                }
                
                // Add Y-axis labels
                if (maxValue <= 5) {
                  for (let i = 0; i <= maxValue; i++) {
                    const y = height - (i * height / maxValue);
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', '-5');
                    text.setAttribute('y', (y + 3).toString());
                    text.setAttribute('text-anchor', 'end');
                    text.setAttribute('class', 'text-[10px] fill-gray-500 dark:fill-gray-400');
                    text.textContent = i.toString();
                    g.appendChild(text);
                  }
                } else {
                  for (let i = 0; i <= gridCount; i++) {
                    const value = Math.round(i * maxValue / gridCount);
                    const y = height - (i * height / gridCount);
                    
                    if (i === 0 || value !== Math.round((i - 1) * maxValue / gridCount)) {
                      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                      text.setAttribute('x', '-5');
                      text.setAttribute('y', (y + 3).toString());
                      text.setAttribute('text-anchor', 'end');
                      text.setAttribute('class', 'text-[10px] fill-gray-500 dark:fill-gray-400');
                      text.textContent = value.toString();
                      g.appendChild(text);
                    }
                  }
                }
                
                // Add bars
                const barsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                barsGroup.setAttribute('class', 'bars');
                g.appendChild(barsGroup);
                
                data.forEach((d, i) => {
                  const barHeight = d.total * yScale;
                  const x = Math.max(0, i * xScale + (xScale - barWidth) / 2);
                  const y = height - barHeight;
                  
                  const barGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                  barGroup.setAttribute('class', 'bar-group');
                  barGroup.setAttribute('data-date', d.date);
                  barGroup.style.cursor = 'pointer';
                  
                  // Background track for all slots
                  const track = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                  track.setAttribute('x', x.toString());
                  track.setAttribute('y', (height - 2).toString());
                  track.setAttribute('width', barWidth.toString());
                  track.setAttribute('height', '2');
                  track.setAttribute('rx', '1');
                  track.setAttribute('fill', '#d1d5db');
                  track.setAttribute('fill-opacity', '0.3');
                  barGroup.appendChild(track);
                  
                  // Click area
                  const clickRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                  clickRect.setAttribute('x', (i * xScale).toString());
                  clickRect.setAttribute('y', '0');
                  clickRect.setAttribute('width', Math.max(1, xScale).toString());
                  clickRect.setAttribute('height', height.toString());
                  clickRect.setAttribute('fill', 'transparent');
                  clickRect.style.cursor = 'pointer';
                  barGroup.appendChild(clickRect);
                  
                  // Main bar
                  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                  rect.setAttribute('x', x.toString());
                  rect.setAttribute('y', y.toString());
                  rect.setAttribute('width', barWidth.toString());
                  rect.setAttribute('height', barHeight.toString());
                  rect.setAttribute('rx', '2');
                  rect.setAttribute('class', 'backup-bar');
                  rect.setAttribute('data-date', d.date);
                  
                  // Color based on count
                  let barColor = '#e5e7eb';
                  if (d.total > 0 && d.total <= 5) barColor = '#60a5fa';
                  else if (d.total <= 10) barColor = '#34d399';
                  else if (d.total > 10) barColor = '#a78bfa';
                  
                  rect.setAttribute('fill', barColor);
                  rect.setAttribute('fill-opacity', '0.8');
                  rect.style.transition = 'fill-opacity 0.2s ease';
                  
                  // Highlight selected date
                  if (selectedDateRange() && 
                      new Date(d.date).getTime() >= selectedDateRange()!.start * 1000 && 
                      new Date(d.date).getTime() <= selectedDateRange()!.end * 1000) {
                    rect.classList.add('ring-2', 'ring-blue-500');
                  }
                  
                  barGroup.appendChild(rect);
                  
                  // Stacked segments
                  if (d.total > 0) {
                    // PBS (bottom)
                    if (d.pbs > 0) {
                      const pbsHeight = (d.pbs / d.total) * barHeight;
                      const pbsRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                      pbsRect.setAttribute('x', x.toString());
                      pbsRect.setAttribute('y', (y + barHeight - pbsHeight).toString());
                      pbsRect.setAttribute('width', barWidth.toString());
                      pbsRect.setAttribute('height', pbsHeight.toString());
                      pbsRect.setAttribute('rx', '2');
                      pbsRect.setAttribute('fill', '#8b5cf6');
                      pbsRect.setAttribute('fill-opacity', '0.9');
                      barGroup.appendChild(pbsRect);
                    }
                    
                    // PVE (middle)
                    if (d.pve > 0) {
                      const pveHeight = (d.pve / d.total) * barHeight;
                      const pveY = y + (d.snapshots / d.total) * barHeight;
                      const pveRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                      pveRect.setAttribute('x', x.toString());
                      pveRect.setAttribute('y', pveY.toString());
                      pveRect.setAttribute('width', barWidth.toString());
                      pveRect.setAttribute('height', pveHeight.toString());
                      pveRect.setAttribute('fill', '#f97316');
                      pveRect.setAttribute('fill-opacity', '0.9');
                      barGroup.appendChild(pveRect);
                    }
                    
                    // Snapshots (top)
                    if (d.snapshots > 0) {
                      const snapshotHeight = (d.snapshots / d.total) * barHeight;
                      const snapshotRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                      snapshotRect.setAttribute('x', x.toString());
                      snapshotRect.setAttribute('y', y.toString());
                      snapshotRect.setAttribute('width', barWidth.toString());
                      snapshotRect.setAttribute('height', snapshotHeight.toString());
                      snapshotRect.setAttribute('rx', '2');
                      snapshotRect.setAttribute('fill', '#eab308');
                      snapshotRect.setAttribute('fill-opacity', '0.9');
                      barGroup.appendChild(snapshotRect);
                    }
                  }
                  
                  // Hover effects with tooltips
                  barGroup.addEventListener('mouseenter', (e) => {
                    rect.setAttribute('fill-opacity', '1');
                    rect.setAttribute('filter', 'brightness(1.2)');
                    
                    // Show tooltip
                    const date = new Date(d.date);
                    const formattedDate = date.toLocaleDateString('en-US', { 
                      weekday: 'short', 
                      month: 'short', 
                      day: 'numeric' 
                    });
                    
                    let tooltipText = `${formattedDate}`;
                    
                    if (d.total > 0) {
                      tooltipText += `\nTotal: ${d.total} backup${d.total > 1 ? 's' : ''}`;
                      
                      const breakdown = [];
                      if (d.snapshots > 0) breakdown.push(`${d.snapshots} Snapshot${d.snapshots > 1 ? 's' : ''}`);
                      if (d.pve > 0) breakdown.push(`${d.pve} PVE`);
                      if (d.pbs > 0) breakdown.push(`${d.pbs} PBS`);
                      
                      if (breakdown.length > 0) {
                        tooltipText += `\n${breakdown.join(', ')}`;
                      }
                    } else {
                      tooltipText += '\nNo backups';
                    }
                    
                    // Get mouse position relative to the page
                    const mouseX = e.pageX || e.clientX + window.scrollX;
                    const mouseY = e.pageY || e.clientY + window.scrollY;
                    
                    setTooltip({
                      text: tooltipText,
                      x: mouseX,
                      y: mouseY - 60
                    });
                  });
                  
                  barGroup.addEventListener('mouseleave', () => {
                    rect.setAttribute('fill-opacity', '0.8');
                    rect.removeAttribute('filter');
                    setTooltip(null);
                  });
                  
                  // Click to filter
                  barGroup.addEventListener('click', () => {
                    const clickedDate = new Date(d.date);
                    const startOfDay = new Date(clickedDate.setHours(0, 0, 0, 0)).getTime() / 1000;
                    const endOfDay = new Date(clickedDate.setHours(23, 59, 59, 999)).getTime() / 1000;
                    setSelectedDateRange({ start: startOfDay, end: endOfDay });
                  });
                  
                  barsGroup.appendChild(barGroup);
                  
                  // Date labels
                  let showLabel = false;
                  if (chartTimeRange() <= 7) {
                    showLabel = true;
                  } else if (chartTimeRange() <= 30) {
                    showLabel = i % Math.ceil(data.length / 10) === 0 || i === data.length - 1;
                  } else if (chartTimeRange() <= 90) {
                    const dayOfWeek = new Date(d.date).getDay();
                    showLabel = dayOfWeek === 0 || i === 0 || i === data.length - 1;
                  } else {
                    const date = new Date(d.date);
                    showLabel = date.getDate() === 1 || i === 0 || i === data.length - 1;
                  }
                  
                  if (showLabel) {
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    text.setAttribute('x', (x + barWidth / 2).toString());
                    text.setAttribute('y', (height + 20).toString());
                    text.setAttribute('text-anchor', 'middle');
                    text.setAttribute('class', 'text-[8px] fill-gray-500 dark:fill-gray-400');
                    
                    // Use shorter format for horizontal labels
                    const date = new Date(d.date);
                    let labelText;
                    if (chartTimeRange() <= 7) {
                      // For 7 days, show month/day
                      labelText = `${date.getMonth() + 1}/${date.getDate()}`;
                    } else if (chartTimeRange() <= 30) {
                      // For 30 days, show day only (or month/day for first of month)
                      labelText = date.getDate() === 1 ? `${date.getMonth() + 1}/1` : date.getDate().toString();
                    } else {
                      // For longer ranges, show month/day
                      labelText = `${date.getMonth() + 1}/${date.getDate()}`;
                    }
                    text.textContent = labelText;
                    g.appendChild(text);
                  }
                });
                  });
                });
              }}
            />
          </Show>
        </div>
        <div class="flex justify-end items-center gap-3 text-xs mt-2">
          <span class="flex items-center gap-1">
            <span class="inline-block w-3 h-3 rounded bg-yellow-500"></span>
            <span class="text-gray-600 dark:text-gray-400">Snapshots</span>
          </span>
          <span class="flex items-center gap-1">
            <span class="inline-block w-3 h-3 rounded bg-orange-500"></span>
            <span class="text-gray-600 dark:text-gray-400">PVE</span>
          </span>
          <span class="flex items-center gap-1">
            <span class="inline-block w-3 h-3 rounded bg-violet-500"></span>
            <span class="text-gray-600 dark:text-gray-400">PBS</span>
          </span>
        </div>
      </div>

      {/* Filter Controls */}
      <div class="filter-controls bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
        {/* Filter toggle - visible on all screen sizes */}
        <button
          onClick={() => setShowFilters(!showFilters())}
          class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors"
        >
          <span class="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="21" x2="4" y2="14"></line>
              <line x1="4" y1="10" x2="4" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12" y2="3"></line>
              <line x1="20" y1="21" x2="20" y2="16"></line>
              <line x1="20" y1="12" x2="20" y2="3"></line>
              <line x1="1" y1="14" x2="7" y2="14"></line>
              <line x1="9" y1="8" x2="15" y2="8"></line>
              <line x1="17" y1="16" x2="23" y2="16"></line>
            </svg>
            Filters & Search
            <Show when={searchTerm() || typeFilter() !== 'all' || backupTypeFilter() !== 'all' || selectedDateRange()}>
              <span class="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                Active
              </span>
            </Show>
          </span>
          <svg 
            width="16" 
            height="16" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            stroke-width="2"
            class={`transform transition-transform ${showFilters() ? 'rotate-180' : ''}`}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        
        <div class={`filter-controls-wrapper ${showFilters() ? 'block' : 'hidden'} p-3 border-t border-gray-200 dark:border-gray-700`}>
          <div class="flex flex-col gap-3">
            {/* Search Row */}
            <div class="flex gap-2">
              <div class="relative flex-1">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search VMID, Name, Node, Storage (use ',' for OR)"
                  value={searchTerm()}
                  onInput={(e) => setSearchTerm(e.currentTarget.value)}
                  class="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg 
                         bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500
                         focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-400 outline-none transition-all"
                />
                <svg class="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              
              <button
                onClick={resetFilters}
                title="Reset all filters (Esc)"
                class="flex items-center justify-center px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 
                       bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 
                       rounded-lg transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                  <path d="M21 3v5h-5"/>
                  <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                  <path d="M8 16H3v5"/>
                </svg>
                <span class="ml-1.5 hidden sm:inline">Reset</span>
              </button>
            </div>
            
            {/* Filters Row */}
            <div class="flex flex-col sm:flex-row gap-2">
            {/* Time Format Toggle */}
            <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5">
              <button
                onClick={() => setUseRelativeTime(false)}
                class={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  !useRelativeTime()
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                Absolute
              </button>
              <button
                onClick={() => setUseRelativeTime(true)}
                class={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  useRelativeTime()
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                Relative
              </button>
            </div>
            
            <div class="h-6 w-px bg-gray-200 dark:bg-gray-600 hidden sm:block"></div>
            
            {/* Backup Type Filter */}
            <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5">
              <button
                onClick={() => setBackupTypeFilter('all')}
                class={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  backupTypeFilter() === 'all'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                All Backups
              </button>
              <button
                onClick={() => setBackupTypeFilter('snapshot')}
                class={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  backupTypeFilter() === 'snapshot'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                Snapshots
              </button>
              <button
                onClick={() => setBackupTypeFilter('local')}
                class={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  backupTypeFilter() === 'local'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                PVE
              </button>
              <button
                onClick={() => setBackupTypeFilter('remote')}
                class={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  backupTypeFilter() === 'remote'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                PBS
              </button>
            </div>
            
            <div class="h-6 w-px bg-gray-200 dark:bg-gray-600 hidden sm:block"></div>
            
            {/* Type Filter */}
            <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700 p-0.5">
              <button
                onClick={() => setTypeFilter('all')}
                class={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  typeFilter() === 'all'
                    ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                All Types
              </button>
              <button
                onClick={() => setTypeFilter('VM')}
                class={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  typeFilter() === 'VM'
                    ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                VMs
              </button>
              <button
                onClick={() => setTypeFilter('LXC')}
                class={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  typeFilter() === 'LXC'
                    ? 'bg-white dark:bg-gray-800 text-green-600 dark:text-green-400 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
                }`}
              >
                LXCs
              </button>
            </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div class="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
        <style>{`
          .backup-table {
            table-layout: fixed;
            width: 100%;
            min-width: 1200px;
          }
          .backup-table th,
          .backup-table td {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
        `}</style>
        <Show
          when={!isLoading()}
          fallback={
            <div class="text-center py-8 text-gray-500 dark:text-gray-400">
              <div class="flex flex-col items-center gap-4">
                <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                <p class="text-lg">Loading backup data...</p>
                <p class="text-sm">This may take up to 20 seconds on first load</p>
              </div>
            </div>
          }
        >
          <Show
            when={groupedData().length > 0}
            fallback={
              <div class="text-center py-8 text-gray-500 dark:text-gray-400">
                <p class="text-lg">No backups found</p>
                <p class="text-sm mt-2">No backups, snapshots, or remote backups match your filters</p>
              </div>
            }
          >
          {/* Mobile Card View - Compact */}
          <div class="block lg:hidden space-y-3">
            <For each={groupedData()}>
              {(group) => (
                <div class="space-y-1">
                  <div class="text-xs font-medium text-gray-600 dark:text-gray-400 px-2 py-1 sticky top-0 bg-gray-50 dark:bg-gray-900 z-10">
                    {group.label} ({group.items.length})
                  </div>
                  <For each={group.items}>
                    {(item) => (
                      <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 hover:shadow-sm transition-shadow">
                        {/* Compact header row */}
                        <div class="flex items-center justify-between gap-2 mb-1">
                          <div class="flex items-center gap-2 min-w-0 flex-1">
                            <span class={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                              item.type === 'VM'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            }`}>
                              {item.type}
                            </span>
                            <span class="text-xs text-gray-500 shrink-0">{item.vmid}</span>
                            <span class="font-medium text-xs truncate">{item.name || 'Unnamed'}</span>
                          </div>
                          <div class="flex items-center gap-2 shrink-0">
                            <span class={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              item.backupType === 'snapshot'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                : item.backupType === 'local'
                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                : 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200'
                            }`}>
                              {item.backupType === 'snapshot' ? 'SNAP' :
                               item.backupType === 'local' ? 'PVE' : 'PBS'}
                            </span>
                          </div>
                        </div>
                        
                        {/* Compact info row */}
                        <div class="flex items-center justify-between gap-2 text-[11px]">
                          <div class="flex items-center gap-3 text-gray-600 dark:text-gray-400">
                            <span>{item.node}</span>
                            <span class={getAgeColorClass(item.backupTime)}>
                              {formatTime(item.backupTime * 1000)}
                            </span>
                            <Show when={item.size}>
                              <span class={getSizeColor(item.size)}>
                                {formatBytes(item.size!)}
                              </span>
                            </Show>
                            <Show when={item.backupType === 'remote' && item.verified}>
                              <span class="text-green-600 dark:text-green-400">✓</span>
                            </Show>
                          </div>
                          <Show when={(item.storage || item.datastore) && item.backupType !== 'snapshot'}>
                            <span class="text-gray-500 dark:text-gray-400 text-[10px] truncate max-w-[100px]">
                              {item.storage || (item.datastore && (
                                item.namespace && item.namespace !== 'root'
                                  ? `${item.datastore}/${item.namespace}`
                                  : item.datastore
                              )) || '-'}
                            </span>
                          </Show>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
          
          {/* Desktop Table View */}
          <table class="backup-table text-xs sm:text-sm hidden lg:table">
            <thead class="bg-gray-100 dark:bg-gray-800">
              <tr class="text-[10px] sm:text-xs font-medium tracking-wider text-left text-gray-600 uppercase bg-gray-100 dark:bg-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-600">
                <th class="p-1 px-2" style="width: 150px;">
                  Name
                </th>
                <th
                  class="sortable p-1 px-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                  onClick={() => handleSort('type')}
                  style="width: 60px;"
                >
                  Type {sortKey() === 'type' && (sortDirection() === 'asc' ? '▲' : '▼')}
                </th>
                <th
                  class="sortable p-1 px-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                  onClick={() => handleSort('vmid')}
                  style="width: 60px;"
                >
                  VMID {sortKey() === 'vmid' && (sortDirection() === 'asc' ? '▲' : '▼')}
                </th>
                <th
                  class="sortable p-1 px-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                  onClick={() => handleSort('node')}
                  style="width: 100px;"
                >
                  Node {sortKey() === 'node' && (sortDirection() === 'asc' ? '▲' : '▼')}
                </th>
                <th
                  class="sortable p-1 px-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                  onClick={() => handleSort('backupTime')}
                  style="width: 140px;"
                >
                  Time {sortKey() === 'backupTime' && (sortDirection() === 'asc' ? '▲' : '▼')}
                </th>
                <Show when={backupTypeFilter() !== 'snapshot'}>
                  <th
                    class="sortable p-1 px-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                    onClick={() => handleSort('size')}
                    style="width: 80px;"
                  >
                    Size {sortKey() === 'size' && (sortDirection() === 'asc' ? '▲' : '▼')}
                  </th>
                </Show>
                <th
                  class="sortable p-1 px-2 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                  onClick={() => handleSort('backupType')}
                  style="width: 80px;"
                >
                  Backup {sortKey() === 'backupType' && (sortDirection() === 'asc' ? '▲' : '▼')}
                </th>
                <Show when={backupTypeFilter() === 'all' || backupTypeFilter() === 'remote'}>
                  <th class="p-1 px-2 text-center" style="width: 60px;">
                    Verified
                  </th>
                </Show>
                <Show when={backupTypeFilter() !== 'snapshot'}>
                  <th class="p-1 px-2" style="width: 150px;">
                    Location
                  </th>
                </Show>
                <th class="p-1 px-2" style="width: 200px;">
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={groupedData()}>
                {(group) => (
                  <>
                    <tr class="bg-gray-50 dark:bg-gray-700/30">
                      <td class="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {group.label} ({group.items.length})
                      </td>
                      <td colspan={(() => {
                        let cols = 6; // Base columns: Type, VMID, Node, Time, Backup, Details
                        if (backupTypeFilter() !== 'snapshot') cols++; // Add Size column
                        if (backupTypeFilter() === 'all' || backupTypeFilter() === 'remote') cols++; // Add Verified column
                        if (backupTypeFilter() !== 'snapshot') cols++; // Add Location column
                        return cols;
                      })()} class="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400"></td>
                    </tr>
                    <For each={group.items}>
                      {(item) => (
                        <tr class="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td class="p-1 px-2">
                            {item.name || '-'}
                          </td>
                          <td class="p-1 px-2">
                            <span class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              item.type === 'VM'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                            }`}>
                              {item.type}
                            </span>
                          </td>
                          <td class="p-1 px-2 font-medium">{item.vmid}</td>
                          <td class="p-1 px-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400">
                            {item.node}
                          </td>
                          <td class={`p-1 px-2 text-xs ${getAgeColorClass(item.backupTime)}`}>
                            {formatTime(item.backupTime * 1000)}
                          </td>
                          <Show when={backupTypeFilter() !== 'snapshot'}>
                            <td class={`p-1 px-2 ${getSizeColor(item.size)}`}>
                              {item.size ? formatBytes(item.size) : '-'}
                            </td>
                          </Show>
                          <td class="p-1 px-2">
                            <span class={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              item.backupType === 'snapshot'
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'
                                : item.backupType === 'local'
                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'
                                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                            }`}>
                              {item.backupType === 'snapshot' ? 'Snapshot' : item.backupType === 'local' ? 'PVE' : 'PBS'}
                            </span>
                          </td>
                          <Show when={backupTypeFilter() === 'all' || backupTypeFilter() === 'remote'}>
                            <td class="p-1 px-2 text-center">
                              {item.backupType === 'remote' ? (
                                item.verified ? (
                                  <span title="PBS backup verified" class="text-green-500 dark:text-green-400">✓</span>
                                ) : (
                                  <span title="PBS backup not yet verified" class="text-yellow-500 dark:text-yellow-400">⏱</span>
                                )
                              ) : (
                                <span class="text-gray-400 dark:text-gray-500" title="Verification only available for PBS backups">-</span>
                              )}
                            </td>
                          </Show>
                          <Show when={backupTypeFilter() !== 'snapshot'}>
                            <td class="p-1 px-2">
                              {item.storage || (item.datastore && (
                                item.namespace && item.namespace !== 'root'
                                  ? `${item.datastore}/${item.namespace}`
                                  : item.datastore
                              )) || '-'}
                            </td>
                          </Show>
                          <td 
                            class="p-1 px-2 cursor-help"
                            onMouseEnter={(e) => {
                              const details = [];
                              
                              if (item.backupType === 'snapshot') {
                                details.push(item.backupName);
                                if (item.description) {
                                  details.push(item.description);
                                }
                              } else if (item.backupType === 'local') {
                                details.push(item.backupName);
                              } else if (item.backupType === 'remote') {
                                if (item.protected) details.push('Protected');
                                // For PBS backups, show the notes field which contains the backup description
                                const pbsDescription = item.description || (item.name && item.name !== '-' ? item.name : '');
                                if (pbsDescription && pbsDescription.trim()) {
                                  details.push(pbsDescription);
                                }
                              }
                              
                              const fullText = details.join(' • ') || '-';
                              if (fullText.length > 35) {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setTooltip({
                                  text: fullText,
                                  x: rect.left,
                                  y: rect.top - 5
                                });
                              }
                            }}
                            onMouseLeave={() => {
                              setTooltip(null);
                            }}
                          >
                            {(() => {
                              const details = [];
                              
                              if (item.backupType === 'snapshot') {
                                details.push(item.backupName);
                                if (item.description) {
                                  details.push(item.description);
                                }
                              } else if (item.backupType === 'local') {
                                details.push(truncateMiddle(item.backupName, 30));
                              } else if (item.backupType === 'remote') {
                                if (item.protected) details.push('Protected');
                                // For PBS backups, show the notes field which contains the backup description
                                const pbsDescription = item.description || (item.name && item.name !== '-' ? item.name : '');
                                if (pbsDescription && pbsDescription.trim()) {
                                  details.push(pbsDescription);
                                }
                              }
                              
                              const fullText = details.join(' • ') || '-';
                              const displayText = fullText.length > 35 ? fullText.substring(0, 32) + '...' : fullText;
                              
                              return displayText;
                            })()}
                          </td>
                        </tr>
                      )}
                    </For>
                  </>
                )}
              </For>
            </tbody>
          </table>
          </Show>
        </Show>
      </div>

      {/* Tooltip */}
      <Show when={tooltip()}>
        <div
          class="fixed z-[9999] px-3 py-2 text-sm bg-black text-white rounded-lg shadow-xl pointer-events-none"
          style={{
            left: `${tooltip()!.x - 75}px`,
            top: `${tooltip()!.y}px`,
            "max-width": "200px",
            "white-space": "pre-line",
            "font-family": "system-ui, -apple-system, sans-serif"
          }}
        >
          {tooltip()!.text}
        </div>
      </Show>
    </div>
  );
};

export default UnifiedBackups;