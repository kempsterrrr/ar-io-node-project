/**
 * AIUC-1 compliance domains and control definitions.
 *
 * Maps the 6 AIUC-1 domains to their controls, evidence types,
 * and metadata structures for integrity anchoring.
 */

/** The six AIUC-1 compliance domains. */
export type Aiuc1Domain =
  | 'security'
  | 'safety'
  | 'reliability'
  | 'accountability'
  | 'data-privacy'
  | 'society';

/** Human-readable labels for each domain. */
export const DOMAIN_LABELS: Record<Aiuc1Domain, string> = {
  security: 'Security',
  safety: 'Safety',
  reliability: 'Reliability',
  accountability: 'Accountability',
  'data-privacy': 'Data & Privacy',
  society: 'Society',
} as const;

/** Types of evidence that can be submitted for compliance. */
export type EvidenceType =
  | 'policy-document'
  | 'test-result'
  | 'configuration'
  | 'vulnerability-report'
  | 'code-review'
  | 'incident-report'
  | 'audit-log'
  | 'training-record'
  | 'risk-assessment'
  | 'data-flow-diagram'
  | 'access-control-matrix'
  | 'model-card'
  | 'bias-assessment'
  | 'impact-assessment'
  | 'consent-record'
  | 'retention-policy'
  | 'other';

/** An AIUC-1 control identifier (e.g. 'S001', 'E004', 'D001'). */
export type ControlId = string;

/** Definition of a single AIUC-1 control. */
export interface ControlDefinition {
  /** Control ID (e.g. 'S001'). */
  id: ControlId;
  /** AIUC-1 domain. */
  domain: Aiuc1Domain;
  /** Short title. */
  title: string;
  /** Description of what this control requires. */
  description: string;
  /** Typical evidence types for this control. */
  typicalEvidence: EvidenceType[];
}

/**
 * AIUC-1 control registry.
 *
 * Maps representative controls from each of the 6 domains.
 * This is not exhaustive — enterprises can extend with custom controls.
 */
