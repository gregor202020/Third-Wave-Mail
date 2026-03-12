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
import GjsEditor from '@grapesjs/react';
import grapesjs from 'grapesjs';
import mjml from 'grapesjs-mjml';
import { Monitor, Smartphone, Eye, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { Asset } from '@/types';

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

export const GrapesEditor = forwardRef<GrapesEditorRef, GrapesEditorProps>(
  function GrapesEditor({ initialContent, onChange, onSave, saving }, ref) {
    const editorRef = useRef<Editor | null>(null);
    const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
    const [preview, setPreview] = useState(false);

    useImperativeHandle(ref, () => ({
      getHtml: () => {
        if (!editorRef.current) return '';
        return editorRef.current.getHtml() + `<style>${editorRef.current.getCss()}</style>`;
      },
      getJson: () => {
        if (!editorRef.current) return '{}';
        return JSON.stringify(editorRef.current.getProjectData());
      },
    }));

    const handleEditorReady = useCallback(
      async (editor: Editor) => {
        editorRef.current = editor;

        // Load assets from server
        try {
          const assets = await api.get<{ data: Asset[] }>('/assets');
          if (assets?.data) {
            editor.AssetManager.add(
              assets.data.map((a) => ({
                src: a.url,
                name: a.filename,
                type: 'image' as const,
              }))
            );
          }
        } catch {
          // Assets loading is non-critical
        }

        // Configure asset upload
        editor.on('asset:upload:start', () => {
          // Could show loading state
        });

        editor.on('asset:upload:response', (response: unknown) => {
          // Response handled by custom upload
          return response;
        });

        // Load initial content if provided
        if (initialContent) {
          try {
            const parsed = JSON.parse(initialContent);
            if (parsed && typeof parsed === 'object' && (parsed.pages || parsed.styles)) {
              editor.loadProjectData(parsed);
            } else {
              editor.setComponents(initialContent);
            }
          } catch {
            // Not JSON, treat as HTML
            editor.setComponents(initialContent);
          }
        }
      },
      [initialContent]
    );

    const debounceRef = useRef<ReturnType<typeof setTimeout>>();
    const handleUpdate = useCallback(() => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!editorRef.current || !onChange) return;
        const html =
          editorRef.current.getHtml() +
          `<style>${editorRef.current.getCss()}</style>`;
        const json = JSON.stringify(editorRef.current.getProjectData());
        onChange(html, json);
      }, 500);
    }, [onChange]);

    useEffect(() => {
      return () => clearTimeout(debounceRef.current);
    }, []);

    const toggleViewport = useCallback(
      (mode: 'desktop' | 'mobile') => {
        setViewport(mode);
        if (!editorRef.current) return;
        if (mode === 'mobile') {
          editorRef.current.setDevice('Mobile portrait');
        } else {
          editorRef.current.setDevice('Desktop');
        }
      },
      []
    );

    const togglePreview = useCallback(() => {
      if (!editorRef.current) return;
      if (preview) {
        editorRef.current.stopCommand('preview');
      } else {
        editorRef.current.runCommand('preview');
      }
      setPreview(!preview);
    }, [preview]);

    return (
      <div className="flex flex-col h-full min-h-[500px] bg-white border border-card-border rounded-lg overflow-hidden">
        {/* Editor toolbar */}
        <div className="flex items-center justify-between h-10 px-3 border-b border-card-border bg-white shrink-0">
          <div className="flex items-center gap-1">
            <Button
              variant={viewport === 'desktop' ? 'secondary' : 'ghost'}
              size="icon-xs"
              onClick={() => toggleViewport('desktop')}
              title="Desktop view"
            >
              <Monitor className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant={viewport === 'mobile' ? 'secondary' : 'ghost'}
              size="icon-xs"
              onClick={() => toggleViewport('mobile')}
              title="Mobile view"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant={preview ? 'secondary' : 'ghost'}
              size="xs"
              onClick={togglePreview}
            >
              <Eye className="w-3.5 h-3.5" />
              Preview
            </Button>
            {onSave && (
              <Button
                className="bg-tw-blue hover:bg-tw-blue-dark"
                size="xs"
                onClick={onSave}
                disabled={saving}
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>

        {/* GrapesJS editor */}
        <div className={cn('flex-1 relative')}>
          <GjsEditor
            grapesjs={grapesjs}
            grapesjsCss="https://unpkg.com/grapesjs/dist/css/grapes.min.css"
            plugins={[mjml]}
            options={{
              height: '100%',
              storageManager: false,
              deviceManager: {
                devices: [
                  { name: 'Desktop', width: '' },
                  { name: 'Mobile portrait', width: '375px' },
                ],
              },
              assetManager: {
                uploadFile: async (ev: DragEvent | Event) => {
                  const files =
                    (ev as DragEvent).dataTransfer?.files ||
                    (ev.target as HTMLInputElement)?.files;
                  if (!files) return;

                  for (let i = 0; i < files.length; i++) {
                    const formData = new FormData();
                    formData.append('file', files[i]);
                    try {
                      const result = await api.upload<{ data: Asset }>(
                        '/assets/upload',
                        formData
                      );
                      if (result?.data) {
                        editorRef.current?.AssetManager.add({
                          src: result.data.url,
                          name: result.data.filename,
                          type: 'image',
                        });
                      }
                    } catch {
                      // Upload error - silently fail
                    }
                  }
                },
              },
            }}
            onReady={handleEditorReady}
            onUpdate={handleUpdate}
          />
        </div>
      </div>
    );
  }
);
