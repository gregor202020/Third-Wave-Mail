'use client';
import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Upload, ClipboardPaste, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ImportMapper } from '@/components/contacts/import-mapper';
import { ImportStatus } from '@twmail/shared/types';
import type { Import } from '@/types';

type ImportStage = 'input' | 'mapping' | 'processing' | 'done';

interface ImportResponse {
  data: Import & { detected_columns?: string[] };
}

export default function ContactImportPage() {
  const [stage, setStage] = useState<ImportStage>('input');
  const [importId, setImportId] = useState<number | null>(null);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll import status
  const { data: importData } = useQuery({
    queryKey: queryKeys.imports.detail(importId!),
    queryFn: () =>
      api.get<{ data: Import }>(`/imports/${importId}`).then((r) => r.data),
    enabled: stage === 'processing' && importId !== null,
    refetchInterval: 2000,
  });

  // Check if processing completed
  if (
    stage === 'processing' &&
    importData &&
    importData.status !== ImportStatus.PROCESSING
  ) {
    // Move to done stage on next render
    if (stage === 'processing') {
      setTimeout(() => setStage('done'), 0);
    }
  }

  // Poll import errors
  const { data: importErrors } = useQuery({
    queryKey: queryKeys.imports.errors(importId!),
    queryFn: () =>
      api.get<{ data: Array<{ row: number; field: string; message: string }> }>(
        `/imports/${importId}/errors`
      ).then((r) => r.data),
    enabled: stage === 'done' && importId !== null,
  });

  const handlePasteSubmit = async () => {
    if (!pasteText.trim()) {
      toast.error('Please paste some data first');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<ImportResponse>('/contacts/import/paste', {
        text: pasteText,
      });
      setImportId(res.data.id);
      const columns = res.data.detected_columns;
      if (columns && columns.length > 0) {
        setDetectedColumns(columns);
        setStage('mapping');
      } else {
        setStage('processing');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Import failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload<ImportResponse>('/contacts/import/csv', formData);
      setImportId(res.data.id);
      const columns = res.data.detected_columns;
      if (columns && columns.length > 0) {
        setDetectedColumns(columns);
        setStage('mapping');
      } else {
        setStage('processing');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) {
        handleFileUpload(file);
      } else {
        toast.error('Please upload a CSV file');
      }
    },
    []
  );

  const handleMappingConfirm = async (mapping: Record<string, string>) => {
    if (!importId) return;
    try {
      await api.post(`/imports/${importId}/mapping`, { mapping });
      setStage('processing');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save mapping';
      toast.error(message);
    }
  };

  const progressPercent =
    importData && importData.total_rows > 0
      ? Math.round(
          ((importData.new_contacts + importData.updated_contacts + importData.skipped) /
            importData.total_rows) *
            100
        )
      : 0;

  return (
    <>
      <TopBar
        action={
          <Link
            href="/contacts"
            className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Contacts
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[700px] mx-auto">
          <h2 className="text-xl font-semibold text-text-primary tracking-tight mb-1">
            Import Contacts
          </h2>
          <p className="text-sm text-text-muted mb-6">
            Add contacts by pasting data or uploading a CSV file.
          </p>

          {/* Input stage */}
          {stage === 'input' && (
            <Tabs defaultValue="paste">
              <TabsList>
                <TabsTrigger value="paste">
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  Paste
                </TabsTrigger>
                <TabsTrigger value="csv">
                  <Upload className="w-3.5 h-3.5" />
                  Upload CSV
                </TabsTrigger>
              </TabsList>

              <TabsContent value="paste" className="pt-4">
                <div className="bg-card border border-card-border rounded-[14px] p-5">
                  <p className="text-xs text-text-muted mb-3">
                    Paste email addresses or tab/comma-separated data with headers.
                  </p>
                  <Textarea
                    placeholder={"email,first_name,last_name\njohn@example.com,John,Doe\njane@example.com,Jane,Smith"}
                    className="min-h-[200px] font-mono text-xs"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                  />
                  <div className="mt-3 flex justify-end">
                    <Button
                      className="bg-tw-blue hover:bg-tw-blue-dark"
                      size="sm"
                      onClick={handlePasteSubmit}
                      disabled={submitting}
                    >
                      {submitting ? 'Importing...' : 'Import'}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="csv" className="pt-4">
                <div
                  className={`bg-card border-2 border-dashed rounded-[14px] p-10 text-center transition-colors ${
                    dragOver
                      ? 'border-tw-blue bg-tw-blue-light'
                      : 'border-card-border'
                  }`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <Upload className="w-8 h-8 text-text-muted mx-auto mb-3" />
                  <p className="text-sm text-text-primary font-medium mb-1">
                    Drag & drop a CSV file here
                  </p>
                  <p className="text-xs text-text-muted mb-4">or click to browse</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={submitting}
                  >
                    {submitting ? 'Uploading...' : 'Choose File'}
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Mapping stage */}
          {stage === 'mapping' && importId && (
            <ImportMapper
              importId={importId}
              detectedColumns={detectedColumns}
              onConfirm={handleMappingConfirm}
            />
          )}

          {/* Processing stage */}
          {stage === 'processing' && (
            <div className="bg-card border border-card-border rounded-[14px] p-8 text-center">
              <div className="w-10 h-10 rounded-full bg-tw-blue-light flex items-center justify-center mx-auto mb-4">
                <Upload className="w-5 h-5 text-tw-blue animate-pulse" />
              </div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">
                Processing Import...
              </h3>
              <p className="text-xs text-text-muted mb-4">
                {importData
                  ? `${importData.new_contacts + importData.updated_contacts + importData.skipped} of ${importData.total_rows} rows`
                  : 'Starting...'}
              </p>
              {/* Progress bar */}
              <div className="w-full max-w-xs mx-auto h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-tw-blue rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Done stage */}
          {stage === 'done' && importData && (
            <div className="space-y-4">
              <div className="bg-card border border-card-border rounded-[14px] p-6">
                <div className="flex items-center gap-3 mb-4">
                  {importData.status === ImportStatus.COMPLETED ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-red-500" />
                  )}
                  <h3 className="text-sm font-semibold text-text-primary">
                    {importData.status === ImportStatus.COMPLETED
                      ? 'Import Complete'
                      : 'Import Failed'}
                  </h3>
                </div>

                <div className="grid grid-cols-4 gap-4">
                  <SummaryCard label="Total Rows" value={importData.total_rows} />
                  <SummaryCard label="New Contacts" value={importData.new_contacts} />
                  <SummaryCard label="Updated" value={importData.updated_contacts} />
                  <SummaryCard label="Skipped" value={importData.skipped} />
                </div>
              </div>

              {/* Error table */}
              {importErrors && importErrors.length > 0 && (
                <div className="bg-card border border-card-border rounded-[14px] p-5">
                  <h4 className="text-xs font-semibold text-text-primary mb-3">
                    Errors ({importErrors.length})
                  </h4>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {importErrors.map((err, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-3 py-2 bg-red-50 rounded-lg text-xs"
                      >
                        <span className="text-text-muted shrink-0">Row {err.row}</span>
                        <span className="text-text-secondary font-medium">{err.field}</span>
                        <span className="text-red-600">{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Link href="/contacts">
                  <Button className="bg-tw-blue hover:bg-tw-blue-dark" size="sm">
                    View Contacts
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="text-lg font-semibold text-text-primary">{value}</p>
      <p className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
        {label}
      </p>
    </div>
  );
}
