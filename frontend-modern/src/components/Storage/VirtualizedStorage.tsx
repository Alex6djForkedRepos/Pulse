import { Component, Show, createMemo, For } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';
import type { Storage as StorageType } from '@/types/api';
import { formatBytes } from '@/utils/format';
import { getAlertStyles } from '@/utils/alerts';

interface VirtualizedStorageProps {
  storage: StorageType[];
  viewMode: 'node' | 'storage';
  activeAlerts: any;
  nodeHostMap: Record<string, string>;
}

const getProgressBarColor = (percent: number): string => {
  if (percent >= 90) return 'bg-red-500/60 dark:bg-red-500/50';
  if (percent >= 80) return 'bg-yellow-500/60 dark:bg-yellow-500/50';
  return 'bg-green-500/60 dark:bg-green-500/50';
};

export const VirtualizedStorage: Component<VirtualizedStorageProps> = (props) => {
  let scrollContainer: HTMLDivElement | undefined;
  
  // Process items based on grouping mode
  const processedItems = createMemo(() => {
    const items: Array<{ type: 'header' | 'storage'; data: any }> = [];
    
    if (props.viewMode === 'node') {
      // Group by node
      const groups: Record<string, StorageType[]> = {};
      props.storage.forEach(storage => {
        if (!groups[storage.node]) groups[storage.node] = [];
        groups[storage.node].push(storage);
      });
      
      // Sort groups and add to items
      Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([node, storages]) => {
          items.push({ type: 'header', data: node });
          storages.forEach(storage => {
            items.push({ type: 'storage', data: storage });
          });
        });
    } else {
      // No grouping, just storages
      props.storage.forEach(storage => {
        items.push({ type: 'storage', data: storage });
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
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden mb-4">
      <div class="overflow-x-auto">
        {/* Virtual Scrolling Container */}
        <div 
          ref={scrollContainer}
          style={{ height: '600px', overflow: 'auto' }}
        >
          <div class="w-full">
            {/* Header */}
            <div class="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600 flex w-full text-gray-600 dark:text-gray-300">
            <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[200px] flex-shrink-0">
              Storage
            </div>
            <Show when={props.viewMode === 'node'}>
              <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[100px] flex-shrink-0 hidden sm:flex">
                Node
              </div>
            </Show>
            <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[80px] flex-shrink-0 hidden md:flex">
              Type
            </div>
            <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[222px] flex-shrink-0 hidden lg:flex">
              Content
            </div>
            <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[80px] flex-shrink-0 hidden sm:flex">
              Status
            </div>
            <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[60px] flex-shrink-0 hidden lg:flex">
              Shared
            </div>
            <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider min-w-[300px] flex-1">
              Usage
            </div>
            <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[80px] flex-shrink-0 hidden sm:flex">
              Free
            </div>
            <div class="px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider w-[80px] flex-shrink-0">
              Total
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
                        <div class="w-full bg-gray-50/50 dark:bg-gray-700/30 border-b border-gray-200 dark:border-gray-700">
                          <div class="p-0.5 px-1.5 text-xs font-medium text-gray-600 dark:text-gray-400">
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
                      
                      <Show when={item?.type === 'storage'}>
                        {(() => {
                          const storage = item.data as StorageType;
                          const usagePercent = storage.total > 0 ? (storage.used / storage.total * 100) : 0;
                          const isDisabled = storage.status !== 'available';
                          
                          const alertStyles = getAlertStyles(storage.id || `${storage.instance}-${storage.name}`, props.activeAlerts);
                          
                          const firstCellClass = alertStyles.hasAlert
                            ? (alertStyles.severity === 'critical'
                              ? 'border-l-4 border-l-red-500 dark:border-l-red-400'
                              : 'border-l-4 border-l-yellow-500 dark:border-l-yellow-400')
                            : '';
                          
                          return (
                            <div class={`flex items-center h-8 w-full border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${isDisabled ? 'opacity-60' : ''} ${alertStyles.rowClass || ''}`}>
                              <div class={`p-0.5 px-1.5 text-sm font-medium text-gray-900 dark:text-gray-100 w-[200px] flex-shrink-0 flex items-center ${firstCellClass}`}>
                                {storage.name}
                              </div>
                              
                              <Show when={props.viewMode === 'node'}>
                                <div class="p-0.5 px-1.5 text-xs font-medium text-gray-900 dark:text-gray-100 w-[100px] flex-shrink-0 hidden sm:flex items-center">
                                  {storage.node}
                                </div>
                              </Show>
                              
                              <div class="p-0.5 px-1.5 w-[80px] flex-shrink-0 hidden md:flex items-center">
                                <span class="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
                                  {storage.type}
                                </span>
                              </div>
                              
                              <div class="p-0.5 px-1.5 text-xs text-gray-600 dark:text-gray-400 w-[222px] flex-shrink-0 hidden lg:flex items-center">
                                {storage.content || '-'}
                              </div>
                              
                              <div class="p-0.5 px-1.5 text-xs w-[80px] flex-shrink-0 hidden sm:flex items-center">
                                <span class={`${
                                  storage.status === 'available' ? 'text-green-600 dark:text-green-400' : 
                                  'text-red-600 dark:text-red-400'
                                }`}>
                                  {storage.status || 'unknown'}
                                </span>
                              </div>
                              
                              <div class="p-0.5 px-1.5 text-xs text-gray-600 dark:text-gray-400 w-[60px] flex-shrink-0 hidden lg:flex items-center">
                                {storage.shared ? '✓' : '-'}
                              </div>
                              
                              <div class="p-0.5 px-1.5 min-w-[300px] flex-1 flex items-center">
                                <div class="relative w-full h-3.5 rounded overflow-hidden bg-gray-200 dark:bg-gray-600">
                                  <div 
                                    class={`absolute top-0 left-0 h-full ${getProgressBarColor(usagePercent)}`}
                                    style={{ width: `${usagePercent}%` }}
                                  />
                                  <span class="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-gray-800 dark:text-gray-100 leading-none">
                                    <span class="whitespace-nowrap px-0.5">
                                      {usagePercent.toFixed(0)}% ({formatBytes(storage.used || 0)}/{formatBytes(storage.total || 0)})
                                    </span>
                                  </span>
                                </div>
                              </div>
                              
                              <div class="p-0.5 px-1.5 text-xs w-[80px] flex-shrink-0 hidden sm:flex items-center">
                                {formatBytes(storage.free || 0)}
                              </div>
                              
                              <div class="p-0.5 px-1.5 text-xs w-[80px] flex-shrink-0 flex items-center">
                                {formatBytes(storage.total || 0)}
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