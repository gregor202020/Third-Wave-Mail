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
  Layers, Palette, LayoutGrid, Image, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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

const DEFAULT_MJML = `<mjml>
  <mj-body>
    <mj-section background-color="#ffffff" padding="20px">
      <mj-column>
        <mj-text font-size="24px" font-weight="bold" align="center" color="#333333">
          Your Email Title
        </mj-text>
        <mj-text font-size="16px" color="#555555" line-height="1.6">
          Start editing this template by clicking on any element. Drag blocks from the left panel to add new content.
        </mj-text>
        <mj-button background-color="#2563eb" color="#ffffff" font-size="16px" border-radius="6px" href="#">
          Call to Action
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

type PanelTab = 'blocks' | 'styles' | 'layers' | 'images';

export const GrapesEditor = forwardRef<GrapesEditorRef, GrapesEditorProps>(
  function GrapesEditor({ initialContent, onChange, onSave, saving }, ref) {
    const editorRef = useRef<Editor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
    const [preview, setPreview] = useState(false);
    const [ready, setReady] = useState(false);
    const [activePanel, setActivePanel] = useState<PanelTab>('blocks');
    const [panelOpen, setPanelOpen] = useState(true);
    const [uploadedImages, setUploadedImages] = useState<Array<{ id: number; url: string; filename: string }>>([]);
    const [uploading, setUploading] = useState(false);

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

    // Load existing images from API
    useEffect(() => {
      fetch('/api/proxy/assets?page=1&per_page=100', { credentials: 'include' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.data) {
            setUploadedImages(
              data.data
                .filter((a: Record<string, unknown>) => typeof a.mime_type === 'string' && (a.mime_type as string).startsWith('image/'))
                .map((a: Record<string, unknown>) => ({ id: a.id, url: a.url, filename: a.original_name || a.filename }))
            );
          }
        })
        .catch(() => {});
    }, []);

    // Handle image upload
    const handleImageUpload = useCallback(async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          if (!file.type.startsWith('image/')) continue;
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch('/api/proxy/assets/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include',
          });
          if (res.ok) {
            const json = await res.json();
            const asset = json.data;
            const newImg = { id: asset.id, url: asset.url, filename: asset.original_name || asset.filename };
            setUploadedImages(prev => [newImg, ...prev]);
            // Add to GrapesJS asset manager
            if (editorRef.current) {
              editorRef.current.AssetManager.add({ src: asset.url, name: asset.original_name });
            }
          }
        }
      } catch {
        // ignore
      }
      setUploading(false);
    }, []);

    // Copy image URL to clipboard so user can paste into image src
    const copyImageUrl = useCallback((url: string) => {
      navigator.clipboard.writeText(url).catch(() => {});
    }, []);

    // Open the GrapesJS asset manager
    const openAssetManager = useCallback(() => {
      if (!editorRef.current) return;
      editorRef.current.runCommand('open-assets');
    }, []);

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
          upload: '/api/proxy/assets/upload',
          uploadName: 'file',
          credentials: 'include',
          autoAdd: true,
        },
        deviceManager: {
          devices: [
            { name: 'Desktop', width: '' },
            { name: 'Tablet', width: '768px' },
            { name: 'Mobile', width: '375px' },
          ],
        },
        canvas: {
          styles: [
            'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
          ],
          frameStyle: `
            body { background-color: #e5e7eb !important; }
            .gjs-dashed *[data-gjs-highlightable] { outline: 1px dashed rgba(170,170,170,0.3); }
          `,
        },
        styleManager: {
          sectors: [
            { name: 'Typography', open: true, properties: ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'color', 'line-height', 'text-align', 'text-decoration'] },
            { name: 'Layout', open: false, properties: ['padding', 'margin', 'width', 'max-width', 'min-height'] },
            { name: 'Background', open: false, properties: ['background-color', 'background-image'] },
            { name: 'Border', open: false, properties: ['border-radius', 'border', 'border-width', 'border-color'] },
          ],
        },
      });

      editorRef.current = editor;

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

      // Add existing images to asset manager
      uploadedImages.forEach(img => {
        editor.AssetManager.add({ src: img.url, name: img.filename });
      });

      // When an mj-image is added with no src, auto-open asset manager
      editor.on('component:add', (component: { get: (k: string) => string; getAttributes: () => Record<string, string>; set: (k: string, v: Record<string, string>) => void }) => {
        const type = component.get('type');
        if (type === 'mj-image' || type === 'image') {
          const attrs = component.getAttributes();
          if (!attrs.src || attrs.src === '' || attrs.src === '#') {
            // Give it a placeholder so it's not a broken image
            component.set('attributes', {
              ...attrs,
              src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNjAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2U1ZTdlYiIvPjx0ZXh0IHg9IjMwMCIgeT0iMTUwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyMCIgZmlsbD0iIzk0YTNiOCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9IjdweCI+Q2xpY2sgdG8gc2VsZWN0IGFuIGltYWdlPC90ZXh0Pjwvc3ZnPg==',
              alt: 'Click to select an image',
            });
            // Select the component and open asset manager after a short delay
            setTimeout(() => {
              editor.select(component);
              editor.runCommand('open-assets');
            }, 300);
          }
        }
      });

      setReady(true);

      return () => {
        editor.destroy();
        editorRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-save on changes
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
      editor.on('component:styleUpdate', handleUpdate);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        editor.off('component:update', handleUpdate);
        editor.off('component:add', handleUpdate);
        editor.off('component:remove', handleUpdate);
        editor.off('component:styleUpdate', handleUpdate);
      };
    }, [ready, onChange]);

    const setDevice = useCallback((mode: 'desktop' | 'mobile') => {
      setViewport(mode);
      if (!editorRef.current) return;
      editorRef.current.setDevice(mode === 'mobile' ? 'Mobile' : 'Desktop');
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

    // Mount GrapesJS panels to containers
    useEffect(() => {
      if (!ready || !editorRef.current) return;
      const editor = editorRef.current;

      const blocksEl = document.getElementById('gjs-blocks-container');
      if (blocksEl && activePanel === 'blocks' && blocksEl.childElementCount === 0) {
        const v = editor.Blocks.render();
        if (v) blocksEl.appendChild(v);
      }
      const stylesEl = document.getElementById('gjs-styles-container');
      if (stylesEl && activePanel === 'styles' && stylesEl.childElementCount === 0) {
        const v = editor.StyleManager.render();
        if (v) stylesEl.appendChild(v);
      }
      const layersEl = document.getElementById('gjs-layers-container');
      if (layersEl && activePanel === 'layers' && layersEl.childElementCount === 0) {
        const v = editor.Layers.render();
        if (v) layersEl.appendChild(v);
      }
    }, [ready, activePanel]);

    const panelTabs: { key: PanelTab; label: string; icon: typeof LayoutGrid }[] = [
      { key: 'blocks', label: 'Blocks', icon: LayoutGrid },
      { key: 'images', label: 'Images', icon: Image },
      { key: 'layers', label: 'Layers', icon: Layers },
      { key: 'styles', label: 'Styles', icon: Palette },
    ];

    return (
      <div className="flex flex-col h-full overflow-hidden bg-[#1a1a2e]">
        {/* Toolbar */}
        <div className="flex items-center justify-between h-10 px-3 bg-[#16213e] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="icon-xs"
              className="text-white/60 hover:text-white hover:bg-white/10"
              onClick={() => setPanelOpen(!panelOpen)}
              title={panelOpen ? 'Collapse panel' : 'Expand panel'}
            >
              {panelOpen ? <PanelLeftClose className="w-3.5 h-3.5" /> : <PanelLeftOpen className="w-3.5 h-3.5" />}
            </Button>

            <div className="w-px h-5 bg-white/10 mx-1" />

            <Button variant="ghost" size="icon-xs" className={cn('text-white/60 hover:text-white hover:bg-white/10', viewport === 'desktop' && 'text-white bg-white/10')} onClick={() => setDevice('desktop')} title="Desktop">
              <Monitor className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" className={cn('text-white/60 hover:text-white hover:bg-white/10', viewport === 'mobile' && 'text-white bg-white/10')} onClick={() => setDevice('mobile')} title="Mobile">
              <Smartphone className="w-3.5 h-3.5" />
            </Button>

            <div className="w-px h-5 bg-white/10 mx-1" />

            <Button variant="ghost" size="icon-xs" className="text-white/60 hover:text-white hover:bg-white/10" onClick={undo} title="Undo">
              <Undo2 className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" className="text-white/60 hover:text-white hover:bg-white/10" onClick={redo} title="Redo">
              <Redo2 className="w-3.5 h-3.5" />
            </Button>

            <div className="w-px h-5 bg-white/10 mx-1" />

            <Button variant="ghost" size="icon-xs" className={cn('text-white/60 hover:text-white hover:bg-white/10', preview && 'text-blue-400 bg-white/10')} onClick={togglePreview} title="Preview">
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" className="text-white/60 hover:text-white hover:bg-white/10" onClick={toggleCode} title="View Code">
              <Code className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {onSave && (
              <Button className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs px-3" onClick={onSave} disabled={saving}>
                <Save className="w-3 h-3 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>

        {/* Main editor area */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel */}
          {panelOpen && (
            <div className="w-[240px] bg-white border-r border-gray-200 flex flex-col shrink-0">
              {/* Panel tabs */}
              <div className="flex border-b border-gray-200 shrink-0">
                {panelTabs.map(tab => (
                  <button
                    key={tab.key}
                    className={cn(
                      'flex-1 py-2 text-[10px] font-medium transition-colors flex items-center justify-center gap-1',
                      activePanel === tab.key ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400 hover:text-gray-600'
                    )}
                    onClick={() => setActivePanel(tab.key)}
                  >
                    <tab.icon className="w-3 h-3" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Panel content */}
              <div className="flex-1 overflow-y-auto">
                {activePanel === 'blocks' && (
                  <div id="gjs-blocks-container" className="p-1" />
                )}

                {activePanel === 'images' && (
                  <div className="p-3 space-y-3">
                    {/* Instructions */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-[10px] text-blue-700 leading-relaxed">
                      <strong>How to add images:</strong>
                      <ol className="list-decimal ml-3 mt-1 space-y-0.5">
                        <li>Upload images below</li>
                        <li>Drag an <strong>Image</strong> block from the Blocks tab onto your email</li>
                        <li>Double-click the image placeholder to pick from your uploads</li>
                      </ol>
                    </div>

                    {/* Upload area */}
                    <label className="flex flex-col items-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors">
                      <Image className="w-6 h-6 text-gray-400" />
                      <span className="text-[11px] text-gray-500 font-medium">
                        {uploading ? 'Uploading...' : 'Click to upload images'}
                      </span>
                      <span className="text-[9px] text-gray-400">PNG, JPG, GIF, WebP up to 25MB</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => handleImageUpload(e.target.files)}
                        disabled={uploading}
                      />
                    </label>

                    {/* Open asset manager button */}
                    <button
                      className="w-full py-2 text-[11px] font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                      onClick={openAssetManager}
                    >
                      Open Image Picker
                    </button>

                    {/* Image grid */}
                    {uploadedImages.length > 0 ? (
                      <>
                        <p className="text-[10px] text-gray-500 font-medium">Uploaded Images ({uploadedImages.length})</p>
                        <div className="grid grid-cols-2 gap-2">
                          {uploadedImages.map(img => (
                            <div
                              key={img.id}
                              className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200"
                            >
                              <img src={img.url} alt={img.filename} className="w-full h-full object-cover" />
                              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-1.5 pt-4">
                                <p className="text-[9px] text-white truncate">{img.filename}</p>
                              </div>
                              <button
                                className="absolute top-1 right-1 bg-white/90 hover:bg-white text-[9px] text-gray-600 px-1.5 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => copyImageUrl(img.url)}
                                title="Copy URL"
                              >
                                Copy URL
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-[11px] text-gray-400 text-center py-4">No images uploaded yet</p>
                    )}
                  </div>
                )}

                {activePanel === 'styles' && <div id="gjs-styles-container" className="p-2 text-xs" />}
                {activePanel === 'layers' && <div id="gjs-layers-container" className="p-2 text-xs" />}
              </div>
            </div>
          )}

          {/* Canvas */}
          <div className="flex-1 min-w-0 min-h-0 relative overflow-hidden bg-gray-100" ref={containerRef} />
        </div>
      </div>
    );
  },
);
