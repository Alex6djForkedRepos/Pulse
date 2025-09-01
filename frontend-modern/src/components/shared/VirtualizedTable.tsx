import { Component, For, Show, createMemo, JSX } from 'solid-js';
import { createVirtualizer } from '@tanstack/solid-virtual';

interface Column {
  key: string;
  label: string;
  width?: string;
  minWidth?: string;
  sortable?: boolean;
  class?: string;
}

interface VirtualizedTableProps<T> {
  data: T[];
  columns: Column[];
  renderRow: (item: T, index: number) => JSX.Element;
  rowHeight?: number;
  tableHeight?: string;
  sortKey?: string | null;
  sortDirection?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  groupBy?: (item: T) => string;
  renderGroupHeader?: (group: string) => JSX.Element;
  emptyMessage?: string;
  class?: string;
}

export function VirtualizedTable<T>(props: VirtualizedTableProps<T>) {
  let scrollContainer: HTMLDivElement | undefined;
  
  // Process data with grouping if needed
  const processedItems = createMemo(() => {
    const items: Array<{ type: 'header' | 'row'; data: any }> = [];
    
    if (props.groupBy && props.renderGroupHeader) {
      // Group the data
      const groups: Record<string, T[]> = {};
      props.data.forEach(item => {
        const group = props.groupBy!(item);
        if (!groups[group]) groups[group] = [];
        groups[group].push(item);
      });
      
      // Flatten into items with headers
      Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([group, groupItems]) => {
          items.push({ type: 'header', data: group });
          groupItems.forEach(item => {
            items.push({ type: 'row', data: item });
          });
        });
    } else {
      // No grouping, just rows
      props.data.forEach(item => {
        items.push({ type: 'row', data: item });
      });
    }
    
    return items;
  });
  
  const estimateSize = () => props.rowHeight || 36;
  
  const virtualizer = createVirtualizer({
    get count() { return processedItems().length; },
    getScrollElement: () => scrollContainer || null,
    estimateSize,
    overscan: 10,
  });
  
  return (
    <div class={`bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden ${props.class || ''}`}>
      <div class="overflow-x-auto">
        <div class="min-w-full">
          {/* Header */}
          <div class="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600 flex w-full">
            <For each={props.columns}>
              {(column) => (
                <div 
                  class={`px-2 py-1.5 text-left text-[11px] sm:text-xs font-medium uppercase tracking-wider text-gray-600 dark:text-gray-300 ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600' : ''
                  } ${column.class || ''}`}
                  style={{
                    width: column.width,
                    'min-width': column.minWidth || column.width,
                    'flex-grow': column.width ? '0' : '1',
                    'flex-shrink': '0'
                  }}
                  onClick={() => column.sortable && props.onSort?.(column.key)}
                >
                  {column.label}
                  <Show when={column.sortable && props.sortKey === column.key}>
                    {props.sortDirection === 'asc' ? ' ▲' : ' ▼'}
                  </Show>
                </div>
              )}
            </For>
          </div>
          
          {/* Virtual Scrolling Container */}
          <Show when={processedItems().length > 0} fallback={
            <div class="p-8 text-center text-gray-500 dark:text-gray-400">
              {props.emptyMessage || 'No data available'}
            </div>
          }>
            <div 
              ref={scrollContainer}
              style={{ 
                height: props.tableHeight || '600px',
                overflow: 'auto'
              }}
            >
              <div style={{ 
                height: `${virtualizer.getTotalSize()}px`,
                position: 'relative'
              }}>
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
                        <Show when={item?.type === 'header' && props.renderGroupHeader}>
                          {props.renderGroupHeader!(item.data)}
                        </Show>
                        
                        <Show when={item?.type === 'row'}>
                          {props.renderRow(item.data, virtualRow.index)}
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}