import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';

import { assertOk } from '../../../infra/errors/testing/assertOk.ts';
import { apply_update } from '../useCases/applyUpdate.ts';

let workspace: string;
let kit: string;
beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'suspec-au-ws-'));
    kit = mkdtempSync(join(tmpdir(), 'suspec-au-kit-'));
    // A workspace behind the kit: pinned older than the kit VERSION, so `apply_update` refreshes.
    mkdirSync(join(workspace, '.agents'), { recursive: true });
    writeFileSync(join(workspace, '.agents', '.suspec-version'), '1.0.0\n');
    writeFileSync(join(kit, 'VERSION'), '2.0.0\n');
});
afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(kit, { recursive: true, force: true });
});
function kitFile(rel: string, body = 'x\n'): void {
    const p = join(kit, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
}

describe('apply_update — the kit-owned set comes from the manifest (ADR-0135 AC-002)', () => {
    it('refreshes a path the manifest declares kit-owned, and only that', () => {
        writeFileSync(join(kit, 'suspec-kit.yaml'), 'kit_owned:\n  - custom/\nrequired:\n  - templates\n');
        kitFile('custom/guide.md'); // manifest-owned → refreshed
        kitFile('templates/spec.md'); // NOT in this manifest's kit_owned → not refreshed
        const report = assertOk(apply_update({ workspaceDir: workspace, kitSourceDir: kit, policy: 'backup' }));
        expect(report.applied).toBe(true);
        expect(existsSync(join(workspace, 'custom', 'guide.md'))).toBe(true);
        expect(existsSync(join(workspace, 'templates', 'spec.md'))).toBe(false);
    });

    it('no manifest → the built-in default layout drives the refresh (AC-004)', () => {
        kitFile('templates/spec.md'); // default-owned → refreshed
        kitFile('custom/guide.md'); // not in the defaults → not refreshed
        const report = assertOk(apply_update({ workspaceDir: workspace, kitSourceDir: kit, policy: 'backup' }));
        expect(report.applied).toBe(true);
        expect(existsSync(join(workspace, 'templates', 'spec.md'))).toBe(true);
        expect(existsSync(join(workspace, 'custom', 'guide.md'))).toBe(false);
    });
});
