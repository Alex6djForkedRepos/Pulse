import { Component, For, Show, createMemo } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import type { VM, Container } from '@/types/api';
import { ComponentErrorBoundary } from '@/components/ErrorBoundary';
import { formatBytes, formatUptime } from '@/utils/format';
import { MetricBar } from './MetricBar';
import { IOMetric } from './IOMetric';

interface VirtualizedGuestTableProps {
  guests: (VM | Container)[];
  groupedGuests: Record<string, (VM | Container)[]>;
  groupingMode: 'grouped' | 'flat';
  sortKey: string | null;
  sortDirection: 'asc' | 'desc';
  activeAlerts: any;
  getAlertStyles: (guestId: string, alerts: any) => any;
  handleTagClick: (tag: string) => void;
  handleSort: (key: string) => void;
  search: string;
  nodeHostMap: Record<string, string>;
}

const isVM = (guest: VM | Container): guest is VM => {
  return guest.type === 'qemu';
};

export const VirtualizedGuestTable: Component<VirtualizedGuestTableProps> = (props) => {
  let scrollContainer: HTMLDivElement | undefined;
  
  // Flatten grouped guests into a single array with node headers
  const flattenedItems = createMemo(() => {
    const items: Array<{ type: 'header' | 'guest'; data: any; node?: string }> = [];
    
    if (props.groupingMode === 'flat') {
      props.guests.forEach(guest => {
        items.push({ type: 'guest', data: guest });
      });
    } else {
      const sortedNodes = Object.entries(props.groupedGuests).sort(([a], [b]) => a.localeCompare(b));
      sortedNodes.forEach(([node, guests]) => {
        if (node && guests.length > 0) {
          items.push({ type: 'header', data: node, node });
          guests.forEach(guest => {
            items.push({ type: 'guest', data: guest, node });
          });
        }
      });
    }
    
    return items;
  });

  const estimateSize = () => 32;

  const virtualizer = createVirtualizer({
    get count() { return flattenedItems().length; },
    getScrollElement: () => scrollContainer || null,
    estimateSize,
    overscan: 10,
  });

  // Column widths matching the original table
  const cols = {
    name: 'w-[250px]',
    type: 'min-w-[60px]',
    vmid: 'min-w-[70px]',
    uptime: 'min-w-[100px]',
    cpu: 'min-w-[140px]',
    memory: 'min-w-[140px]',
    disk: 'min-w-[140px]',
    diskRead: 'min-w-[90px]',
    diskWrite: 'min-w-[90px]',
    netIn: 'min-w-[90px]',
    netOut: 'min-w-[90px]'
  };

  return (
    <div class="mb-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div class="overflow-x-auto">
        {/* Virtual Scrolling Container */}
        <div 
          ref={scrollContainer}
          style={{ height: '600px', overflow: 'auto' }}
        >
          <div class="min-w-[1200px]">
            {/* Header */}
            <div class="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex min-w-[1200px]">
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.name} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('name')}>
              Name {props.sortKey === 'name' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.type} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('type')}>
              Type {props.sortKey === 'type' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.vmid} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('vmid')}>
              VMID {props.sortKey === 'vmid' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.uptime} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('uptime')}>
              Uptime {props.sortKey === 'uptime' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.cpu} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('cpu')}>
              CPU {props.sortKey === 'cpu' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.memory} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('memory')}>
              Memory {props.sortKey === 'memory' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.disk} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('disk')}>
              Disk {props.sortKey === 'disk' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.diskRead} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('diskRead')}>
              Disk Read {props.sortKey === 'diskRead' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.diskWrite} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('diskWrite')}>
              Disk Write {props.sortKey === 'diskWrite' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.netIn} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('networkIn')}>
              Net In {props.sortKey === 'networkIn' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            <div class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider ${cols.netOut} cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300`}
                 onClick={() => props.handleSort('networkOut')}>
              Net Out {props.sortKey === 'networkOut' && (props.sortDirection === 'asc' ? '▲' : '▼')}
            </div>
            </div>
            
            {/* Content */}
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
              <For each={virtualizer.getVirtualItems()}>
                {(virtualRow) => {
                  const item = flattenedItems()[virtualRow.index];
                  
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
                        <div class="min-w-[1200px] bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-200 dark:border-gray-700">
                          <div class="p-1 px-2 text-xs font-medium text-gray-600 dark:text-gray-400">
                            <a 
                              href={props.nodeHostMap[item.data] || (item.data.includes(':') ? `https://${item.data}` : `https://${item.data}:8006`)} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              class="text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors duration-150 cursor-pointer"
                              title={`Open ${item.data} web interface`}
                            >
                              {item.data}
                            </a>
                          </div>
                        </div>
                      </Show>
                      
                      <Show when={item?.type === 'guest'}>
                        <ComponentErrorBoundary name="GuestRow">
                          {(() => {
                            const guest = item.data as VM | Container;
                            const guestId = guest.id || `${guest.instance}-${guest.name}-${guest.vmid}`;
                            const alertStyles = props.getAlertStyles(guestId, props.activeAlerts);
                            const isRunning = guest.status === 'running';
                            
                            return (
                              <div class={`flex min-w-[1200px] border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${alertStyles?.rowClass || ''}`}>
                                {/* Name */}
                                <div class={`p-1 px-2 ${cols.name} flex items-center gap-2`}>
                                  <Show when={alertStyles?.hasAlert}>
                                    <span class={`h-2 w-2 rounded-full flex-shrink-0 ${alertStyles?.indicatorClass || ''}`} />
                                  </Show>
                                  <span class={`h-2 w-2 rounded-full flex-shrink-0 ${isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                                  <a href={`https://${guest.node}:8006/?console=lxc&vmid=${guest.vmid}`}
                                     target="_blank"
                                     class="text-xs font-medium text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">
                                    {guest.name}
                                  </a>
                                </div>
                                
                                {/* Type */}
                                <div class={`p-1 px-2 ${cols.type}`}>
                                  <span class={`text-[10px] px-1 py-0 rounded ${
                                    guest.type === 'qemu' 
                                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' 
                                      : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  }`}>
                                    {guest.type === 'qemu' ? 'VM' : 'LXC'}
                                  </span>
                                </div>
                                
                                {/* VMID */}
                                <div class={`p-1 px-2 ${cols.vmid}`}>
                                  <span class="text-xs text-gray-600 dark:text-gray-400">{guest.vmid}</span>
                                </div>
                                
                                {/* Uptime */}
                                <div class={`p-1 px-2 ${cols.uptime}`}>
                                  <span class="text-xs text-gray-600 dark:text-gray-400">
                                    {isRunning && guest.uptime ? formatUptime(guest.uptime) : '-'}
                                  </span>
                                </div>
                                
                                {/* CPU */}
                                <div class={`p-1 px-2 ${cols.cpu}`}>
                                  <MetricBar 
                                    value={Math.round(guest.cpu * 100)} 
                                    label={`${Math.round(guest.cpu * 100)}%`}
                                    sublabel={guest.cpuInfo ? `${guest.cpuInfo.cores} cores` : undefined}
                                    type="cpu"
                                    disabled={!isRunning}
                                  />
                                </div>
                                
                                {/* Memory */}
                                <div class={`p-1 px-2 ${cols.memory}`}>
                                  <MetricBar 
                                    value={guest.memory?.usage || 0} 
                                    label={`${Math.round(guest.memory?.usage || 0)}%`}
                                    sublabel={guest.memory ? `${formatBytes(guest.memory.used)}/${formatBytes(guest.memory.total)}` : undefined}
                                    type="memory"
                                    disabled={!isRunning}
                                  />
                                </div>
                                
                                {/* Disk */}
                                <div class={`p-1 px-2 ${cols.disk}`}>
                                  <MetricBar 
                                    value={guest.disk.total > 0 ? Math.round((guest.disk.used / guest.disk.total) * 100) : 0} 
                                    label={`${guest.disk.total > 0 ? Math.round((guest.disk.used / guest.disk.total) * 100) : 0}%`}
                                    sublabel={`${formatBytes(guest.disk.used)}/${formatBytes(guest.disk.total)}`}
                                    type="disk"
                                    disabled={!isRunning}
                                  />
                                </div>
                                
                                {/* Disk I/O */}
                                <div class={`p-1 px-2 ${cols.diskRead}`}>
                                  <IOMetric value={guest.diskRead} disabled={!isRunning} />
                                </div>
                                <div class={`p-1 px-2 ${cols.diskWrite}`}>
                                  <IOMetric value={guest.diskWrite} disabled={!isRunning} />
                                </div>
                                
                                {/* Network I/O */}
                                <div class={`p-1 px-2 ${cols.netIn}`}>
                                  <IOMetric value={guest.networkIn} disabled={!isRunning} />
                                </div>
                                <div class={`p-1 px-2 ${cols.netOut}`}>
                                  <IOMetric value={guest.networkOut} disabled={!isRunning} />
                                </div>
                              </div>
                            );
                          })()}
                        </ComponentErrorBoundary>
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