export const CONTROLS: ControlDefinition[] = [
  // Security domain
  {
    id: 'S001',
    domain: 'security',
    title: 'Access Control',
    description: 'AI systems implement appropriate access controls and authentication',
    typicalEvidence: ['access-control-matrix', 'configuration', 'policy-document'],
  },
  {
    id: 'S002',
    domain: 'security',
    title: 'Data Encryption',
    description: 'Data at rest and in transit is encrypted using approved algorithms',
    typicalEvidence: ['configuration', 'test-result', 'policy-document'],
  },
  {
    id: 'S003',
    domain: 'security',
    title: 'Vulnerability Management',
    description: 'Regular vulnerability scanning and remediation processes',
    typicalEvidence: ['vulnerability-report', 'test-result', 'incident-report'],
  },
  {
    id: 'S004',
    domain: 'security',
    title: 'Secure Development',
    description: 'Secure development lifecycle practices for AI systems',
    typicalEvidence: ['code-review', 'policy-document', 'training-record'],
  },

  // Safety domain
  {
    id: 'SF001',
    domain: 'safety',
    title: 'Risk Assessment',
    description: 'Comprehensive risk assessment for AI system deployment',
    typicalEvidence: ['risk-assessment', 'policy-document', 'test-result'],
  },
  {
    id: 'SF002',
    domain: 'safety',
    title: 'Guardrails & Boundaries',
    description: 'AI systems operate within defined safety boundaries',
    typicalEvidence: ['configuration', 'test-result', 'policy-document'],
  },
  {
    id: 'SF003',
    domain: 'safety',
    title: 'Human Override',
    description: 'Mechanisms for human intervention and override of AI decisions',
    typicalEvidence: ['configuration', 'test-result', 'policy-document'],
  },

  // Reliability domain
  {
    id: 'R001',
    domain: 'reliability',
    title: 'Performance Monitoring',
    description: 'Continuous monitoring of AI system performance and accuracy',
    typicalEvidence: ['test-result', 'configuration', 'audit-log'],
  },
  {
    id: 'R002',
    domain: 'reliability',
    title: 'Model Validation',
    description: 'Validated model performance across expected operating conditions',
    typicalEvidence: ['test-result', 'model-card', 'risk-assessment'],
  },
  {
    id: 'R003',
    domain: 'reliability',
    title: 'Failover & Recovery',
    description: 'AI systems have appropriate failover and recovery mechanisms',
    typicalEvidence: ['configuration', 'test-result', 'incident-report'],
  },

  // Accountability domain
  {
    id: 'E001',
    domain: 'accountability',
    title: 'Governance Framework',
    description: 'Documented governance framework for AI systems',
    typicalEvidence: ['policy-document', 'access-control-matrix', 'training-record'],
  },
  {
    id: 'E002',
    domain: 'accountability',
    title: 'Audit Trail',
    description: 'Tamper-evident audit trail of AI system actions and decisions',
    typicalEvidence: ['audit-log', 'configuration', 'policy-document'],
  },
  {
    id: 'E003',
    domain: 'accountability',
    title: 'Incident Response',
    description: 'Documented incident response procedures for AI failures',
    typicalEvidence: ['policy-document', 'incident-report', 'training-record'],
  },
  {
    id: 'E004',
    domain: 'accountability',
    title: 'Identity & Attribution',
    description: 'AI system outputs are attributable to identified agents or systems',
    typicalEvidence: ['configuration', 'audit-log', 'policy-document'],
  },

  // Data & Privacy domain
  {
    id: 'D001',
    domain: 'data-privacy',
    title: 'Data Lineage',
    description: 'Tracked data lineage from source through processing to output',
    typicalEvidence: ['data-flow-diagram', 'configuration', 'audit-log'],
  },
  {
    id: 'D002',
    domain: 'data-privacy',
    title: 'Hallucination Prevention',
    description: 'Mechanisms to detect and prevent AI hallucinations',
    typicalEvidence: ['test-result', 'configuration', 'model-card'],
  },
  {
    id: 'D003',
    domain: 'data-privacy',
    title: 'Privacy Protection',
    description: 'Personal data is handled in compliance with privacy regulations',
    typicalEvidence: ['consent-record', 'retention-policy', 'data-flow-diagram'],
  },
  {
    id: 'D004',
    domain: 'data-privacy',
    title: 'Data Minimization',
    description: 'AI systems collect and process only necessary data',
    typicalEvidence: ['configuration', 'policy-document', 'data-flow-diagram'],
  },

  // Society domain
  {
    id: 'A001',
    domain: 'society',
    title: 'Bias Assessment',
    description: 'Regular assessment and mitigation of AI bias',
    typicalEvidence: ['bias-assessment', 'test-result', 'model-card'],
  },
  {
    id: 'A002',
    domain: 'society',
    title: 'Transparency',
    description: 'AI system capabilities and limitations are transparently communicated',
    typicalEvidence: ['model-card', 'policy-document', 'impact-assessment'],
  },
  {
    id: 'A003',
    domain: 'society',
    title: 'Environmental Impact',
    description: 'Environmental impact of AI systems is measured and minimized',
    typicalEvidence: ['impact-assessment', 'configuration', 'policy-document'],
  },
  {
    id: 'A004',
    domain: 'society',
    title: 'Intellectual Property',
    description: 'AI systems respect intellectual property rights in training and output',
    typicalEvidence: ['policy-document', 'audit-log', 'consent-record'],
  },
];

/** Lookup a control definition by ID. */
export function getControl(controlId: ControlId): ControlDefinition | undefined {
  return CONTROLS.find((c) => c.id === controlId);
}

/** Get all controls for a given domain. */
export function getControlsByDomain(domain: Aiuc1Domain): ControlDefinition[] {
  return CONTROLS.filter((c) => c.domain === domain);
}
