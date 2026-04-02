import { describe, it, expect } from 'vitest';
import {
  CONTROLS,
  DOMAIN_LABELS,
  getControl,
  getControlsByDomain,
  type Aiuc1Domain,
} from '../src/schema/domains.js';

describe('AIUC-1 Schema', () => {
  describe('DOMAIN_LABELS', () => {
    it('covers all 6 domains', () => {
      const domains: Aiuc1Domain[] = [
        'security',
        'safety',
        'reliability',
        'accountability',
        'data-privacy',
        'society',
      ];
      expect(Object.keys(DOMAIN_LABELS)).toHaveLength(6);
      for (const domain of domains) {
        expect(DOMAIN_LABELS[domain]).toBeDefined();
      }
    });
  });

  describe('CONTROLS', () => {
    it('has controls for all 6 domains', () => {
      const domains = new Set(CONTROLS.map((c) => c.domain));
      expect(domains.size).toBe(6);
    });

    it('each control has required fields', () => {
      for (const control of CONTROLS) {
        expect(control.id).toBeTruthy();
        expect(control.domain).toBeTruthy();
        expect(control.title).toBeTruthy();
        expect(control.description).toBeTruthy();
        expect(control.typicalEvidence.length).toBeGreaterThan(0);
      }
    });

    it('has unique control IDs', () => {
      const ids = CONTROLS.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('getControl', () => {
    it('returns control by ID', () => {
      const control = getControl('S001');
      expect(control).toBeDefined();
      expect(control!.id).toBe('S001');
      expect(control!.domain).toBe('security');
      expect(control!.title).toBe('Access Control');
    });

    it('returns undefined for unknown ID', () => {
      expect(getControl('UNKNOWN')).toBeUndefined();
    });
  });

  describe('getControlsByDomain', () => {
    it('returns controls for security domain', () => {
      const controls = getControlsByDomain('security');
      expect(controls.length).toBeGreaterThan(0);
      for (const c of controls) {
        expect(c.domain).toBe('security');
      }
    });

    it('returns controls for all domains', () => {
      const domains: Aiuc1Domain[] = [
        'security',
        'safety',
        'reliability',
        'accountability',
        'data-privacy',
        'society',
      ];
      for (const domain of domains) {
        const controls = getControlsByDomain(domain);
        expect(controls.length).toBeGreaterThan(0);
      }
    });

    it('returns empty array for unknown domain', () => {
      const controls = getControlsByDomain('unknown' as Aiuc1Domain);
      expect(controls).toHaveLength(0);
    });
  });
});
