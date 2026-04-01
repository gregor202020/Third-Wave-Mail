'use client';
import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { toast } from 'sonner';
import {
  ChevronDown, Check, Settings, Users, Palette, Clock, FlaskConical, RotateCcw, Rocket,
  FileText, Plus, Save, BookmarkPlus, BarChart,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplatePicker } from '@/components/editor/template-picker';
import type { GrapesEditorRef } from '@/components/editor/grapes-editor';
import type { Campaign, Segment, List } from '@/types';

const GrapesEditor = dynamic(
  () => import('@/components/editor/grapes-editor').then((mod) => ({ default: mod.GrapesEditor })),
  { ssr: false, loading: () => <Skeleton className="min-h-[600px]" /> }
);

// ============================================================================
// Types
// ============================================================================

interface CampaignFormData {
  name: string;
  subject: string;
  preview_text: string;
  from_name: string;
  from_email: string;
  sending_domain: string;
  segment_id: number | null;
  list_id: number | null;
  exclude_segment_ids: number[];
  schedule_type: 'now' | 'later';
  scheduled_date: string;
  scheduled_time: string;
  timezone: string;
  ab_test_enabled: boolean;
  ab_test_variable: string;
  ab_test_variants: Array<{ name: string; value: string }>;
  ab_test_percentage: number;
  ab_test_win_criteria: string;
  ab_test_auto_send: boolean;
  ab_test_duration: string;
  resend_enabled: boolean;
  resend_delay: string;
  resend_subject_change: 'same' | 'different';
  resend_different_subject: string;
  resend_engaged_only: boolean;
  resend_max: number;
  reply_to: string;
  tags: string;
  utm_enabled: boolean;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  ga_tracking: boolean;
  tracking_domain: string;
  open_tracking: boolean;
  click_tracking: boolean;
  send_time_optimization: boolean;
}

interface CampaignAccordionProps {
  campaign: Campaign;
  onSave: (data: Partial<CampaignFormData>) => void;
  onSend: () => void;
  onSchedule: (scheduledAt: string, timezone: string) => void;
  isSaving?: boolean;
}

function getInitialFormData(campaign: Campaign): CampaignFormData {
  const abConfig = (campaign.ab_test_config ?? {}) as Record<string, unknown>;
  const resendConfig = (campaign.resend_config ?? {}) as Record<string, unknown>;
  return {
    name: campaign.name ?? '',
    subject: campaign.subject ?? '',
    preview_text: campaign.preview_text ?? '',
    from_name: campaign.from_name ?? '',
    from_email: campaign.from_email ?? '',
    sending_domain: campaign.sending_domain ?? 'news',
    segment_id: campaign.segment_id ?? null,
    list_id: campaign.list_id ?? null,
    exclude_segment_ids: [],
    schedule_type: campaign.scheduled_at ? 'later' : 'now',
    scheduled_date: campaign.scheduled_at
      ? new Date(campaign.scheduled_at).toISOString().split('T')[0]
      : '',
    scheduled_time: campaign.scheduled_at
      ? new Date(campaign.scheduled_at).toTimeString().slice(0, 5)
      : '',
    timezone: campaign.timezone ?? 'Australia/Sydney',
    ab_test_enabled: campaign.ab_test_enabled ?? false,
    ab_test_variable: (abConfig.variable as string) ?? 'subject',
    ab_test_variants: Array.isArray(abConfig.variants) ? abConfig.variants as Array<{ name: string; value: string }> : [
      { name: 'Variant A', value: '' },
      { name: 'Variant B', value: '' },
    ],
    ab_test_percentage: (abConfig.percentage as number) ?? 20,
    ab_test_win_criteria: (abConfig.win_criteria as string) ?? 'open_rate',
    ab_test_auto_send: (abConfig.auto_send as boolean) ?? true,
    ab_test_duration: (abConfig.duration as string) ?? '4h',
    resend_enabled: campaign.resend_enabled ?? false,
    resend_delay: (resendConfig.delay as string) ?? '24h',
    resend_subject_change: (resendConfig.subject_change as 'same' | 'different') ?? 'same',
    resend_different_subject: (resendConfig.different_subject as string) ?? '',
    resend_engaged_only: (resendConfig.engaged_only as boolean) ?? false,
    resend_max: (resendConfig.max as number) ?? 1,
    reply_to: campaign.reply_to ?? '',
    tags: Array.isArray(campaign.tags) ? (campaign.tags as string[]).join(', ') : (campaign.tags ?? ''),
    utm_enabled: campaign.utm_enabled ?? false,
    utm_source: campaign.utm_source ?? 'twmail',
    utm_medium: campaign.utm_medium ?? 'email',
    utm_campaign: campaign.utm_campaign ?? campaign.name ?? '',
    utm_content: campaign.utm_content ?? '',
    ga_tracking: campaign.ga_tracking ?? false,
    tracking_domain: campaign.tracking_domain ?? '',
    open_tracking: campaign.open_tracking ?? true,
    click_tracking: campaign.click_tracking ?? true,
    send_time_optimization: campaign.send_time_optimization ?? false,
  };
}

