import { describe, it, expect } from 'vitest';
import { join } from 'path';

import {
    spec_filename,
    run_filename,
    review_filename,
    intake_filename,
    finding_filename,
    evidence_dir,
    archive_dir,
} from '../services/storeLayout.ts';

// AC-002 (SPEC-suspec-v2): the flat store naming — every filename the store may contain is built
// here, so the layout invariant (flat + evidence/<run>/ + archive/, nothing else) has one source.

describe('store layout builders (AC-002)', () => {
    it('builds the flat artifact filenames', () => {
        expect(spec_filename('checkout')).toBe('spec-checkout.md');
        expect(run_filename('checkout')).toBe('run-checkout.md');
        expect(review_filename('checkout')).toBe('review-checkout.md');
        expect(intake_filename('billing-bug')).toBe('intake-billing-bug.md');
    });

    it('pads finding numbers to three digits', () => {
        expect(finding_filename(7)).toBe('finding-007.md');
        expect(finding_filename(42)).toBe('finding-042.md');
        expect(finding_filename(123)).toBe('finding-123.md');
    });

    it('derives the evidence dir for a run under evidence/<run>/', () => {
        expect(evidence_dir('/store/repo', 'checkout')).toBe(join('/store/repo', 'evidence', 'checkout'));
    });

    it('derives archive/ as the only lifecycle subfolder', () => {
        expect(archive_dir('/store/repo')).toBe(join('/store/repo', 'archive'));
    });
});
