import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { check_update } from '../useCases/checkUpdate.ts';
import { isOk, isErr } from '../../../infra/errors/result.ts';

let workspace: string;
let kit: string;

beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'suspec-cu-ws-'));
    kit = mkdtempSync(join(tmpdir(), 'suspec-cu-kit-'));
});
afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    rmSync(kit, { recursive: true, force: true });
});

function pin(version: string): void {
    mkdirSync(join(workspace, '.agents'), { recursive: true });
    writeFileSync(join(workspace, '.agents', '.suspec-version'), `${version}\n`);
}
function kitVersion(version: string): void {
    writeFileSync(join(kit, 'VERSION'), `${version}\n`);
}

describe('check_update (the drift engine, pure)', () => {
    it('behind → warning level, behind true, carries the changelog', () => {
        pin('1.2.0');
        kitVersion('1.3.0');
        writeFileSync(join(kit, 'CHANGELOG.md'), '## 1.3.0\n- change\n');
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
            expect(result.value.level).toBe('warning');
            expect(result.value.behind).toBe(true);
            expect(result.value.currentVersion).toBe('1.2.0');
            expect(result.value.latestVersion).toBe('1.3.0');
            expect(result.value.changelog).toContain('1.3.0');
        }
    });

    it('equal → clean level, behind false, no changelog', () => {
        pin('2.0.0');
        kitVersion('2.0.0');
        writeFileSync(join(kit, 'CHANGELOG.md'), '## 2.0.0\n');
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
            expect(result.value.level).toBe('clean');
            expect(result.value.behind).toBe(false);
            expect(result.value.changelog).toBeNull();
        }
    });

    it('ahead (pin newer than kit) → clean, not behind', () => {
        pin('2.1.0');
        kitVersion('2.0.0');
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
            expect(result.value.behind).toBe(false);
        }
    });

    it('a non-semver pin that differs → behind (conservative drift)', () => {
        pin('nightly');
        kitVersion('2.0.0');
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
            expect(result.value.behind).toBe(true);
        }
    });

    it('a missing pin → err (VersionPinMissing)', () => {
        kitVersion('2.0.0');
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error._tag).toBe('VersionPinMissing');
        }
    });

    it('a kit without VERSION → err (KitVersionMissing)', () => {
        pin('1.0.0');
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error._tag).toBe('KitVersionMissing');
        }
    });

    it('an empty/whitespace pin → err (VersionPinMissing), never a silent up-to-date', () => {
        mkdirSync(join(workspace, '.agents'), { recursive: true });
        writeFileSync(join(workspace, '.agents', '.suspec-version'), '   \n');
        kitVersion('2.0.0');
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error._tag).toBe('VersionPinMissing');
        }
    });

    it('an empty VERSION in the kit → err (KitVersionMissing)', () => {
        pin('1.0.0');
        writeFileSync(join(kit, 'VERSION'), '  \n');
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isErr(result)).toBe(true);
        if (isErr(result)) {
            expect(result.error._tag).toBe('KitVersionMissing');
        }
    });

    it('a prerelease pin behind the stable kit → behind (conservative drift, not silently clean)', () => {
        pin('1.0.0-rc1');
        kitVersion('1.0.0');
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
            expect(result.value.behind).toBe(true);
            expect(result.value.level).toBe('warning');
        }
    });

    it('behind with no CHANGELOG in the kit → behind, changelog null', () => {
        pin('1.0.0');
        kitVersion('2.0.0'); // no CHANGELOG.md written
        const result = check_update({ workspaceDir: workspace, kitSourceDir: kit });
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
            expect(result.value.behind).toBe(true);
            expect(result.value.changelog).toBeNull();
        }
    });
});
