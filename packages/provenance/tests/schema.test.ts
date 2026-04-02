import { describe, it, expect } from 'vitest';
import {
  SOURCE_TYPE_LABELS,
  VALID_SOURCE_TYPES,
  isValidSourceType,
} from '../src/schema/source-types.js';
import { TAG_NAMES, TAG_VALUES, getTagValue } from '../src/tags.js';

describe('source types', () => {
  it('defines labels for all AI content source types', () => {
    expect(SOURCE_TYPE_LABELS.trainedAlgorithmicMedia).toBe('AI-generated (trained model)');
    expect(SOURCE_TYPE_LABELS.compositeWithTrainedAlgorithmicMedia).toBe(
      'Composite with AI elements'
    );
    expect(SOURCE_TYPE_LABELS.digitalCapture).toBe('Digital capture (camera/scanner)');
  });

  it('validates known source types', () => {
    expect(isValidSourceType('trainedAlgorithmicMedia')).toBe(true);
    expect(isValidSourceType('compositeWithTrainedAlgorithmicMedia')).toBe(true);
    expect(isValidSourceType('algorithmicMedia')).toBe(true);
    expect(isValidSourceType('digitalCapture')).toBe(true);
    expect(isValidSourceType('digitalArt')).toBe(true);
    expect(isValidSourceType('composite')).toBe(true);
    expect(isValidSourceType('minorHumanEdits')).toBe(true);
    expect(isValidSourceType('dataDrivenMedia')).toBe(true);
  });

  it('rejects invalid source types', () => {
    expect(isValidSourceType('unknown')).toBe(false);
    expect(isValidSourceType('')).toBe(false);
    expect(isValidSourceType('AI_GENERATED')).toBe(false);
  });

  it('VALID_SOURCE_TYPES set has correct count', () => {
    expect(VALID_SOURCE_TYPES.size).toBe(8);
  });
});

describe('tags', () => {
  it('defines provenance-specific tag names', () => {
    expect(TAG_NAMES.PROTOCOL).toBe('Data-Protocol');
    expect(TAG_NAMES.TYPE).toBe('Type');
    expect(TAG_NAMES.MANIFEST_ID).toBe('C2PA-Manifest-ID');
    expect(TAG_NAMES.CONTENT_TX_ID).toBe('Content-Tx-Id');
    expect(TAG_NAMES.ANCHOR_TX_ID).toBe('Provenance-Anchor-Tx-Id');
  });

  it('defines provenance-specific tag values', () => {
    expect(TAG_VALUES.PROTOCOL).toBe('AgenticWay-Integrity');
    expect(TAG_VALUES.TYPE_PROVENANCE_ANCHOR).toBe('integrity-provenance-anchor');
    expect(TAG_VALUES.HASH_ALGORITHM).toBe('SHA-256');
  });

  it('getTagValue extracts tag from array', () => {
    const tags = [
      { name: 'Content-Type', value: 'image/png' },
      { name: 'C2PA-Manifest-ID', value: 'urn:c2pa:test' },
    ];

    expect(getTagValue(tags, 'C2PA-Manifest-ID')).toBe('urn:c2pa:test');
    expect(getTagValue(tags, 'Content-Type')).toBe('image/png');
  });

  it('getTagValue returns null for missing tag', () => {
    const tags = [{ name: 'Content-Type', value: 'image/png' }];
    expect(getTagValue(tags, 'Missing-Tag')).toBeNull();
  });

  it('getTagValue handles empty tag array', () => {
    expect(getTagValue([], 'Any-Tag')).toBeNull();
  });
});
