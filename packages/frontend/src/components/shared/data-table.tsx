'use client';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TableSkeleton } from './loading-skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  total: number;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<number>;
  onSelectionChange?: (ids: Set<number>) => void;
  getId?: (item: T) => number;
  bulkActions?: React.ReactNode;
}

export function DataTable<T>({
  columns, data, total, page, perPage, onPageChange, isLoading,
  selectable, selectedIds = new Set(), onSelectionChange, getId,
  bulkActions,
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / perPage);

  if (isLoading) return <TableSkeleton rows={5} cols={columns.length} />;

  const allSelected = data.length > 0 && getId && data.every(item => selectedIds.has(getId(item)));

  const toggleAll = () => {
    if (!getId || !onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(item => getId(item))));
    }
  };

  const toggleOne = (id: number) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  return (
    <div>
      {selectedIds.size > 0 && bulkActions && (
        <div className="mb-3 p-3 bg-tw-blue-light border border-tw-blue/20 rounded-lg flex items-center gap-3">
          <span className="text-xs text-tw-blue font-medium">{selectedIds.size} selected</span>
          {bulkActions}
        </div>
      )}

      <div className="border border-card-border rounded-[14px] bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
              )}
              {columns.map(col => (
                <TableHead key={col.key} className={col.className}>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
                    {col.header}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 && (
              <TableRow>
                <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="text-center py-8">
                  <span className="text-xs text-text-muted">No data to display</span>
                </TableCell>
              </TableRow>
            )}
            {data.map((item, i) => {
              const id = getId?.(item);
              return (
                <TableRow key={id ?? i} className="hover:bg-surface/50">
                  {selectable && id !== undefined && (
                    <TableCell>
                      <Checkbox checked={selectedIds.has(id)} onCheckedChange={() => toggleOne(id)} />
                    </TableCell>
                  )}
                  {columns.map(col => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render(item)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-text-muted">
            Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-text-secondary px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
