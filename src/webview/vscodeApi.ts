import type { WebviewToHost } from "../shared/protocol";

interface VsCodeApi {
  postMessage(message: WebviewToHost): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

/** Singleton handle to the host. `acquireVsCodeApi` may only be called once. */
export const vscodeApi: VsCodeApi = acquireVsCodeApi();

export function post(message: WebviewToHost): void {
  vscodeApi.postMessage(message);
}

interface WebviewState {
  selectedPath: string[] | null;
  /** Detail panel width in px, as last dragged. */
  panelWidth?: number;
}

const state = (): Partial<WebviewState> => vscodeApi.getState<WebviewState>() ?? {};

export function getSelectedPath(): string[] | null {
  return state().selectedPath ?? null;
}

export function setSelectedPathState(selectedPath: string[] | null): void {
  vscodeApi.setState<WebviewState>({ ...state(), selectedPath });
}

export function getPanelWidth(): number | undefined {
  return state().panelWidth;
}

export function setPanelWidthState(panelWidth: number): void {
  vscodeApi.setState<WebviewState>({ selectedPath: null, ...state(), panelWidth });
}
