import type { Plugin } from 'vite';
export function editorPlugin(kitRoot: string): Plugin;
export function locate(source: string, file: string): string;
export const EDITOR_PORT: number;
