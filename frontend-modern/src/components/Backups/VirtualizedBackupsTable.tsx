import { Component, Show, createMemo, For } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import { formatBytes } from '@/utils/format';

interface UnifiedBackup {
  backupType: 'snapshot' | 'local' | 'remote';
  vmid: number;
  name: string;
  type: string;
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
  encrypted?: boolean;
  owner?: string;
}

interface VirtualizedBackupsTableProps {
  backups: UnifiedBackup[];
  groupByMode: 'date' | 'guest';
  useRelativeTime: boolean;
  sortKey: string;
  sortDirection: 'asc' | 'desc';
  onSort: (key: string) => void;
  hasHostBackups: boolean;
  backupTypeFilter?: string;
  formatTime: (timestamp: number) => string;
  getAgeColorClass: (timestamp: number) => string;
  getSizeColor: (size: number | null) => string;
  truncateMiddle: (str: string, maxLength: number) => string;
  setTooltip: (tooltip: any) => void;
}

export const VirtualizedBackupsTable: Component<VirtualizedBackupsTableProps> = (props) => {
  let scrollContainer: HTMLDivElement | undefined;
  
  // Process items based on grouping mode
  const processedItems = createMemo(() => {
    const items: Array<{ type: 'header' | 'backup'; data: any }> = [];
    
    if (props.groupByMode === 'date') {
      // Group by date
      const groups: Record<string, UnifiedBackup[]> = {};
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      
      const todayTime = today.getTime() / 1000;
      const yesterdayTime = yesterday.getTime() / 1000;
      const weekAgoTime = weekAgo.getTime() / 1000;
      const monthAgoTime = monthAgo.getTime() / 1000;
      
      props.backups.forEach(backup => {
        let group = 'Older';
        if (backup.backupTime >= todayTime) {
          group = 'Today';
        } else if (backup.backupTime >= yesterdayTime) {
          group = 'Yesterday';
        } else if (backup.backupTime >= weekAgoTime) {
          group = 'This Week';
        } else if (backup.backupTime >= monthAgoTime) {
          group = 'This Month';
        }
        
        if (!groups[group]) groups[group] = [];
        groups[group].push(backup);
      });
      
      // Order groups
      const groupOrder = ['Today', 'Yesterday', 'This Week', 'This Month', 'Older'];
      groupOrder.forEach(group => {
        if (groups[group] && groups[group].length > 0) {
          items.push({ type: 'header', data: { label: group, items: groups[group] } });
          groups[group].forEach(backup => {
            items.push({ type: 'backup', data: backup });
          });
        }
      });
    } else {
      // Group by guest
      const groups: Record<string, UnifiedBackup[]> = {};
      props.backups.forEach(backup => {
        const guestKey = `${backup.type} ${backup.vmid}${backup.name ? ` - ${backup.name}` : ''}`;
        if (!groups[guestKey]) groups[guestKey] = [];
        groups[guestKey].push(backup);
      });
      
      // Sort groups by VMID
      Object.entries(groups)
        .sort(([a], [b]) => {
          const vmidA = parseInt(a.match(/\d+/)?.[0] || '0');
          const vmidB = parseInt(b.match(/\d+/)?.[0] || '0');
          return vmidA - vmidB;
        })
        .forEach(([guest, backups]) => {
          items.push({ type: 'header', data: { label: guest, items: backups } });
          backups.forEach(backup => {
            items.push({ type: 'backup', data: backup });
          });
        });
    }
    
    return items;
  });
  
  const estimateSize = () => 36;
  
  const virtualizer = createVirtualizer({
    get count() { return processedItems().length; },
    getScrollElement: () => scrollContainer || null,
    estimateSize,
    overscan: 10,
  });
  
  return (
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="overflow-x-auto">
        {/* Virtual Scrolling Container */}
        <div 
          ref={scrollContainer}
          style={{ height: '600px', overflow: 'auto' }}
        >
          <div class="min-w-[1240px]">
            {/* Header */}
            <div class="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex min-w-[1240px] text-gray-600 dark:text-gray-300">
            <div 
              class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[60px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => props.onSort('vmid')}
            >
              VMID {props.sortKey === 'vmid' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div 
              class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[60px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => props.onSort('type')}
            >
              Type {props.sortKey === 'type' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div 
              class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[200px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => props.onSort('name')}
            >
              Name {props.sortKey === 'name' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div 
              class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[100px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => props.onSort('node')}
            >
              Node {props.sortKey === 'node' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <Show when={props.backupTypeFilter === 'all' || props.backupTypeFilter === 'remote'}>
              <div 
                class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[80px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => props.onSort('owner')}
              >
                Owner {props.sortKey === 'owner' && (props.sortDirection === 'asc' ? '▲' : '▼')}
              </div>
            </Show>
            <div 
              class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[140px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => props.onSort('backupTime')}
            >
              Time {props.sortKey === 'backupTime' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <Show when={props.backupTypeFilter !== 'snapshot'}>
              <div 
                class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[80px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => props.onSort('size')}
              >
                Size {props.sortKey === 'size' && (props.sortDirection === 'asc' ? '▲' : '▼')}
              </div>
            </Show>
            <div 
              class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[80px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={() => props.onSort('backupType')}
            >
              Backup {props.sortKey === 'backupType' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <Show when={props.backupTypeFilter !== 'snapshot'}>
              <div 
                class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[180px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => props.onSort('storage')}
              >
                Location {props.sortKey === 'storage' && (props.sortDirection === 'asc' ? '▲' : '▼')}
              </div>
            </Show>
            <Show when={props.backupTypeFilter === 'all' || props.backupTypeFilter === 'remote'}>
              <div 
                class="px-2 py-1.5 text-center text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[60px] flex-shrink-0 cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600"
                onClick={() => props.onSort('verified')}
              >
                Verified {props.sortKey === 'verified' && (props.sortDirection === 'asc' ? '▲' : '▼')}
              </div>
            </Show>
            <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[200px]">
              Details
            </div>
            </div>
            
            {/* Content */}
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              <For each={virtualizer.getVirtualItems()}>
                {(virtualRow) => {
                  const item = processedItems()[virtualRow.index];
                  
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <Show when={item?.type === 'header'}>
                        <div class="min-w-[1240px] bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-200 dark:border-gray-700">
                          <div class="p-1 px-2 text-xs font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                            {item.data.label} ({item.data.items.length})
                          </div>
                        </div>
                      </Show>
                      
                      <Show when={item?.type === 'backup'}>
                        {(() => {
                          const backup = item.data as UnifiedBackup;
                          return (
                            <div class="flex items-center h-full min-w-[1240px] border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                              <div class="p-1 px-2 text-xs text-gray-600 dark:text-gray-400 w-[60px] flex-shrink-0 flex items-center">
                                {backup.vmid}
                              </div>
                              <div class="p-1 px-2 w-[60px] flex-shrink-0 flex items-center">
                                <span class={`text-[10px] px-1 py-0 rounded ${
                                  backup.type === 'VM'
                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                    : backup.type === 'Host'
                                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                }`}>
                                  {backup.type}
                                </span>
                              </div>
                              <div class="p-1 px-2 text-xs font-medium text-gray-900 dark:text-gray-100 w-[200px] flex-shrink-0 flex items-center whitespace-nowrap overflow-hidden text-ellipsis">
                                {backup.name || '-'}
                              </div>
                              <div class="p-1 px-2 text-xs text-gray-600 dark:text-gray-400 w-[100px] flex-shrink-0 flex items-center whitespace-nowrap">
                                {backup.node}
                              </div>
                              <Show when={props.backupTypeFilter === 'all' || props.backupTypeFilter === 'remote'}>
                                <div class="p-1 px-2 text-xs text-gray-500 dark:text-gray-400 w-[80px] flex-shrink-0 flex items-center whitespace-nowrap overflow-hidden text-ellipsis">
                                  {backup.owner ? backup.owner.split('@')[0] : '-'}
                                </div>
                              </Show>
                              <div class={`p-1 px-2 text-xs w-[140px] flex-shrink-0 flex items-center whitespace-nowrap ${props.getAgeColorClass(backup.backupTime)}`}>
                                {props.formatTime(backup.backupTime * 1000)}
                              </div>
                              <Show when={props.backupTypeFilter !== 'snapshot'}>
                                <div class={`p-1 px-2 text-xs w-[80px] flex-shrink-0 flex items-center ${props.getSizeColor(backup.size)}`}>
                                  {backup.size ? formatBytes(backup.size) : '-'}
                                </div>
                              </Show>
                              <div class="p-1 px-2 w-[80px] flex-shrink-0 flex items-center">
                                <div class="flex items-center gap-1">
                                  <span class={`text-[10px] px-1 py-0 rounded ${
                                    backup.backupType === 'snapshot'
                                      ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'
                                      : backup.backupType === 'local'
                                      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300'
                                      : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300'
                                  }`}>
                                    {backup.backupType === 'snapshot' ? 'Snapshot' : backup.backupType === 'local' ? 'PVE' : 'PBS'}
                                  </span>
                                  <Show when={backup.encrypted}>
                                    <span title="Encrypted backup" class="text-green-600 dark:text-green-400 inline-block ml-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
                                      </svg>
                                    </span>
                                  </Show>
                                  <Show when={backup.protected}>
                                    <span title="Protected backup" class="text-blue-600 dark:text-blue-400 inline-block ml-1">
                                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                        <path fill-rule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                                      </svg>
                                    </span>
                                  </Show>
                                </div>
                              </div>
                              <Show when={props.backupTypeFilter !== 'snapshot'}>
                                <div class="p-1 px-2 text-xs text-gray-600 dark:text-gray-400 w-[180px] flex-shrink-0 flex items-center whitespace-nowrap overflow-hidden text-ellipsis">
                                  {backup.storage || (backup.datastore && (
                                    backup.namespace && backup.namespace !== 'root'
                                      ? `${backup.datastore}/${backup.namespace}`
                                      : backup.datastore
                                  )) || '-'}
                                </div>
                              </Show>
                              <Show when={props.backupTypeFilter === 'all' || props.backupTypeFilter === 'remote'}>
                                <div class="p-1 px-2 w-[60px] flex-shrink-0 flex items-center justify-center">
                                  {backup.backupType === 'remote' ? (
                                    backup.verified ? (
                                      <span title="PBS backup verified">
                                        <svg class="w-4 h-4 text-green-500 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                      </span>
                                    ) : (
                                      <span title="PBS backup not yet verified">
                                        <svg class="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                      </span>
                                    )
                                  ) : (
                                    <span class="text-xs text-gray-400 dark:text-gray-500" title="Verification only available for PBS backups">-</span>
                                  )}
                                </div>
                              </Show>
                              <div 
                                class="p-1 px-2 text-xs text-gray-600 dark:text-gray-400 cursor-help w-[200px] flex items-center"
                                onMouseEnter={(e) => {
                                  const details = [];
                                  
                                  if (backup.backupType === 'snapshot') {
                                    details.push(backup.backupName);
                                    if (backup.description) {
                                      details.push(backup.description);
                                    }
                                  } else if (backup.backupType === 'local') {
                                    details.push(backup.backupName);
                                  } else if (backup.backupType === 'remote') {
                                    if (backup.protected) details.push('Protected');
                                    const pbsDescription = backup.description || (backup.name && backup.name !== '-' ? backup.name : '');
                                    if (pbsDescription && pbsDescription.trim()) {
                                      details.push(pbsDescription);
                                    }
                                  }
                                  
                                  const fullText = details.join(' • ') || '-';
                                  if (fullText.length > 35) {
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    props.setTooltip({
                                      text: fullText,
                                      x: rect.left,
                                      y: rect.top - 5
                                    });
                                  }
                                }}
                                onMouseLeave={() => {
                                  props.setTooltip(null);
                                }}
                              >
                                {(() => {
                                  const details = [];
                                  
                                  if (backup.backupType === 'snapshot') {
                                    details.push(backup.backupName);
                                    if (backup.description) {
                                      details.push(backup.description);
                                    }
                                  } else if (backup.backupType === 'local') {
                                    details.push(props.truncateMiddle(backup.backupName, 30));
                                  } else if (backup.backupType === 'remote') {
                                    if (backup.protected) details.push('Protected');
                                    const pbsDescription = backup.description || (backup.name && backup.name !== '-' ? backup.name : '');
                                    if (pbsDescription && pbsDescription.trim()) {
                                      details.push(pbsDescription);
                                    }
                                  }
                                  
                                  const fullText = details.join(' • ') || '-';
                                  const displayText = fullText.length > 35 ? fullText.substring(0, 32) + '...' : fullText;
                                  
                                  return displayText;
                                })()}
                              </div>
                            </div>
                          );
                        })()}
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};