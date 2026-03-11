'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

const TWMAIL_FIELDS = [
  { value: 'email', label: 'Email' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'company', label: 'Company' },
  { value: 'city', label: 'City' },
  { value: 'country', label: 'Country' },
  { value: 'timezone', label: 'Timezone' },
  { value: '__skip', label: 'Skip this column' },
] as const;

const AUTO_MAP: Record<string, string> = {
  email: 'email',
  'e-mail': 'email',
  'email address': 'email',
  first_name: 'first_name',
  'first name': 'first_name',
  firstname: 'first_name',
  last_name: 'last_name',
  'last name': 'last_name',
  lastname: 'last_name',
  phone: 'phone',
  'phone number': 'phone',
  telephone: 'phone',
  company: 'company',
  organisation: 'company',
  organization: 'company',
  city: 'city',
  country: 'country',
  timezone: 'timezone',
};

interface ImportMapperProps {
  importId: number;
  detectedColumns: string[];
  onConfirm: (mapping: Record<string, string>) => void;
}

export function ImportMapper({ detectedColumns, onConfirm }: ImportMapperProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});

  useEffect(() => {
    const autoMapped: Record<string, string> = {};
    for (const col of detectedColumns) {
      const normalized = col.trim().toLowerCase();
      if (AUTO_MAP[normalized]) {
        autoMapped[col] = AUTO_MAP[normalized];
      } else {
        autoMapped[col] = '__skip';
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time column auto-mapping init
    setMapping(autoMapped);
  }, [detectedColumns]);

  const updateMapping = (column: string, field: string) => {
    setMapping((prev) => ({ ...prev, [column]: field }));
  };

  const handleConfirm = () => {
    const result: Record<string, string> = {};
    for (const [col, field] of Object.entries(mapping)) {
      if (field !== '__skip') {
        result[col] = field;
      }
    }
    onConfirm(result);
  };

  const hasEmailMapped = Object.values(mapping).includes('email');

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-1">Map Columns</h3>
      <p className="text-xs text-text-muted mb-4">
        Match your file columns to TWMail contact fields.
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 pb-2 border-b border-card-border">
          <p className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
            Detected Column
          </p>
          <p className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
            TWMail Field
          </p>
        </div>

        {detectedColumns.map((col) => (
          <div key={col} className="grid grid-cols-2 gap-4 items-center">
            <p className="text-xs text-text-primary font-medium truncate">{col}</p>
            <Select
              value={mapping[col] || '__skip'}
              onValueChange={(val) => updateMapping(col, val as string)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TWMAIL_FIELDS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      {!hasEmailMapped && (
        <p className="text-xs text-status-danger mt-3">
          You must map at least one column to Email.
        </p>
      )}

      <div className="mt-4 flex justify-end">
        <Button
          className="bg-tw-blue hover:bg-tw-blue-dark"
          size="sm"
          onClick={handleConfirm}
          disabled={!hasEmailMapped}
        >
          Confirm Mapping
        </Button>
      </div>
    </div>
  );
}