// ============================================================================
// Section Header
// ============================================================================

interface SectionHeaderProps {
  number: number;
  title: string;
  icon: React.ElementType;
  isValid: boolean;
  isOpen: boolean;
  onToggle: () => void;
}

function SectionHeader({ number, title, icon: Icon, isValid, isOpen, onToggle }: SectionHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-5 py-4 bg-card border border-card-border rounded-[14px] hover:border-tw-blue/30 transition-colors"
    >
      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-surface text-xs font-semibold text-text-secondary">
        {number}
      </span>
      <Icon className="w-4 h-4 text-text-muted" />
      <span className="text-sm font-medium text-text-primary flex-1 text-left">{title}</span>
      {isValid && (
        <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="w-3 h-3 text-green-600" />
        </span>
      )}
      <ChevronDown className={cn('w-4 h-4 text-text-muted transition-transform', isOpen && 'rotate-180')} />
    </button>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function CampaignAccordion({ campaign, onSave, onSend, onSchedule, isSaving }: CampaignAccordionProps) {
  const [formData, setFormData] = useState<CampaignFormData>(() => getInitialFormData(campaign));
  const [openSection, setOpenSection] = useState(0);

  const { data: segmentsData } = useQuery({
    queryKey: queryKeys.segments.list(),
    queryFn: () => api.get<{ data: Segment[] }>('/segments'),
    enabled: openSection === 1,
  });

  const { data: listsData } = useQuery({
    queryKey: queryKeys.lists.list(),
    queryFn: () => api.get<{ data: List[] }>('/lists'),
    enabled: openSection === 1,
  });

  const segments = Array.isArray(segmentsData?.data) ? segmentsData.data : [];
  const lists = Array.isArray(listsData?.data) ? listsData.data : [];

  const formDataRef = useRef(formData);
  formDataRef.current = formData;

  const update = useCallback((changes: Partial<CampaignFormData>) => {
    setFormData((prev) => ({ ...prev, ...changes }));
  }, []);

  const handleBlurSave = useCallback(() => {
    const { exclude_segment_ids, schedule_type, scheduled_date, scheduled_time,
      ab_test_variable, ab_test_variants, ab_test_percentage, ab_test_win_criteria,
      ab_test_auto_send, ab_test_duration, resend_delay, resend_subject_change,
      resend_different_subject, resend_engaged_only, resend_max, tags,
      ...apiFields } = formDataRef.current;
    // Convert tags from comma-separated string to array for the API
    const tagsArray = typeof tags === 'string'
      ? tags.split(',').map(t => t.trim()).filter(Boolean)
      : Array.isArray(tags) ? tags : [];
    // Build resend_config from form fields so the worker can use it
    const resend_config = apiFields.resend_enabled
      ? {
          wait_hours: parseInt(resend_delay) || 24,
          trigger: 'non_open' as const,
          new_subject: resend_subject_change === 'different' ? resend_different_subject : undefined,
          only_engaged_days: resend_engaged_only ? 90 : undefined,
        }
      : null;
    onSave({ ...apiFields, tags: tagsArray as unknown as string, resend_config } as Partial<CampaignFormData>);
  }, [onSave]);

  const toggleSection = (idx: number) => {
    setOpenSection((prev) => (prev === idx ? -1 : idx));
  };

  // Validation
  const setupValid = !!(formData.name && formData.subject && formData.from_name && formData.from_email);
  const recipientsValid = !!(formData.segment_id || formData.list_id);
  const designValid = !!campaign.content_html;
  const schedulingValid = formData.schedule_type === 'now' || !!(formData.scheduled_date && formData.scheduled_time);
  const abValid = !formData.ab_test_enabled || (Array.isArray(formData.ab_test_variants) && formData.ab_test_variants.every((v) => v.value));
  const resendValid = !formData.resend_enabled || !!formData.resend_delay;

  const allValid = setupValid && recipientsValid && designValid && schedulingValid && abValid && resendValid;

  const sections = [
    { title: 'Setup', icon: Settings, valid: setupValid },
    { title: 'Recipients', icon: Users, valid: recipientsValid },
    { title: 'Design', icon: Palette, valid: designValid },
    { title: 'Scheduling', icon: Clock, valid: schedulingValid },
    { title: 'Tracking', icon: BarChart, valid: true }, // always valid, optional settings
    { title: 'A/B Testing', icon: FlaskConical, valid: abValid },
    { title: 'Resend to Non-Openers', icon: RotateCcw, valid: resendValid },
    { title: 'Review & Send', icon: Rocket, valid: allValid },
  ];

  return (
    <div className="space-y-3">
      {/* Section 1: Setup */}
      <div>
        <SectionHeader number={1} title={sections[0].title} icon={sections[0].icon} isValid={sections[0].valid} isOpen={openSection === 0} onToggle={() => toggleSection(0)} />
        {openSection === 0 && (
          <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5 space-y-4">
            <div>
              <Label htmlFor="name" className="text-xs text-text-muted mb-1">Campaign Name</Label>
              <Input id="name" value={formData.name} onChange={(e) => update({ name: e.target.value })} onBlur={handleBlurSave} placeholder="e.g. Summer Sale Announcement" />
            </div>
            <div>
              <Label htmlFor="subject" className="text-xs text-text-muted mb-1">Subject Line</Label>
              <Input id="subject" value={formData.subject} onChange={(e) => update({ subject: e.target.value })} onBlur={handleBlurSave} placeholder="e.g. Don't miss our summer deals!" />
            </div>
            <div>
              <Label htmlFor="preview_text" className="text-xs text-text-muted mb-1">Preview Text</Label>
              <Textarea id="preview_text" value={formData.preview_text} onChange={(e) => update({ preview_text: e.target.value })} onBlur={handleBlurSave} placeholder="Text shown after the subject in inbox previews" className="min-h-[60px]" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="from_name" className="text-xs text-text-muted mb-1">From Name</Label>
                <Input id="from_name" value={formData.from_name} onChange={(e) => update({ from_name: e.target.value })} onBlur={handleBlurSave} />
              </div>
              <div>
                <Label htmlFor="from_email" className="text-xs text-text-muted mb-1">From Email</Label>
                <Input id="from_email" type="email" value={formData.from_email} onChange={(e) => update({ from_email: e.target.value })} onBlur={handleBlurSave} />
              </div>
            </div>
            <div>
              <Label className="text-xs text-text-muted mb-1">Sending Type</Label>
              <Select value={formData.sending_domain} onValueChange={(val) => { update({ sending_domain: val }); handleBlurSave(); }}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="news">Marketing / Newsletter</SelectItem>
                  <SelectItem value="franchise">Franchise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reply_to" className="text-xs text-text-muted mb-1">Reply-to Email (optional)</Label>
              <Input id="reply_to" type="email" value={formData.reply_to} onChange={(e) => update({ reply_to: e.target.value })} onBlur={handleBlurSave} placeholder="Leave blank to use From Email" />
            </div>
            <div>
              <Label htmlFor="tags" className="text-xs text-text-muted mb-1">Campaign Tags</Label>
              <Input id="tags" value={formData.tags} onChange={(e) => update({ tags: e.target.value })} onBlur={handleBlurSave} placeholder="Comma-separated tags, e.g. newsletter, promo, Q1" />
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Recipients */}
      <div>
        <SectionHeader number={2} title={sections[1].title} icon={sections[1].icon} isValid={sections[1].valid} isOpen={openSection === 1} onToggle={() => toggleSection(1)} />
        {openSection === 1 && (
          <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5 space-y-4">
            <div>
              <Label className="text-xs text-text-muted mb-1">Send to Segment</Label>
              <Select
                value={formData.segment_id?.toString() ?? 'none'}
                onValueChange={(val: string | null) => {
                  const changes = val && val !== 'none'
                    ? { segment_id: Number(val), list_id: null }
                    : { segment_id: null };
                  update(changes);
                  onSave(changes);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a segment..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No segment</SelectItem>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-xs text-text-muted text-center">or</div>
            <div>
              <Label className="text-xs text-text-muted mb-1">Send to List</Label>
              <Select
                value={formData.list_id?.toString() ?? ''}
                onValueChange={(val: string | null) => {
                  const changes = { list_id: val ? Number(val) : null, segment_id: null };
                  update(changes);
                  onSave(changes);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a list..." />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id.toString()}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-text-muted mb-1">Exclude Segments (optional)</Label>
              <Select
                value={formData.exclude_segment_ids[0]?.toString() ?? ''}
                onValueChange={(val: string | null) => {
                  const ids = val ? [Number(val)] : [];
                  update({ exclude_segment_ids: ids });
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Exclude a segment..." />
                </SelectTrigger>
                <SelectContent>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Design */}
      <div>
        <SectionHeader number={3} title={sections[2].title} icon={sections[2].icon} isValid={sections[2].valid} isOpen={openSection === 2} onToggle={() => toggleSection(2)} />
        {openSection === 2 && (
          <DesignSection campaign={campaign} onSave={onSave} isSaving={isSaving} />
        )}
      </div>

      {/* Section 4: Scheduling */}
      <div>
        <SectionHeader number={4} title={sections[3].title} icon={sections[3].icon} isValid={sections[3].valid} isOpen={openSection === 3} onToggle={() => toggleSection(3)} />
        {openSection === 3 && (
          <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5 space-y-4">
            <RadioGroup
              value={formData.schedule_type}
              onValueChange={(val) => update({ schedule_type: val as 'now' | 'later' })}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="now" />
                <Label className="text-xs">Send Now</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="later" />
                <Label className="text-xs">Schedule for Later</Label>
              </div>
            </RadioGroup>
            {formData.schedule_type === 'later' && (
              <div className="grid grid-cols-3 gap-4 pt-2">
                <div>
                  <Label className="text-xs text-text-muted mb-1">Date</Label>
                  <Input type="date" value={formData.scheduled_date} onChange={(e) => update({ scheduled_date: e.target.value })} onBlur={handleBlurSave} />
                </div>
                <div>
                  <Label className="text-xs text-text-muted mb-1">Time</Label>
                  <Input type="time" value={formData.scheduled_time} onChange={(e) => update({ scheduled_time: e.target.value })} onBlur={handleBlurSave} />
                </div>
                <div>
                  <Label className="text-xs text-text-muted mb-1">Timezone</Label>
                  <Select value={formData.timezone} onValueChange={(val) => val && update({ timezone: val })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Australia/Sydney">Australia/Sydney</SelectItem>
                      <SelectItem value="Australia/Melbourne">Australia/Melbourne</SelectItem>
                      <SelectItem value="Australia/Brisbane">Australia/Brisbane</SelectItem>
                      <SelectItem value="Australia/Perth">Australia/Perth</SelectItem>
                      <SelectItem value="Pacific/Auckland">Pacific/Auckland</SelectItem>
                      <SelectItem value="America/New_York">America/New_York</SelectItem>
                      <SelectItem value="America/Chicago">America/Chicago</SelectItem>
                      <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                      <SelectItem value="Europe/London">Europe/London</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <div>
                <Label className="text-xs">Send Time Optimization</Label>
                <p className="text-[11px] text-text-muted mt-0.5">Send at each recipient&apos;s optimal time based on past engagement</p>
              </div>
              <Switch
                checked={formData.send_time_optimization}
                onCheckedChange={(checked) => update({ send_time_optimization: !!checked })}
              />
            </div>
            {formData.send_time_optimization && (
              <div className="bg-surface rounded-lg p-3 text-xs text-text-secondary">
                Emails will be sent over a 24-hour window at each contact&apos;s historically optimal engagement time.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Section 5: Tracking */}
      <div>
        <SectionHeader number={5} title={sections[4].title} icon={sections[4].icon} isValid={sections[4].valid} isOpen={openSection === 4} onToggle={() => toggleSection(4)} />
        {openSection === 4 && (
          <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs">UTM Tracking</Label>
              <Switch
                checked={formData.utm_enabled}
                onCheckedChange={(checked) => update({ utm_enabled: !!checked })}
              />
            </div>
            {formData.utm_enabled && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="utm_source" className="text-xs text-text-muted mb-1">utm_source</Label>
                    <Input id="utm_source" value={formData.utm_source} onChange={(e) => update({ utm_source: e.target.value })} onBlur={handleBlurSave} placeholder="twmail" />
                  </div>
                  <div>
                    <Label htmlFor="utm_medium" className="text-xs text-text-muted mb-1">utm_medium</Label>
                    <Input id="utm_medium" value={formData.utm_medium} onChange={(e) => update({ utm_medium: e.target.value })} onBlur={handleBlurSave} placeholder="email" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="utm_campaign" className="text-xs text-text-muted mb-1">utm_campaign</Label>
                    <Input id="utm_campaign" value={formData.utm_campaign} onChange={(e) => update({ utm_campaign: e.target.value })} onBlur={handleBlurSave} placeholder="Campaign name" />
                  </div>
                  <div>
                    <Label htmlFor="utm_content" className="text-xs text-text-muted mb-1">utm_content (optional)</Label>
                    <Input id="utm_content" value={formData.utm_content} onChange={(e) => update({ utm_content: e.target.value })} onBlur={handleBlurSave} placeholder="e.g. variant-a" />
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Open Tracking</Label>
                <p className="text-[11px] text-text-muted">Track when recipients open the email. Disable to improve inbox placement.</p>
              </div>
              <Switch
                checked={formData.open_tracking}
                onCheckedChange={(checked) => { update({ open_tracking: !!checked }); onSave({ open_tracking: !!checked }); }}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs">Click Tracking</Label>
                <p className="text-[11px] text-text-muted">Track link clicks. Disable to keep original URLs and improve inbox placement.</p>
              </div>
              <Switch
                checked={formData.click_tracking}
                onCheckedChange={(checked) => { update({ click_tracking: !!checked }); onSave({ click_tracking: !!checked }); }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">Google Analytics Tracking</Label>
              <Switch
                checked={formData.ga_tracking}
                onCheckedChange={(checked) => update({ ga_tracking: !!checked })}
              />
            </div>
            <div>
              <Label htmlFor="tracking_domain" className="text-xs text-text-muted mb-1">Custom Tracking Domain (optional)</Label>
              <Input id="tracking_domain" value={formData.tracking_domain} onChange={(e) => update({ tracking_domain: e.target.value })} onBlur={handleBlurSave} placeholder="e.g. track.yourdomain.com" />
            </div>
          </div>
        )}
      </div>

      {/* Section 6: A/B Testing */}
      <div>
        <SectionHeader number={6} title={sections[5].title} icon={sections[5].icon} isValid={sections[5].valid} isOpen={openSection === 5} onToggle={() => toggleSection(5)} />
        {openSection === 5 && (
          <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Enable A/B Testing</Label>
              <Switch
                checked={formData.ab_test_enabled}
                onCheckedChange={(checked) => update({ ab_test_enabled: !!checked })}
              />
            </div>
            {formData.ab_test_enabled && (
              <>
                <div>
                  <Label className="text-xs text-text-muted mb-1">Test Variable</Label>
                  <Select value={formData.ab_test_variable} onValueChange={(val) => val && update({ ab_test_variable: val })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="subject">Subject Line</SelectItem>
                      <SelectItem value="from_name">From Name</SelectItem>
                      <SelectItem value="content">Content</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label className="text-xs text-text-muted">Variants</Label>
                  {formData.ab_test_variants.map((variant, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs text-text-muted w-20">{variant.name}</span>
                      <Input
                        value={variant.value}
                        onChange={(e) => {
                          const variants = [...formData.ab_test_variants];
                          variants[idx] = { ...variants[idx], value: e.target.value };
                          update({ ab_test_variants: variants });
                        }}
                        onBlur={handleBlurSave}
                        placeholder={`Enter ${formData.ab_test_variable} for ${variant.name}`}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <Label className="text-xs text-text-muted mb-1">Test Audience: {formData.ab_test_percentage}%</Label>
                  <Slider
                    value={[formData.ab_test_percentage]}
                    onValueChange={(val) => update({ ab_test_percentage: Array.isArray(val) ? val[0] : val })}
                    min={10}
                    max={50}
                    step={5}
                  />
                </div>
                <div>
                  <Label className="text-xs text-text-muted mb-1">Win Criteria</Label>
                  <Select value={formData.ab_test_win_criteria} onValueChange={(val) => val && update({ ab_test_win_criteria: val })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open_rate">Open Rate</SelectItem>
                      <SelectItem value="click_rate">Click Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Auto-send Winner</Label>
                  <Switch
                    checked={formData.ab_test_auto_send}
                    onCheckedChange={(checked) => update({ ab_test_auto_send: !!checked })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-text-muted mb-1">Test Duration</Label>
                  <Select value={formData.ab_test_duration} onValueChange={(val) => val && update({ ab_test_duration: val })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">1 hour</SelectItem>
                      <SelectItem value="2h">2 hours</SelectItem>
                      <SelectItem value="4h">4 hours</SelectItem>
                      <SelectItem value="8h">8 hours</SelectItem>
                      <SelectItem value="24h">24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section 7: Resend to Non-Openers */}
      <div>
        <SectionHeader number={7} title={sections[6].title} icon={sections[6].icon} isValid={sections[6].valid} isOpen={openSection === 6} onToggle={() => toggleSection(6)} />
        {openSection === 6 && (
          <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Enable Resend to Non-Openers</Label>
              <Switch
                checked={formData.resend_enabled}
                onCheckedChange={(checked) => update({ resend_enabled: !!checked })}
              />
            </div>
            {formData.resend_enabled && (
              <>
                <div>
                  <Label className="text-xs text-text-muted mb-1">Delay</Label>
                  <Select value={formData.resend_delay} onValueChange={(val) => val && update({ resend_delay: val })}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24h">24 hours</SelectItem>
                      <SelectItem value="48h">48 hours</SelectItem>
                      <SelectItem value="72h">72 hours</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-text-muted mb-2">Subject Line</Label>
                  <RadioGroup
                    value={formData.resend_subject_change}
                    onValueChange={(val) => update({ resend_subject_change: val as 'same' | 'different' })}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="same" />
                      <Label className="text-xs">Same subject</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="different" />
                      <Label className="text-xs">Different subject</Label>
                    </div>
                  </RadioGroup>
                  {formData.resend_subject_change === 'different' && (
                    <Input
                      className="mt-2"
                      value={formData.resend_different_subject}
                      onChange={(e) => update({ resend_different_subject: e.target.value })}
                      onBlur={handleBlurSave}
                      placeholder="New subject line for resend"
                    />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Send only to engaged contacts</Label>
                  <Switch
                    checked={formData.resend_engaged_only}
                    onCheckedChange={(checked) => update({ resend_engaged_only: !!checked })}
                  />
                </div>
                <div>
                  <Label className="text-xs text-text-muted mb-2">Max Resends</Label>
                  <RadioGroup
                    value={formData.resend_max.toString()}
                    onValueChange={(val) => update({ resend_max: Number(val) })}
                    className="flex gap-4"
                  >
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="flex items-center gap-1.5">
                        <RadioGroupItem value={n.toString()} />
                        <Label className="text-xs">{n}</Label>
                      </div>
                    ))}
                  </RadioGroup>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Section 8: Review & Send */}
      <div>
        <SectionHeader number={8} title={sections[7].title} icon={sections[7].icon} isValid={sections[7].valid} isOpen={openSection === 7} onToggle={() => toggleSection(7)} />
        {openSection === 7 && (
          <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5 space-y-5">
            {/* Summary */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Summary</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-surface rounded-lg p-3">
                  <span className="text-text-muted">Subject:</span>{' '}
                  <span className="text-text-primary font-medium">{formData.subject || 'Not set'}</span>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <span className="text-text-muted">From:</span>{' '}
                  <span className="text-text-primary font-medium">
                    {formData.from_name ? `${formData.from_name} <${formData.from_email}>` : 'Not set'}
                  </span>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <span className="text-text-muted">Recipients:</span>{' '}
                  <span className="text-text-primary font-medium">
                    {formData.segment_id ? 'Segment selected' : formData.list_id ? 'List selected' : 'Not set'}
                  </span>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <span className="text-text-muted">Schedule:</span>{' '}
                  <span className="text-text-primary font-medium">
                    {formData.schedule_type === 'now' ? 'Send immediately' : `${formData.scheduled_date} ${formData.scheduled_time}`}
                  </span>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <span className="text-text-muted">UTM Tracking:</span>{' '}
                  <span className="text-text-primary font-medium">
                    {formData.utm_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
                <div className="bg-surface rounded-lg p-3">
                  <span className="text-text-muted">Tags:</span>{' '}
                  <span className="text-text-primary font-medium">
                    {formData.tags || 'None'}
                  </span>
                </div>
              </div>
            </div>

            {/* Validation Checklist */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-text-primary uppercase tracking-wider">Pre-Send Checklist</h4>
              <ChecklistItem label="Subject line set" checked={!!formData.subject} />
              <ChecklistItem label="Recipients selected" checked={recipientsValid} />
              <ChecklistItem label="Content set" checked={designValid} />
              <ChecklistItem label="From name & email set" checked={!!(formData.from_name && formData.from_email)} />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onSave(formData)}
                disabled={isSaving}
              >
                {isSaving ? 'Saving...' : 'Save Draft'}
              </Button>
              {formData.schedule_type === 'later' ? (
                <Button
                  className="bg-tw-red hover:bg-tw-red-dark"
                  size="sm"
                  disabled={!allValid || !formData.scheduled_date || !formData.scheduled_time}
                  onClick={() => {
                    const scheduledAt = `${formData.scheduled_date}T${formData.scheduled_time}:00`;
                    onSchedule(scheduledAt, formData.timezone);
                  }}
                >
                  Schedule Campaign
                </Button>
              ) : (
                <Button
                  className="bg-tw-red hover:bg-tw-red-dark"
                  size="sm"
                  disabled={!allValid}
                  onClick={onSend}
                >
                  Send Campaign
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Design Section
// ============================================================================

interface DesignSectionProps {
  campaign: Campaign;
  onSave: (data: Partial<CampaignFormData>) => void;
  isSaving?: boolean;
}

function DesignSection({ campaign, onSave, isSaving }: DesignSectionProps) {
  const editorRef = useRef<GrapesEditorRef>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editorContent, setEditorContent] = useState<string | undefined>(undefined);
  const [saveAsTemplateOpen, setSaveAsTemplateOpen] = useState(false);

  const hasContent = !!campaign.content_html;

  const handleTemplateSelect = useCallback(
    (template: { id: number; content_html: string; content_json?: string } | null) => {
      if (template) {
        // Use JSON if available, otherwise HTML
        setEditorContent(template.content_json || template.content_html);
      } else {
        // Blank
        setEditorContent(undefined);
      }
      setShowEditor(true);
    },
    []
  );

  const handleEditDesign = useCallback(() => {
    // Load existing campaign content into editor
    const json = campaign.content_json;
    if (json && typeof json === 'object' && Object.keys(json).length > 0) {
      setEditorContent(JSON.stringify(json));
    } else {
      setEditorContent(campaign.content_html || undefined);
    }
    setShowEditor(true);
  }, [campaign]);

  const handleSaveDesign = useCallback(() => {
    if (!editorRef.current) return;
    const content_html = editorRef.current.getHtml();
    const content_json = editorRef.current.getJson();
    onSave({ content_html, content_json } as unknown as Partial<CampaignFormData>);
    toast.success('Design saved');
  }, [onSave]);

  // Editor is open
  if (showEditor) {
    return (
      <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5 space-y-3 overflow-hidden">
        {/* Toolbar row */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowEditor(false)}
          >
            Back to preview
          </Button>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSaveAsTemplateOpen(true)}
            >
              <BookmarkPlus className="w-3.5 h-3.5 mr-1.5" />
              Save as Template
            </Button>
            <Button
              className="bg-tw-blue hover:bg-tw-blue-dark"
              size="sm"
              onClick={handleSaveDesign}
              disabled={isSaving}
            >
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {isSaving ? 'Saving...' : 'Save Design'}
            </Button>
          </div>
        </div>

        {/* Editor */}
        <div style={{ minHeight: 600, maxWidth: '100%', overflow: 'hidden' }}>
          <GrapesEditor
            ref={editorRef}
            initialContent={editorContent}
            onSave={handleSaveDesign}
            saving={isSaving}
          />
        </div>

        {/* Save as Template dialog */}
        <SaveAsTemplateDialog
          open={saveAsTemplateOpen}
          onOpenChange={setSaveAsTemplateOpen}
          editorRef={editorRef}
        />
      </div>
    );
  }

  // Has existing content — show preview
  if (hasContent) {
    return (
      <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5 space-y-4">
        <div className="border border-card-border rounded-lg overflow-hidden" style={{ maxHeight: 300 }}>
          <iframe
            srcDoc={campaign.content_html || ''}
            title="Email preview"
            className="w-full border-0"
            style={{ height: 300 }}
            sandbox="allow-same-origin"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleEditDesign}>
            Edit Design
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            Change Template
          </Button>
        </div>
        <TemplatePicker
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onSelect={handleTemplateSelect}
        />
      </div>
    );
  }

  // No content — initial state
  return (
    <div className="mt-2 bg-card border border-card-border rounded-[14px] p-5">
      <div className="text-center py-10">
        <Palette className="w-8 h-8 text-text-muted mx-auto mb-3" />
        <p className="text-sm text-text-secondary mb-1">Select a template or start from blank</p>
        <p className="text-xs text-text-muted mb-4">Design your email using the drag-and-drop editor.</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            Choose Template
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditorContent(undefined);
              setShowEditor(true);
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Start from Blank
          </Button>
        </div>
      </div>
      <TemplatePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={handleTemplateSelect}
      />
    </div>
  );
}

// ============================================================================
// Save as Template Dialog
// ============================================================================

interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editorRef: React.RefObject<GrapesEditorRef | null>;
}

function SaveAsTemplateDialog({ open, onOpenChange, editorRef }: SaveAsTemplateDialogProps) {
  const queryClient = useQueryClient();
  const [templateName, setTemplateName] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!editorRef.current || !templateName.trim()) return;
    setSaving(true);
    try {
      const content_html = editorRef.current.getHtml();
      const content_json = editorRef.current.getJson();
      await api.post('/templates', {
        name: templateName.trim(),
        category: category.trim() || undefined,
        content_html,
        content_json,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
      toast.success('Template saved');
      setTemplateName('');
      setCategory('');
      onOpenChange(false);
    } catch {
      toast.error('Failed to save template');
    } finally {
      setSaving(false);
    }
  }, [editorRef, templateName, category, onOpenChange, queryClient]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save as Template</DialogTitle>
          <DialogDescription>Save the current design as a reusable template.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label htmlFor="template-name" className="text-xs text-text-muted mb-1">
              Template Name
            </Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Monthly Newsletter"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="template-category" className="text-xs text-text-muted mb-1">
              Category (optional)
            </Label>
            <Input
              id="template-category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Newsletters"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="bg-tw-blue hover:bg-tw-blue-dark"
              size="sm"
              onClick={handleSave}
              disabled={saving || !templateName.trim()}
            >
              {saving ? 'Saving...' : 'Save Template'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function ChecklistItem({ label, checked }: { label: string; checked: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={cn(
        'w-4 h-4 rounded-full flex items-center justify-center',
        checked ? 'bg-green-100' : 'bg-gray-100',
      )}>
        {checked && <Check className="w-2.5 h-2.5 text-green-600" />}
      </span>
      <span className={cn('text-xs', checked ? 'text-text-primary' : 'text-text-muted')}>
        {label}
      </span>
    </div>
  );
}
