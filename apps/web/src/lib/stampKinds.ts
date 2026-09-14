import {
  Image,
  LayoutPanelTop,
  Layers3,
  Menu,
  MousePointer2,
  PanelsTopLeft,
  Search,
  Sparkles,
  SquareStack,
  TableProperties,
  type LucideIcon,
} from 'lucide-react';
import type { StampKind } from '@canvascraft/schema';

/**
 * One entry per stamp kind, shared by the Canvas Studio toolbar, the on-canvas
 * kind badges, and the template gallery preview thumbnails, so the same
 * icon + colour always means the same component everywhere in the app
 * (see CanvasStudio's `KindBadge` for why this exists at all). Colors are
 * Tailwind 700-shades — dark enough that a white icon on top clears 4.5:1
 * against any of them.
 */
export const STAMPS: Array<{ kind: StampKind; label: string; width: number; height: number; icon: LucideIcon; color: string }> = [
  { kind: 'navbar', label: 'Navbar', width: 520, height: 64, icon: Menu, color: '#4338ca' },
  { kind: 'hero', label: 'Hero', width: 440, height: 120, icon: Sparkles, color: '#b45309' },
  { kind: 'card', label: 'Card', width: 280, height: 150, icon: Layers3, color: '#334155' },
  { kind: 'button', label: 'Button', width: 150, height: 48, icon: MousePointer2, color: '#047857' },
  { kind: 'input', label: 'Input', width: 260, height: 48, icon: Search, color: '#1d4ed8' },
  { kind: 'table', label: 'Table', width: 430, height: 210, icon: TableProperties, color: '#7e22ce' },
  { kind: 'tab', label: 'Tabs', width: 310, height: 48, icon: LayoutPanelTop, color: '#0f766e' },
  { kind: 'media', label: 'Media', width: 300, height: 190, icon: Image, color: '#be185d' },
  { kind: 'modal', label: 'Modal', width: 360, height: 220, icon: SquareStack, color: '#b91c1c' },
  { kind: 'sidebar', label: 'Sidebar', width: 190, height: 440, icon: PanelsTopLeft, color: '#0e7490' },
];

export const KIND_META: Record<StampKind, (typeof STAMPS)[number]> = Object.fromEntries(
  STAMPS.map((stamp) => [stamp.kind, stamp]),
) as Record<StampKind, (typeof STAMPS)[number]>;
