'use client';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { Editor } from 'grapesjs';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';
import mjml from 'grapesjs-mjml';
import {
  Monitor, Smartphone, Eye, Undo2, Redo2, Code, Save,
  Layers, LayoutGrid, Image, PanelLeftClose, PanelLeftOpen,
  Link, Type, Square, Columns, Minus, Share2, AlignLeft,
  Upload, Play,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface GrapesEditorRef {
  getHtml: () => string;
  getJson: () => string;
}

interface GrapesEditorProps {
  initialContent?: string;
  onChange?: (html: string, json: string) => void;
  onSave?: () => void;
  saving?: boolean;
}

interface PropField {
  key: string;
  label: string;
  type: 'text' | 'color' | 'select' | 'url';
  placeholder?: string;
  options?: { value: string; label: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GjsComponent = any;

/* ------------------------------------------------------------------ */
/*  Prop definitions per component type                                */
/* ------------------------------------------------------------------ */

const ALIGN_OPTIONS = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

const PROP_DEFS: Record<string, PropField[]> = {
  'mj-image': [
    { key: 'src', label: 'Image URL', type: 'url', placeholder: 'https://...' },
    { key: 'href', label: 'Link URL', type: 'url', placeholder: 'https://...' },
    { key: 'alt', label: 'Alt Text', type: 'text', placeholder: 'Describe image' },
    { key: 'width', label: 'Width', type: 'text', placeholder: '300px or 100%' },
    { key: 'align', label: 'Align', type: 'select', options: ALIGN_OPTIONS },
    { key: 'padding', label: 'Padding', type: 'text', placeholder: '10px 25px' },
    { key: 'border-radius', label: 'Roundness', type: 'text', placeholder: '0px' },
  ],
  'mj-button': [
    { key: 'href', label: 'Link URL', type: 'url', placeholder: 'https://...' },
    { key: 'background-color', label: 'Button Color', type: 'color' },
    { key: 'color', label: 'Text Color', type: 'color' },
    { key: 'font-size', label: 'Font Size', type: 'text', placeholder: '16px' },
    { key: 'font-weight', label: 'Font Weight', type: 'text', placeholder: 'bold' },
    { key: 'border-radius', label: 'Roundness', type: 'text', placeholder: '6px' },
    { key: 'inner-padding', label: 'Inner Padding', type: 'text', placeholder: '10px 25px' },
    { key: 'align', label: 'Align', type: 'select', options: ALIGN_OPTIONS },
    { key: 'width', label: 'Width', type: 'text', placeholder: 'auto' },
    { key: 'padding', label: 'Outer Padding', type: 'text', placeholder: '10px 25px' },
  ],
  'mj-text': [
    { key: 'font-size', label: 'Font Size', type: 'text', placeholder: '16px' },
    { key: 'color', label: 'Text Color', type: 'color' },
    { key: 'font-weight', label: 'Font Weight', type: 'select', options: [
      { value: 'normal', label: 'Normal' },
      { value: 'bold', label: 'Bold' },
      { value: '300', label: 'Light' },
      { value: '500', label: 'Medium' },
      { value: '600', label: 'Semi-Bold' },
      { value: '800', label: 'Extra Bold' },
    ]},
    { key: 'font-family', label: 'Font', type: 'select', options: [
      { value: 'Arial, sans-serif', label: 'Arial' },
      { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
      { value: 'Georgia, serif', label: 'Georgia' },
      { value: 'Times New Roman, serif', label: 'Times New Roman' },
      { value: 'Courier New, monospace', label: 'Courier New' },
      { value: 'Verdana, sans-serif', label: 'Verdana' },
      { value: 'Trebuchet MS, sans-serif', label: 'Trebuchet MS' },
      { value: 'Tahoma, sans-serif', label: 'Tahoma' },
      { value: 'Lucida Sans, sans-serif', label: 'Lucida Sans' },
      { value: 'Impact, sans-serif', label: 'Impact' },
    ]},
    { key: 'line-height', label: 'Line Height', type: 'text', placeholder: '1.6' },
    { key: 'align', label: 'Align', type: 'select', options: ALIGN_OPTIONS },
    { key: 'padding', label: 'Padding', type: 'text', placeholder: '10px 25px' },
  ],
  'mj-section': [
    { key: 'background-color', label: 'Background', type: 'color' },
    { key: 'padding', label: 'Padding', type: 'text', placeholder: '20px' },
    { key: 'border-radius', label: 'Roundness', type: 'text', placeholder: '0px' },
  ],
  'mj-column': [
    { key: 'background-color', label: 'Background', type: 'color' },
    { key: 'width', label: 'Width', type: 'text', placeholder: '100%' },
    { key: 'padding', label: 'Padding', type: 'text', placeholder: '0px' },
    { key: 'border-radius', label: 'Roundness', type: 'text', placeholder: '0px' },
  ],
  'mj-divider': [
    { key: 'border-color', label: 'Color', type: 'color' },
    { key: 'border-width', label: 'Thickness', type: 'text', placeholder: '1px' },
    { key: 'border-style', label: 'Style', type: 'text', placeholder: 'solid' },
    { key: 'width', label: 'Width', type: 'text', placeholder: '100%' },
    { key: 'padding', label: 'Padding', type: 'text', placeholder: '10px 25px' },
  ],
  'mj-spacer': [
    { key: 'height', label: 'Height', type: 'text', placeholder: '20px' },
  ],
  'mj-social': [
    { key: 'mode', label: 'Mode', type: 'text', placeholder: 'horizontal' },
    { key: 'align', label: 'Align', type: 'select', options: ALIGN_OPTIONS },
    { key: 'icon-size', label: 'Icon Size', type: 'text', placeholder: '20px' },
    { key: 'padding', label: 'Padding', type: 'text', placeholder: '10px 25px' },
  ],
  'mj-social-element': [
    { key: 'href', label: 'Link URL', type: 'url', placeholder: 'https://...' },
    { key: 'name', label: 'Network', type: 'text', placeholder: 'facebook' },
  ],
};

// Property definitions for standard HTML elements (imported/pasted HTML)
const HTML_PROP_DEFS: Record<string, PropField[]> = {
  'text': [
    { key: 'style:font-size', label: 'Font Size', type: 'text', placeholder: '16px' },
    { key: 'style:color', label: 'Text Color', type: 'color' },
    { key: 'style:font-weight', label: 'Font Weight', type: 'select', options: [
      { value: 'normal', label: 'Normal' },
      { value: 'bold', label: 'Bold' },
    ]},
    { key: 'style:text-align', label: 'Align', type: 'select', options: ALIGN_OPTIONS },
    { key: 'style:line-height', label: 'Line Height', type: 'text', placeholder: '1.6' },
    { key: 'style:padding', label: 'Padding', type: 'text', placeholder: '10px' },
    { key: 'style:background-color', label: 'Background', type: 'color' },
  ],
  'image': [
    { key: 'src', label: 'Image URL', type: 'url', placeholder: 'https://...' },
    { key: 'alt', label: 'Alt Text', type: 'text', placeholder: 'Describe image' },
    { key: 'style:width', label: 'Width', type: 'text', placeholder: '100%' },
    { key: 'style:border-radius', label: 'Roundness', type: 'text', placeholder: '0px' },
  ],
  'link': [
    { key: 'href', label: 'Link URL', type: 'url', placeholder: 'https://...' },
    { key: 'style:color', label: 'Link Color', type: 'color' },
    { key: 'style:font-size', label: 'Font Size', type: 'text', placeholder: '16px' },
  ],
  'cell': [
    { key: 'style:background-color', label: 'Background', type: 'color' },
    { key: 'style:padding', label: 'Padding', type: 'text', placeholder: '10px' },
    { key: 'style:text-align', label: 'Align', type: 'select', options: ALIGN_OPTIONS },
    { key: 'style:vertical-align', label: 'V-Align', type: 'select', options: [
      { value: 'top', label: 'Top' },
      { value: 'middle', label: 'Middle' },
      { value: 'bottom', label: 'Bottom' },
    ]},
    { key: 'style:width', label: 'Width', type: 'text', placeholder: '50%' },
    { key: 'style:border', label: 'Border', type: 'text', placeholder: '1px solid #ccc' },
  ],
  'table': [
    { key: 'style:width', label: 'Width', type: 'text', placeholder: '100%' },
    { key: 'style:background-color', label: 'Background', type: 'color' },
    { key: 'style:border-collapse', label: 'Border Collapse', type: 'select', options: [
      { value: 'collapse', label: 'Collapse' },
      { value: 'separate', label: 'Separate' },
    ]},
  ],
  'row': [
    { key: 'style:background-color', label: 'Background', type: 'color' },
  ],
  'default': [
    { key: 'style:color', label: 'Text Color', type: 'color' },
    { key: 'style:background-color', label: 'Background', type: 'color' },
    { key: 'style:padding', label: 'Padding', type: 'text', placeholder: '10px' },
    { key: 'style:font-size', label: 'Font Size', type: 'text', placeholder: '16px' },
    { key: 'style:text-align', label: 'Align', type: 'select', options: ALIGN_OPTIONS },
  ],
};

// HTML element types that should allow inline text editing
const EDITABLE_HTML_TYPES = new Set([
  'text', 'default', 'textnode', 'label',
]);

// Tag names that should be inline-editable
const EDITABLE_TAG_NAMES = new Set([
  'p', 'span', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'td', 'th', 'li', 'a', 'b', 'i', 'em', 'strong', 'u',
  'label', 'blockquote', 'pre', 'code',
]);

const TYPE_LABELS: Record<string, string> = {
  'mj-body': 'Email Body',
  'mj-section': 'Section',
  'mj-column': 'Column',
  'mj-text': 'Text',
  'mj-button': 'Button',
  'mj-image': 'Image',
  'mj-divider': 'Divider',
  'mj-social': 'Social Links',
  'mj-social-element': 'Social Icon',
  'mj-spacer': 'Spacer',
  'mj-raw': 'Raw HTML',
  'mj-navbar': 'Navbar',
  'mj-navbar-link': 'Nav Link',
  'text': 'Text',
  'default': 'Element',
  'image': 'Image',
  'link': 'Link',
  'table': 'Table',
  'row': 'Table Row',
  'cell': 'Table Cell',
};

const TYPE_ICONS: Record<string, typeof Type> = {
  'mj-text': Type,
  'mj-button': Link,
  'mj-image': Image,
  'mj-section': Square,
  'mj-column': Columns,
  'mj-divider': Minus,
  'mj-social': Share2,
  'mj-social-element': Share2,
  'mj-spacer': AlignLeft,
  'mj-raw': Code,
  'mj-video': Play,
};

/* ------------------------------------------------------------------ */
/*  Default MJML                                                       */
/* ------------------------------------------------------------------ */

const DEFAULT_MJML = `<mjml>
  <mj-body background-color="#f4f4f5">
    <mj-section background-color="#ffffff" padding="30px 20px">
      <mj-column>
        <mj-text font-size="28px" font-weight="bold" align="center" color="#1a1a2e" padding="0 0 10px 0">
          Your Email Title
        </mj-text>
        <mj-text font-size="16px" color="#555555" line-height="1.6" padding="0 0 20px 0">
          Start editing this template by clicking on any element. Drag blocks from the left panel to add new content.
        </mj-text>
        <mj-button background-color="#2563eb" color="#ffffff" font-size="16px" font-weight="bold" border-radius="6px" href="https://example.com" inner-padding="12px 30px">
          Call to Action
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

/* ------------------------------------------------------------------ */
/*  PropertyField component                                            */
/* ------------------------------------------------------------------ */

const SIZE_KEYS = ['font-size', 'border-radius', 'border-width', 'icon-size', 'height'];

function PropertyFieldInput({
  field,
  value,
  onUpdate,
}: {
  field: PropField;
  value: string;
  onUpdate: (key: string, value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);

  const commit = () => {
    let v = local;
    // Auto-append px for size fields if user typed a bare number
    if (SIZE_KEYS.includes(field.key) && v && /^\d+(\.\d+)?$/.test(v.trim())) {
      v = v.trim() + 'px';
      setLocal(v);
    }
    if (v !== value) onUpdate(field.key, v);
  };

  if (field.type === 'color') {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={local || '#000000'}
          onChange={(e) => { setLocal(e.target.value); onUpdate(field.key, e.target.value); }}
          className="w-8 h-8 rounded-md border border-[#dde3eb] cursor-pointer p-0.5 shadow-sm"
        />
        <input
          type="text"
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          placeholder={field.placeholder}
          className="flex-1 h-8 px-2.5 text-xs border border-[#dde3eb] rounded-md bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none shadow-sm text-[#2d3748]"
        />
      </div>
    );
  }

  if (field.type === 'select' && field.options) {
    return (
      <select
        value={local}
        onChange={(e) => { setLocal(e.target.value); onUpdate(field.key, e.target.value); }}
        className="w-full h-8 px-2.5 text-xs border border-[#dde3eb] rounded-md bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none shadow-sm text-[#2d3748]"
      >
        <option value="">—</option>
        {field.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }

  return (
    <input
      type="text"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
      placeholder={field.placeholder}
      className="w-full h-8 px-2.5 text-xs border border-[#dde3eb] rounded-md bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none shadow-sm text-[#2d3748]"
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Main editor component                                              */
/* ------------------------------------------------------------------ */

type LeftTab = 'blocks' | 'images' | 'layers';

export const GrapesEditor = forwardRef<GrapesEditorRef, GrapesEditorProps>(
  function GrapesEditor({ initialContent, onChange, onSave, saving }, ref) {
    const editorRef = useRef<Editor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
    const [preview, setPreview] = useState(false);
    const [ready, setReady] = useState(false);
    const [leftTab, setLeftTab] = useState<LeftTab>('blocks');
    const [leftOpen, setLeftOpen] = useState(true);
    const [uploadedImages, setUploadedImages] = useState<Array<{ id: number; url: string; filename: string }>>([]);
    const [uploading, setUploading] = useState(false);

    // Selected component state for custom properties panel
    const [selectedType, setSelectedType] = useState('');
    const [rawHtmlContent, setRawHtmlContent] = useState('');
    const [isVideoBlock, setIsVideoBlock] = useState(false);
    const [videoUrl, setVideoUrl] = useState('');
    const [selectedAttrs, setSelectedAttrs] = useState<Record<string, string>>({});
    const selectedRef = useRef<GjsComponent>(null);
    const [htmlEditorOpen, setHtmlEditorOpen] = useState(false);
    const [htmlEditorCode, setHtmlEditorCode] = useState('');

    useImperativeHandle(ref, () => ({
      getHtml: () => {
        if (!editorRef.current) return '';
        try {
          const result = editorRef.current.runCommand('mjml-code-to-html') as { html: string };
          return result?.html ?? '';
        } catch {
          return editorRef.current.getHtml();
        }
      },
      getJson: () => {
        if (!editorRef.current) return '{}';
        return JSON.stringify(editorRef.current.getProjectData());
      },
    }));

    // Load uploaded images
    useEffect(() => {
      fetch('/api/proxy/assets?page=1&per_page=100', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.data) {
            setUploadedImages(
              data.data
                .filter((a: Record<string, unknown>) => typeof a.mime_type === 'string' && (a.mime_type as string).startsWith('image/'))
                .map((a: Record<string, unknown>) => ({ id: a.id as number, url: a.url as string, filename: (a.original_name || a.filename) as string }))
            );
          }
        })
        .catch(() => {});
    }, []);

    const handleImageUpload = useCallback(async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/')) continue;
        const formData = new FormData();
        formData.append('file', file);
        try {
          const res = await fetch('/api/proxy/assets/upload', { method: 'POST', body: formData, credentials: 'include' });
          if (res.ok) {
            const json = await res.json();
            const asset = json.data;
            const newImg = { id: asset.id, url: asset.url, filename: asset.original_name || asset.filename };
            setUploadedImages(prev => [newImg, ...prev]);
            editorRef.current?.AssetManager.add({ src: asset.url, name: asset.original_name });
          }
        } catch { /* ignore */ }
      }
      setUploading(false);
    }, []);

    const insertImageIntoEditor = useCallback((url: string) => {
      const editor = editorRef.current;
      if (!editor) return;
      const selected = editor.getSelected();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let target: any = selected || editor.getWrapper();
      try {
        const pType = target?.get?.('type') as string | undefined;
        if (pType === 'mj-section') {
          const cols = target.components?.() as { length?: number; at?: (i: number) => unknown } | undefined;
          if (cols && typeof cols.length === 'number' && cols.length > 0 && cols.at) target = cols.at(0);
        } else if (pType !== 'mj-column') {
          const body = editor.getWrapper()?.components?.()?.at?.(0) as GjsComponent;
          const sections = body?.components?.() as { length?: number; at?: (i: number) => unknown } | undefined;
          if (sections && typeof sections.length === 'number' && sections.length > 0 && sections.at) {
            const last = sections.at(sections.length - 1) as GjsComponent;
            const cols = last?.components?.() as { length?: number; at?: (i: number) => unknown } | undefined;
            if (cols && typeof cols.length === 'number' && cols.length > 0 && cols.at) target = cols.at(0);
            else target = last;
          }
        }
      } catch { /* fallback to target as-is */ }
      target?.append?.(`<mj-image src="${url}" width="100%" padding="10px 25px" />`);
    }, []);

    // Extract YouTube video ID from various URL formats
    const extractYouTubeId = useCallback((url: string): string | null => {
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/, // bare ID
      ];
      for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
      }
      return null;
    }, []);

    // Update video URL — auto-sets thumbnail and href on the mj-image
    const applyVideoUrl = useCallback((url: string) => {
      setVideoUrl(url);
      const comp = selectedRef.current;
      if (!comp) return;
      const videoId = extractYouTubeId(url);
      if (!videoId) return;
      const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      const href = `https://www.youtube.com/watch?v=${videoId}`;
      const attrs = comp.getAttributes();
      comp.set('attributes', { ...attrs, src: thumbnail, href, alt: 'Watch Video' });
      setSelectedAttrs(prev => ({ ...prev, src: thumbnail, href, alt: 'Watch Video' }));
    }, [extractYouTubeId]);

    // Update raw HTML content on mj-raw component
    const updateRawHtml = useCallback((html: string) => {
      setRawHtmlContent(html);
      const comp = selectedRef.current;
      if (!comp) return;
      try {
        comp.set('content', html);
        comp.components(html);
      } catch { /* fallback */ }
    }, []);

    const openHtmlEditor = useCallback(() => {
      const comp = selectedRef.current;
      if (!comp) return;
      setHtmlEditorCode(comp.toHTML());
      setHtmlEditorOpen(true);
    }, []);

    const applyHtmlEditor = useCallback(() => {
      const comp = selectedRef.current;
      if (!comp) return;
      const parent = comp.parent();
      if (!parent) return;
      const index = parent.components().indexOf(comp);
      comp.remove();
      parent.components().add(htmlEditorCode, { at: index });
      setHtmlEditorOpen(false);
      setHtmlEditorCode('');
    }, [htmlEditorCode]);

    // Update attribute on selected component (supports style: prefix for inline styles)
    const updateAttr = useCallback((key: string, value: string) => {
      const comp = selectedRef.current;
      if (!comp) return;
      if (key.startsWith('style:')) {
        const styleProp = key.slice(6);
        comp.addStyle({ [styleProp]: value });
        setSelectedAttrs((prev: Record<string, string>) => ({ ...prev, [key]: value }));
        return;
      }
      const attrs = comp.getAttributes();
      if (value) {
        attrs[key] = value;
      } else {
        delete attrs[key];
      }
      comp.set('attributes', { ...attrs });
      setSelectedAttrs(prev => ({ ...prev, [key]: value }));
    }, []);

    // Tags that should become GrapesJS 'text' type for inline editing
    const TEXT_TAGS = new Set([
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div',
      'td', 'th', 'li', 'blockquote', 'pre', 'label',
      'b', 'i', 'em', 'strong', 'u', 'a',
    ]);

    // Recursively make imported HTML components editable
    const makeEditable = useCallback((comp: GjsComponent) => {
      if (!comp) return;
      const type = comp.get('type') || '';
      const tagName = (comp.get('tagName') || '').toLowerCase();
      // Convert text-containing elements to GrapesJS 'text' type for inline RTE
      if (!type.startsWith('mj-') && (type === 'default' || type === 'text' || type === '') && TEXT_TAGS.has(tagName)) {
        comp.set({ type: 'text', editable: true });
      }
      // Links should keep link type but be editable
      if (type === 'link') {
        comp.set('editable', true);
      }
      // Recurse into children
      const children = comp.components?.();
      if (children) {
        children.forEach((child: GjsComponent) => makeEditable(child));
      }
    }, []);

    // Initialize GrapesJS
    useEffect(() => {
      if (!containerRef.current || editorRef.current) return;

      const editor = grapesjs.init({
        container: containerRef.current,
        height: '100%',
        width: 'auto',
        fromElement: false,
        storageManager: false,
        panels: { defaults: [] },
        plugins: [mjml],
        pluginsOpts: {
          [mjml as unknown as string]: {
            resetStyleManager: true,
            resetDevices: false,
          },
        },
        assetManager: {
          autoAdd: false,
          upload: '/api/proxy/assets/upload',
          uploadName: 'file',
          multiUpload: false,
          headers: {},
          credentials: 'include',
        },
        richTextEditor: {
          actions: ['bold', 'italic', 'underline', 'strikethrough', 'link'] as string[],
        },
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Mobile', width: '375px' },
          ],
        },
        canvas: {
          styles: [
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
          ],
          frameStyle: `
            body { background-color: #f0f0f0 !important; min-height: auto !important; }
          `,
        },
        styleManager: { sectors: [] }, // We use our own properties panel
      });

      editorRef.current = editor;

      // Add font-size and color buttons to the rich text editor toolbar
      editor.RichTextEditor.add('fontSize', {
        icon: '<b style="font-size:13px">A↕</b>',
        event: 'click',
        result: (rte: { exec: (cmd: string, val?: string) => void }) => {
          const val = prompt('Font size (e.g. 14px, 18px, 24px):', '16px');
          if (val) {
            rte.exec('fontSize', '7');
            const sel = (editor.Canvas.getWindow() as Window).getSelection();
            if (sel && sel.rangeCount > 0) {
              const node = sel.anchorNode?.parentElement;
              if (node && node.tagName === 'FONT') {
                node.removeAttribute('size');
                node.style.fontSize = val;
              }
            }
          }
        },
      });
      editor.RichTextEditor.add('foreColor', {
        icon: '<b style="font-size:13px">A<span style="display:block;height:3px;background:red;margin-top:-2px;border-radius:1px"></span></b>',
        event: 'click',
        result: (rte: { exec: (cmd: string, val?: string) => void }) => {
          const val = prompt('Text color (hex or name):', '#333333');
          if (val) rte.exec('foreColor', val);
        },
      });

      // Handle asset upload response from our API
      editor.on('asset:upload:response', (response: unknown) => {
        try {
          const json = typeof response === 'string' ? JSON.parse(response) : response;
          const asset = (json as Record<string, Record<string, string>>)?.data;
          if (asset?.url) {
            editor.AssetManager.add({ src: asset.url, name: asset.original_name || asset.filename, type: 'image' });
          }
        } catch { /* ignore parse errors */ }
      });

      // Replace the broken mj-raw block with a clean one
      try { editor.Blocks.remove('mj-raw'); } catch { /* may not exist */ }
      editor.Blocks.add('mj-raw', {
        label: 'Raw HTML',
        category: '',
        media: `<svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/></svg>`,
        content: '<mj-section background-color="#ffffff" padding="0"><mj-column><mj-raw><!-- Your custom HTML here --><p style="text-align:center;color:#999;font-size:12px;">Custom HTML Block</p></mj-raw></mj-column></mj-section>',
      });

      // YouTube Video block — uses thumbnail + play overlay, links to video
      editor.Blocks.add('mj-video', {
        label: 'Video',
        category: '',
        media: `<svg viewBox="0 0 24 24" width="40" height="40"><path fill="currentColor" d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`,
        content: `<mj-image src="https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ" alt="Watch Video" width="100%" padding="10px 25px" border-radius="8px" data-video="true" />`,
      });

      // Load content
      const content = initialContent || DEFAULT_MJML;
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === 'object' && (parsed.pages || parsed.styles)) {
          editor.loadProjectData(parsed);
        } else {
          editor.setComponents(content);
        }
      } catch {
        editor.setComponents(content);
      }

      // Make imported HTML components editable (inline text editing, etc.)
      const wrapper = editor.getWrapper();
      if (wrapper) makeEditable(wrapper);

      // Load existing images into asset manager
      fetch('/api/proxy/assets?page=1&per_page=100', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.data) {
            data.data
              .filter((a: Record<string, unknown>) => typeof a.mime_type === 'string' && (a.mime_type as string).startsWith('image/'))
              .forEach((a: Record<string, unknown>) => {
                editor.AssetManager.add({ src: a.url as string, name: (a.original_name || a.filename) as string, type: 'image' });
              });
          }
        })
        .catch(() => {});

      // Track selected component for custom properties panel
      // If user clicks a non-editable child inside mj-raw, auto-select the mj-raw parent
      // But if the child is editable (text, p, td, etc.), let the user edit it directly
      editor.on('component:selected', (component: GjsComponent) => {
        let comp = component;
        let type = comp?.get('type') || '';
        const tagName = (comp?.get('tagName') || '').toLowerCase();
        const isEditable = comp?.get('editable') || EDITABLE_TAG_NAMES.has(tagName) || EDITABLE_HTML_TYPES.has(type);
        // Walk up to find mj-raw parent only for non-editable children
        if (type !== 'mj-raw' && !isEditable) {
          let parent = comp?.parent?.();
          while (parent) {
            if (parent.get('type') === 'mj-raw') {
              editor.select(parent);
              return;
            }
            parent = parent.parent?.();
          }
        }
        selectedRef.current = comp;
        const attrs = comp.getAttributes();
        // For non-MJML components, also grab inline styles into attrs
        const combinedAttrs: Record<string, string> = { ...attrs };
        if (!type.startsWith('mj-')) {
          const styles = comp.getStyle();
          if (styles && typeof styles === 'object') {
            for (const [k, v] of Object.entries(styles)) {
              if (typeof v === 'string') combinedAttrs[`style:${k}`] = v;
            }
          }
        }
        setSelectedAttrs(combinedAttrs);
        // Detect video blocks (mj-image with data-video attribute)
        const isVideo = type === 'mj-image' && attrs['data-video'] === 'true';
        setIsVideoBlock(isVideo);
        if (isVideo) {
          setSelectedType('mj-video');
          setVideoUrl(attrs.href || '');
        } else {
          setSelectedType(type);
        }
        // Grab inner HTML for mj-raw
        if (type === 'mj-raw') {
          try {
            const inner = comp.get('content') || comp.getInnerHTML?.() || '';
            setRawHtmlContent(inner);
          } catch { setRawHtmlContent(''); }
        }
      });
      editor.on('component:deselected', () => {
        selectedRef.current = null;
        setSelectedType('');
        setSelectedAttrs({});
        setRawHtmlContent('');
        setIsVideoBlock(false);
        setVideoUrl('');
      });

      // White background defaults + constrain images
      editor.on('component:add', (component: GjsComponent) => {
        const type = component.get('type');
        if (type === 'mj-section' || type === 'mj-column') {
          const attrs = component.getAttributes();
          if (!attrs['background-color']) {
            component.set('attributes', { ...attrs, 'background-color': '#ffffff' });
          }
        }
        if (type === 'mj-image') {
          const attrs = component.getAttributes();
          if (!attrs.width) {
            component.set('attributes', { ...attrs, width: '100%' });
          }
        }
        if (type === 'mj-button') {
          const attrs = component.getAttributes();
          if (!attrs.href || attrs.href === '#') {
            component.set('attributes', { ...attrs, href: 'https://' });
          }
        }
        // Make non-MJML components editable
        if (!type.startsWith('mj-')) {
          makeEditable(component);
        }
      });

      setReady(true);

      return () => {
        editor.destroy();
        editorRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-save
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => {
      if (!ready || !editorRef.current || !onChange) return;
      const editor = editorRef.current;
      const handleUpdate = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          try {
            const result = editor.runCommand('mjml-code-to-html') as { html: string };
            onChange(result?.html ?? editor.getHtml(), JSON.stringify(editor.getProjectData()));
          } catch { /* ignore */ }
        }, 800);
      };
      editor.on('component:update', handleUpdate);
      editor.on('component:add', handleUpdate);
      editor.on('component:remove', handleUpdate);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        editor.off('component:update', handleUpdate);
        editor.off('component:add', handleUpdate);
        editor.off('component:remove', handleUpdate);
      };
    }, [ready, onChange]);

    const setDevice = useCallback((mode: 'desktop' | 'mobile') => {
      setViewport(mode);
      editorRef.current?.setDevice(mode === 'mobile' ? 'Mobile' : 'Desktop');
    }, []);

    const togglePreview = useCallback(() => {
      if (!editorRef.current) return;
      if (preview) editorRef.current.stopCommand('preview');
      else editorRef.current.runCommand('preview');
      setPreview(!preview);
    }, [preview]);

    const undo = useCallback(() => editorRef.current?.UndoManager.undo(), []);
    const redo = useCallback(() => editorRef.current?.UndoManager.redo(), []);
    const toggleCode = useCallback(() => { editorRef.current?.runCommand('mjml-code'); }, []);

    // Mount GrapesJS panels
    useEffect(() => {
      if (!ready || !editorRef.current) return;
      const editor = editorRef.current;
      const blocksEl = document.getElementById('gjs-blocks-container');
      if (blocksEl && leftTab === 'blocks' && blocksEl.childElementCount === 0) {
        const v = editor.Blocks.render();
        if (v) blocksEl.appendChild(v);
      }
      const layersEl = document.getElementById('gjs-layers-container');
      if (layersEl && leftTab === 'layers' && layersEl.childElementCount === 0) {
        const v = editor.Layers.render();
        if (v) layersEl.appendChild(v);
      }
    }, [ready, leftTab]);

    const fields = PROP_DEFS[selectedType] || HTML_PROP_DEFS[selectedType] || (selectedType && !selectedType.startsWith('mj-') ? HTML_PROP_DEFS['default'] : []) || [];
    const Icon = TYPE_ICONS[selectedType] || Square;

    const leftTabs: { key: LeftTab; label: string; icon: typeof LayoutGrid }[] = [
      { key: 'blocks', label: 'Blocks', icon: LayoutGrid },
      { key: 'images', label: 'Images', icon: Image },
      { key: 'layers', label: 'Layers', icon: Layers },
    ];

    return (
      <div className="flex flex-col h-full overflow-hidden gjs-custom-theme">
        {/* GrapesJS theme overrides */}
        <style>{`
          /* ── Canvas ── */
          .gjs-custom-theme .gjs-cv-canvas,
          .gjs-custom-theme .gjs-frame-wrapper,
          .gjs-custom-theme .gjs-cv-canvas__frames {
            background: #c8cdd3 !important;
          }

          /* ── Block items ── */
          .gjs-custom-theme .gjs-block {
            width: calc(50% - 8px) !important;
            min-height: 76px !important;
            margin: 4px !important;
            padding: 12px 6px !important;
            border: none !important;
            border-radius: 8px !important;
            background: linear-gradient(135deg, #2d3748 0%, #1a202c 100%) !important;
            box-shadow: 0 2px 4px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05) !important;
            transition: all 0.2s ease !important;
            color: #cbd5e0 !important;
            cursor: grab !important;
          }
          .gjs-custom-theme .gjs-block:hover {
            background: linear-gradient(135deg, #3d4a5c 0%, #2a3441 100%) !important;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08) !important;
            transform: translateY(-2px);
          }
          .gjs-custom-theme .gjs-block:active { cursor: grabbing !important; transform: scale(0.97); }
          .gjs-custom-theme .gjs-block svg { fill: #90cdf4 !important; }
          .gjs-custom-theme .gjs-block:hover svg { fill: #63b3ed !important; }
          .gjs-custom-theme .gjs-block__media { margin-bottom: 6px !important; }
          .gjs-custom-theme .gjs-block-label {
            font-size: 10px !important;
            font-weight: 500 !important;
            letter-spacing: 0.03em !important;
            color: #a0aec0 !important;
          }
          .gjs-custom-theme .gjs-block:hover .gjs-block-label { color: #e2e8f0 !important; }
          .gjs-custom-theme .gjs-blocks-cs {
            display: flex !important;
            flex-wrap: wrap !important;
            padding: 4px !important;
          }

          /* ── Layers panel ── */
          .gjs-custom-theme .gjs-layer { background: transparent !important; font-size: 12px !important; }
          .gjs-custom-theme .gjs-layer-title {
            padding: 7px 10px !important;
            border-radius: 6px !important;
            background: transparent !important;
            border: none !important;
            color: #4a5568 !important;
          }
          .gjs-custom-theme .gjs-layer-title:hover { background: #edf2f7 !important; }
          .gjs-custom-theme .gjs-layer.gjs-selected .gjs-layer-title {
            background: #ebf4ff !important;
            color: #2b6cb0 !important;
          }
          .gjs-custom-theme .gjs-layer-name { color: #2d3748 !important; font-size: 11px !important; }
          .gjs-custom-theme .gjs-layers { background: transparent !important; }

          /* ── Canvas highlights ── */
          .gjs-custom-theme .gjs-selected { outline: 2px solid #4299e1 !important; outline-offset: -1px; }
          .gjs-custom-theme .gjs-hovered { outline: 2px dashed #90cdf4 !important; }

          /* ── Component toolbar ── */
          .gjs-custom-theme .gjs-toolbar {
            background: #2d3748 !important;
            border-radius: 8px !important;
            padding: 3px !important;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
            border: 1px solid rgba(255,255,255,0.08) !important;
          }
          .gjs-custom-theme .gjs-toolbar-item {
            padding: 5px 7px !important;
            color: #e2e8f0 !important;
            border-radius: 5px !important;
            font-size: 13px !important;
          }
          .gjs-custom-theme .gjs-toolbar-item:hover { background: rgba(255,255,255,0.12) !important; }

          /* ── Component badge ── */
          .gjs-custom-theme [data-gjs-badge],
          .gjs-custom-theme .gjs-badge {
            background: #2b6cb0 !important;
            color: #fff !important;
            font-size: 10px !important;
            font-weight: 600 !important;
            padding: 2px 8px !important;
            border-radius: 4px !important;
          }

          /* ── Rich text editor ── */
          .gjs-custom-theme .gjs-rte-toolbar {
            background: #1a202c !important;
            border-radius: 8px !important;
            padding: 4px 6px !important;
            box-shadow: 0 8px 24px rgba(0,0,0,0.35) !important;
            border: 1px solid rgba(255,255,255,0.06) !important;
          }
          .gjs-custom-theme .gjs-rte-action {
            color: #cbd5e0 !important;
            border-radius: 4px !important;
            padding: 5px 8px !important;
            font-size: 13px !important;
          }
          .gjs-custom-theme .gjs-rte-action:hover { background: rgba(255,255,255,0.1) !important; color: #fff !important; }
          .gjs-custom-theme .gjs-rte-active { background: #4299e1 !important; color: #fff !important; }

          /* ── Misc ── */
          .gjs-custom-theme .gjs-pn-panel { background: transparent !important; border: none !important; }
          .gjs-custom-theme .gjs-resizer-h { border-color: #4299e1 !important; }
          .gjs-custom-theme .gjs-highlighter { outline: 2px dashed #4299e1 !important; }
        `}</style>

        {/* ── Toolbar ── */}
        <div className="flex items-center justify-between h-11 px-3 bg-[#1a202c] border-b border-[#2d3748] shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => setLeftOpen(!leftOpen)} className="p-1.5 rounded-md hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title={leftOpen ? 'Hide panel' : 'Show panel'}>
              {leftOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
            <div className="w-px h-4 bg-gray-600 mx-1.5" />
            <button onClick={() => setDevice('desktop')} className={cn('p-1.5 rounded-md transition-colors', viewport === 'desktop' ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200')} title="Desktop">
              <Monitor className="w-4 h-4" />
            </button>
            <button onClick={() => setDevice('mobile')} className={cn('p-1.5 rounded-md transition-colors', viewport === 'mobile' ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200')} title="Mobile">
              <Smartphone className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-gray-600 mx-1.5" />
            <button onClick={undo} className="p-1.5 rounded-md text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors" title="Undo"><Undo2 className="w-4 h-4" /></button>
            <button onClick={redo} className="p-1.5 rounded-md text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors" title="Redo"><Redo2 className="w-4 h-4" /></button>
            <div className="w-px h-4 bg-gray-600 mx-1.5" />
            <button onClick={togglePreview} className={cn('p-1.5 rounded-md transition-colors', preview ? 'bg-blue-500/20 text-blue-300' : 'text-gray-400 hover:bg-white/10 hover:text-gray-200')} title="Preview"><Eye className="w-4 h-4" /></button>
            <button onClick={toggleCode} className="p-1.5 rounded-md text-gray-400 hover:bg-white/10 hover:text-gray-200 transition-colors" title="View Code"><Code className="w-4 h-4" /></button>
          </div>
          {onSave && (
            <Button className="bg-blue-500 hover:bg-blue-400 text-white h-8 text-xs px-4 gap-1.5 rounded-md font-semibold shadow-lg shadow-blue-500/20" onClick={onSave} disabled={saving}>
              <Save className="w-3.5 h-3.5" />{saving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>

        {/* ── Main area ── */}
        <div className="flex flex-1 min-h-0">
          {/* ── Left panel ── */}
          {leftOpen && (
            <div className="w-[240px] bg-[#1e2533] flex flex-col shrink-0">
              <div className="flex shrink-0">
                {leftTabs.map(tab => (
                  <button key={tab.key} className={cn('flex-1 py-3 text-[11px] font-medium transition-colors flex items-center justify-center gap-1.5', leftTab === tab.key ? 'text-blue-300 border-b-2 border-blue-400 bg-white/5' : 'text-gray-500 hover:text-gray-300 border-b-2 border-transparent')} onClick={() => setLeftTab(tab.key)}>
                    <tab.icon className="w-3.5 h-3.5" />{tab.label}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto">
                {leftTab === 'blocks' && <div id="gjs-blocks-container" className="p-2" />}
                {leftTab === 'images' && (
                  <div className="p-3 space-y-3">
                    <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-400/5 transition-colors">
                      <Upload className="w-6 h-6 text-gray-500" />
                      <span className="text-xs text-gray-400 font-medium">{uploading ? 'Uploading...' : 'Click to upload images'}</span>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e.target.files)} disabled={uploading} />
                    </label>
                    {uploadedImages.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Your Images</p>
                        <div className="grid grid-cols-2 gap-2">
                          {uploadedImages.map(img => (
                            <button
                              key={img.id}
                              className="group relative aspect-square rounded-lg overflow-hidden border border-gray-600/50 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer"
                              onClick={() => insertImageIntoEditor(img.url)}
                              title={`Click to insert: ${img.filename}`}
                            >
                              <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/30 transition-colors flex items-center justify-center">
                                <span className="text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 bg-blue-500 px-2 py-0.5 rounded">Insert</span>
                              </div>
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                                <p className="text-[9px] text-white/80 truncate">{img.filename}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {leftTab === 'layers' && <div id="gjs-layers-container" className="p-2 text-xs [&_.gjs-layer-name]:!text-gray-300 [&_.gjs-layer-title]:!text-gray-400 [&_.gjs-layer-title:hover]:!bg-white/5" />}
              </div>
            </div>
          )}

          {/* ── Canvas ── */}
          <div className="flex-1 min-w-0 min-h-0 relative overflow-hidden bg-gray-100" ref={containerRef} />

          {/* ── Right panel ── */}
          <div className={cn('flex flex-col shrink-0 overflow-hidden', selectedType === 'mj-raw' ? 'w-[400px] bg-[#0d1117]' : 'w-[270px] bg-[#f7f8fa] border-l border-[#e2e6ec]')}>
            {isVideoBlock ? (
              <>
                {/* Video panel */}
                <div className="px-4 py-3 bg-white border-b border-[#e2e6ec] shrink-0 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-sm">
                      <Play className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <span className="text-[13px] font-semibold text-[#1a202c]">YouTube Video</span>
                      <p className="text-[10px] text-[#718096]">Paste a YouTube link below</p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-[#718096] uppercase tracking-wider mb-1.5">YouTube URL</label>
                    <input
                      type="text"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      onBlur={() => applyVideoUrl(videoUrl)}
                      onKeyDown={(e) => e.key === 'Enter' && applyVideoUrl(videoUrl)}
                      placeholder="https://youtube.com/watch?v=..."
                      className="w-full h-8 px-2.5 text-xs border border-[#dde3eb] rounded-md bg-white focus:border-blue-400 focus:ring-2 focus:ring-blue-100 focus:outline-none shadow-sm text-[#2d3748]"
                    />
                  </div>
                  {/* Thumbnail preview */}
                  {selectedAttrs.src && selectedAttrs.src.includes('youtube') && (
                    <div>
                      <label className="block text-[10px] font-bold text-[#718096] uppercase tracking-wider mb-1.5">Preview</label>
                      <div className="relative rounded-lg overflow-hidden border border-[#dde3eb] shadow-sm">
                        <img src={selectedAttrs.src} alt="Video thumbnail" className="w-full aspect-video object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                            <Play className="w-5 h-5 text-white ml-0.5" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-[10px] font-bold text-[#718096] uppercase tracking-wider mb-1.5">Width</label>
                    <PropertyFieldInput
                      field={{ key: 'width', label: 'Width', type: 'text', placeholder: '100%' }}
                      value={selectedAttrs.width || '100%'}
                      onUpdate={updateAttr}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#718096] uppercase tracking-wider mb-1.5">Roundness</label>
                    <PropertyFieldInput
                      field={{ key: 'border-radius', label: 'Roundness', type: 'text', placeholder: '8px' }}
                      value={selectedAttrs['border-radius'] || ''}
                      onUpdate={updateAttr}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-[#718096] uppercase tracking-wider mb-1.5">Padding</label>
                    <PropertyFieldInput
                      field={{ key: 'padding', label: 'Padding', type: 'text', placeholder: '10px 25px' }}
                      value={selectedAttrs.padding || ''}
                      onUpdate={updateAttr}
                    />
                  </div>
                  <div className="pt-2 border-t border-[#e2e6ec]">
                    <p className="text-[10px] text-[#a0aec0] leading-relaxed">The video thumbnail is shown in the email. When clicked, it opens the YouTube video in the browser.</p>
                  </div>
                </div>
              </>
            ) : selectedType === 'mj-raw' ? (
              <>
                {/* Code editor header */}
                <div className="px-4 py-3 bg-[#161b22] border-b border-[#30363d] shrink-0 flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
                    <Code className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div>
                    <span className="text-[13px] font-semibold text-[#e6edf3]">Raw HTML</span>
                    <p className="text-[10px] text-[#7d8590]">Edit HTML source code</p>
                  </div>
                </div>
                {/* Line numbers + editor */}
                <div className="flex-1 overflow-hidden flex">
                  <div className="w-10 bg-[#0d1117] border-r border-[#21262d] pt-3 shrink-0 select-none overflow-hidden">
                    {rawHtmlContent.split('\n').map((_, i) => (
                      <div key={i} className="text-[11px] leading-[20px] text-[#484f58] text-right pr-2 font-mono">{i + 1}</div>
                    ))}
                  </div>
                  <textarea
                    value={rawHtmlContent}
                    onChange={(e) => setRawHtmlContent(e.target.value)}
                    onBlur={() => updateRawHtml(rawHtmlContent)}
                    className="flex-1 bg-[#0d1117] text-[#e6edf3] font-mono text-[12px] leading-[20px] p-3 resize-none outline-none border-none selection:bg-[#264f78] placeholder:text-[#484f58] overflow-auto"
                    placeholder="<!-- Enter your HTML here -->&#10;<div style='text-align:center'>&#10;  <p>Your custom content</p>&#10;</div>"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                </div>
                {/* Footer hint */}
                <div className="px-4 py-2 bg-[#161b22] border-t border-[#30363d] shrink-0 flex items-center justify-between">
                  <span className="text-[10px] text-[#7d8590]">Changes apply on blur</span>
                  <button
                    className="text-[10px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors px-2 py-1 rounded hover:bg-white/5"
                    onClick={() => updateRawHtml(rawHtmlContent)}
                  >
                    Apply Now
                  </button>
                </div>
              </>
            ) : selectedType && fields.length > 0 ? (
              <>
                {/* Properties header */}
                <div className="px-4 py-3 bg-white border-b border-[#e2e6ec] shrink-0 shadow-sm">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                      <Icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <span className="text-[13px] font-semibold text-[#1a202c]">
                        {TYPE_LABELS[selectedType] || selectedType}
                      </span>
                      <p className="text-[10px] text-[#718096]">Edit properties below</p>
                    </div>
                  </div>
                </div>
                {/* Fields */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {fields.map(field => (
                    <div key={field.key}>
                      <label className="block text-[10px] font-bold text-[#718096] uppercase tracking-wider mb-1.5">
                        {field.label}
                      </label>
                      <PropertyFieldInput
                        field={field}
                        value={selectedAttrs[field.key] || ''}
                        onUpdate={updateAttr}
                      />
                    </div>
                  ))}
                  <div className="pt-2 border-t border-[#e2e6ec]">
                    <button
                      className="w-full flex items-center gap-2 px-3 py-2 text-[11px] font-medium text-[#4a5568] bg-[#edf2f7] hover:bg-[#e2e8f0] rounded-lg transition-colors"
                      onClick={openHtmlEditor}
                    >
                      <Code className="w-3.5 h-3.5" />
                      Edit Component HTML
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#edf2f7] flex items-center justify-center mb-4">
                  <Square className="w-7 h-7 text-[#a0aec0]" />
                </div>
                <p className="text-sm font-semibold text-[#4a5568]">No element selected</p>
                <p className="text-xs text-[#a0aec0] mt-1 leading-relaxed">Click any element on the<br />canvas to edit its properties</p>
              </div>
            )}
          </div>
        </div>

        {/* Per-component HTML editor dialog */}
        <Dialog open={htmlEditorOpen} onOpenChange={setHtmlEditorOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>Edit Component HTML</DialogTitle>
            </DialogHeader>
            <textarea
              className="flex-1 min-h-[300px] w-full rounded-md border border-[#e2e6ec] bg-[#0d1117] text-[#e6edf3] px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={htmlEditorCode}
              onChange={(e) => setHtmlEditorCode(e.target.value)}
              spellCheck={false}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setHtmlEditorOpen(false)}>
                Cancel
              </Button>
              <Button className="bg-tw-blue hover:bg-tw-blue-dark" onClick={applyHtmlEditor}>
                Apply
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  },
);
