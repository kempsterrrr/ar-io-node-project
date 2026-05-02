import type { DigitalSourceType } from '../types.js';

/** IPTC digital source types with human-readable labels. */
export const SOURCE_TYPE_LABELS: Record<DigitalSourceType, string> = {
  trainedAlgorithmicMedia: 'AI-generated (trained model)',
  compositeWithTrainedAlgorithmicMedia: 'Composite with AI elements',
  algorithmicMedia: 'Algorithmically generated',
  digitalCapture: 'Digital capture (camera/scanner)',
  digitalArt: 'Digital artwork',
  composite: 'Composite media',
  minorHumanEdits: 'Minor human edits',
  dataDrivenMedia: 'Data-driven media',
};

/** All valid digital source type values. */
export const VALID_SOURCE_TYPES: ReadonlySet<string> = new Set(Object.keys(SOURCE_TYPE_LABELS));

/** Check if a string is a valid DigitalSourceType. */
export function isValidSourceType(value: string): value is DigitalSourceType {
  return VALID_SOURCE_TYPES.has(value);
}
