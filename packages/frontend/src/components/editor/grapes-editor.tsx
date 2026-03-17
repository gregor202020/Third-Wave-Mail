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
import { Monitor, Smartphone, Eye, Undo2, Redo2, Code, Save, Layers, Palette, LayoutGrid } from 'lucide-react';
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
          Start editing this template by clicking on any element. Use the blocks panel on the left to drag in new content blocks.
        </mj-text>
        <mj-button background-color="#2563eb" color="#ffffff" font-size="16px" border-radius="6px" href="#">
          Call to Action
        </mj-button>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`;

export const GrapesEditor = forwardRef<GrapesEditorRef, GrapesEditorProps>(
  function GrapesEditor({ initialContent, onChange, onSave, saving }, ref) {
    const editorRef = useRef<Editor | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop');
    const [preview, setPreview] = useState(false);
    const [ready, setReady] = useState(false);
    const [activePanel, setActivePanel] = useState<'blocks' | 'styles' | 'layers'>('blocks');

    useImperativeHandle(ref, () => ({
      getHtml: () => {
        if (!editorRef.current) return '';
        try {
          const result = editorRef.current.runCommand('mjml-code-to-html') as {
            html: string;
            errors: Array<{ formattedMessage: string }>;
          };
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
        },
        styleManager: {
          sectors: [
            {
              name: 'Typography',
              open: true,
              properties: [
                'font-family', 'font-size', 'font-weight', 'letter-spacing',
                'color', 'line-height', 'text-align', 'text-decoration',
              ],
            },
            {
              name: 'Layout',
              open: false,
              properties: [
                'padding', 'margin', 'width', 'max-width', 'min-height',
              ],
            },
            {
              name: 'Background',
              open: false,
              properties: ['background-color', 'background-image'],
            },
            {
              name: 'Border',
              open: false,
              properties: [
                'border-radius', 'border', 'border-width', 'border-color',
              ],
            },
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
            const result = editor.runCommand('mjml-code-to-html') as {
              html: string;
            };
            const html = result?.html ?? editor.getHtml();
            const json = JSON.stringify(editor.getProjectData());
            onChange(html, json);
          } catch {
            // ignore
          }
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

    const setDevice = useCallback((mode: 'desktop' | 'tablet' | 'mobile') => {
      setViewport(mode === 'tablet' ? 'desktop' : mode);
      if (!editorRef.current) return;
      const map = { desktop: 'Desktop', tablet: 'Tablet', mobile: 'Mobile' };
      editorRef.current.setDevice(map[mode]);
    }, []);

    const togglePreview = useCallback(() => {
      if (!editorRef.current) return;
      if (preview) editorRef.current.stopCommand('preview');
      else editorRef.current.runCommand('preview');
      setPreview(!preview);
    }, [preview]);

    const undo = useCallback(() => editorRef.current?.UndoManager.undo(), []);
    const redo = useCallback(() => editorRef.current?.UndoManager.redo(), []);

    const toggleCode = useCallback(() => {
      if (!editorRef.current) return;
      editorRef.current.runCommand('mjml-code');
    }, []);

    // Blocks panel - rendered by GrapesJS into a container
    const renderBlocksPanel = () => (
      <div id="gjs-blocks-container" className="p-1" />
    );

    // Render style manager panel
    const renderStylesPanel = () => (
      <div id="gjs-styles-container" className="p-2 text-xs" />
    );

    // Render layers panel
    const renderLayersPanel = () => (
      <div id="gjs-layers-container" className="p-2 text-xs" />
    );

    // Mount GrapesJS panels to our custom containers
    useEffect(() => {
      if (!ready || !editorRef.current) return;
      const editor = editorRef.current;

      const blocksEl = document.getElementById('gjs-blocks-container');
      if (blocksEl && activePanel === 'blocks' && blocksEl.childElementCount === 0) {
        const blocksView = editor.Blocks.render();
        blocksEl.appendChild(blocksView);
      }

      const stylesEl = document.getElementById('gjs-styles-container');
      if (stylesEl && activePanel === 'styles' && stylesEl.childElementCount === 0) {
        stylesEl.appendChild(editor.StyleManager.render());
      }

      const layersEl = document.getElementById('gjs-layers-container');
      if (layersEl && activePanel === 'layers' && layersEl.childElementCount === 0) {
        layersEl.appendChild(editor.Layers.render());
      }
    }, [ready, activePanel]);

    return (
      <div className="flex flex-col h-full bg-[#1a1a2e]">
        {/* Toolbar */}
        <div className="flex items-center justify-between h-10 px-3 bg-[#16213e] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn('text-white/60 hover:text-white hover:bg-white/10', viewport === 'desktop' && 'text-white bg-white/10')}
              onClick={() => setDevice('desktop')}
              title="Desktop"
            >
              <Monitor className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn('text-white/60 hover:text-white hover:bg-white/10', viewport === 'mobile' && 'text-white bg-white/10')}
              onClick={() => setDevice('mobile')}
              title="Mobile"
            >
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

            <Button
              variant="ghost"
              size="icon-xs"
              className={cn('text-white/60 hover:text-white hover:bg-white/10', preview && 'text-blue-400 bg-white/10')}
              onClick={togglePreview}
              title="Preview"
            >
              <Eye className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon-xs" className="text-white/60 hover:text-white hover:bg-white/10" onClick={toggleCode} title="View Code">
              <Code className="w-3.5 h-3.5" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5">
            {onSave && (
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white h-7 text-xs px-3"
                onClick={onSave}
                disabled={saving}
              >
                <Save className="w-3 h-3 mr-1" />
                {saving ? 'Saving...' : 'Save'}
              </Button>
            )}
          </div>
        </div>

        {/* Main editor area */}
        <div className="flex flex-1 min-h-0">
          {/* Left panel - Blocks / Layers */}
          <div className="w-[220px] bg-white border-r border-gray-200 flex flex-col shrink-0">
            {/* Panel tabs */}
            <div className="flex border-b border-gray-200">
              <button
                className={cn(
                  'flex-1 py-2 text-[11px] font-medium transition-colors flex items-center justify-center gap-1',
                  activePanel === 'blocks' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                )}
                onClick={() => setActivePanel('blocks')}
              >
                <LayoutGrid className="w-3 h-3" />
                Blocks
              </button>
              <button
                className={cn(
                  'flex-1 py-2 text-[11px] font-medium transition-colors flex items-center justify-center gap-1',
                  activePanel === 'layers' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                )}
                onClick={() => setActivePanel('layers')}
              >
                <Layers className="w-3 h-3" />
                Layers
              </button>
              <button
                className={cn(
                  'flex-1 py-2 text-[11px] font-medium transition-colors flex items-center justify-center gap-1',
                  activePanel === 'styles' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500 hover:text-gray-700'
                )}
                onClick={() => setActivePanel('styles')}
              >
                <Palette className="w-3 h-3" />
                Styles
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">
              {activePanel === 'blocks' && renderBlocksPanel()}
              {activePanel === 'styles' && renderStylesPanel()}
              {activePanel === 'layers' && renderLayersPanel()}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 min-w-0 relative" ref={containerRef} />
        </div>
      </div>
    );
  },
);
