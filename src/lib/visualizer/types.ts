export interface RoomLuma {
  w: number;
  h: number;
  luma: Float32Array; // row-major, 0..255
}

export interface RoomLayout {
  horizonY: number;
  pxPerMeter: number;
}

export type SurfaceKind = 'floor' | 'wall' | 'ceiling' | 'countertop';

export type Step = 'room' | 'surface' | 'material' | 'result';

/** Normalized polygon point in image space: x,y in 0..1 relative to the image. */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** One region returned by the cloud segmentation service, normalized to 0..1. */
export interface AISegment {
  surfaceType: string;
  label: string;
  confidence: number;
  polygon: NormalizedPoint[];
}

/** Response shape of POST /api/visualizer/segment (normalized, service-agnostic). */
export interface SegmentResponse {
  segments: AISegment[];
  skipped: boolean;
}

export interface VisMaterial {
  id: string;
  slug: string;
  name: string;
  textureUrl: string;
  typeCode: string;
  typeLabel: string;
  colourLabel: string;
  finishLabel: string;
  sizeLabel: string;
}