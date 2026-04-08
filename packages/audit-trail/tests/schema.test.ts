import { describe, it, expect } from 'vitest';
import { EVENT_TYPE_LABELS, VALID_EVENT_TYPES, isValidEventType } from '../src/schema/events.js';

describe('schema/events', () => {
  it('EVENT_TYPE_LABELS has entries for all valid types', () => {
    expect(Object.keys(EVENT_TYPE_LABELS)).toHaveLength(10);
    expect(EVENT_TYPE_LABELS.tool_call).toBe('Tool Call');
    expect(EVENT_TYPE_LABELS.error).toBe('Error');
  });

  it('VALID_EVENT_TYPES contains all event types', () => {
    expect(VALID_EVENT_TYPES).toHaveLength(10);
    expect(VALID_EVENT_TYPES).toContain('tool_call');
    expect(VALID_EVENT_TYPES).toContain('model_request');
    expect(VALID_EVENT_TYPES).toContain('chain_start');
    expect(VALID_EVENT_TYPES).toContain('custom');
  });

  it('isValidEventType returns true for valid types', () => {
    expect(isValidEventType('tool_call')).toBe(true);
    expect(isValidEventType('error')).toBe(true);
    expect(isValidEventType('custom')).toBe(true);
  });

  it('isValidEventType returns false for invalid types', () => {
    expect(isValidEventType('not_a_type')).toBe(false);
    expect(isValidEventType('')).toBe(false);
  });
});
