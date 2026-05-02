import type { AgentEventType } from '../types.js';

/** Human-readable labels for event types. */
export const EVENT_TYPE_LABELS: Record<AgentEventType, string> = {
  tool_call: 'Tool Call',
  tool_result: 'Tool Result',
  model_request: 'Model Request',
  model_response: 'Model Response',
  chain_start: 'Chain Start',
  chain_end: 'Chain End',
  decision: 'Decision',
  data_access: 'Data Access',
  error: 'Error',
  custom: 'Custom',
};

/** All valid event type values. */
export const VALID_EVENT_TYPES: AgentEventType[] = Object.keys(
  EVENT_TYPE_LABELS
) as AgentEventType[];

/** Check whether a string is a valid AgentEventType. */
export function isValidEventType(value: string): value is AgentEventType {
  return VALID_EVENT_TYPES.includes(value as AgentEventType);
}
