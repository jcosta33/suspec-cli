import { create_or_update_task_file } from '../useCases/template.ts';

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('task-management module', () => {
    let tempDir: string;
    let templateDir: string;

    beforeEach(() => {
        tempDir = mkdtempSync(join(tmpdir(), 'swarm-test-'));
        templateDir = join(tempDir, 'templates');
    });

    afterEach(() => {
        rmSync(tempDir, { recursive: true, force: true });
    });

    it('creates a task file from default template when no template exists', () => {
        const taskFile = join(tempDir, 'task.md');
        const data = {
            title: 'Test Task',
            slug: 'test-task',
            agent: 'claude',
            branch: 'agent/test-task',
            baseBranch: 'main',
            worktreePath: '../repo--test-task',
            createdAt: new Date().toISOString(),
            status: 'active',
            type: '',
        };

        create_or_update_task_file(taskFile, templateDir, data);

        expect(existsSync(taskFile)).toBe(true);
        const content = readFileSync(taskFile, 'utf8');
        expect(content).toContain('# Test Task');
        expect(content).toContain('## Metadata');
        expect(content).toContain('- Slug: test-task');
        expect(content).toContain('## Objective');
    });

    it('creates a task file from a typed template when available', () => {
        const taskFile = join(tempDir, 'task.md');
        const data = {
            title: 'Feature Task',
            slug: 'feature-task',
            agent: 'claude',
            branch: 'agent/feature-task',
            baseBranch: 'main',
            worktreePath: '../repo--feature-task',
            createdAt: new Date().toISOString(),
            status: 'active',
            type: 'feature',
        };

        // Create a typed template
        mkdirSync(templateDir, { recursive: true });
        const typedTemplate = join(templateDir, 'task-feature.md');
        writeFileSync(typedTemplate, '# {{title}}\n\n## Metadata\n- Type: feature\n- Slug: {{slug}}\n\n## Objective\nBuild the feature.\n', 'utf8');

        create_or_update_task_file(taskFile, templateDir, data);

        const content = readFileSync(taskFile, 'utf8');
        expect(content).toContain('# Feature Task');
        expect(content).toContain('- Type: feature');
        expect(content).toContain('- Slug: feature-task');
    });

    it('updates metadata block in an existing file without overwriting other content', () => {
        const taskFile = join(tempDir, 'task.md');
        const initialContent = `# Existing Task

## Metadata
- Slug: old-slug
- Agent: gemini
- Status: idle

## Objective
Original objective text.

## Notes
- Some note
`;
        writeFileSync(taskFile, initialContent, 'utf8');

        const data = {
            title: 'Existing Task',
            slug: 'new-slug',
            agent: 'claude',
            branch: 'agent/new-slug',
            baseBranch: 'main',
            worktreePath: '../repo--new-slug',
            createdAt: new Date().toISOString(),
            status: 'active',
            type: '',
        };

        create_or_update_task_file(taskFile, templateDir, data);

        const content = readFileSync(taskFile, 'utf8');
        expect(content).toContain('- Slug: new-slug');
        expect(content).toContain('- Agent: claude');
        expect(content).toContain('- Status: active');
        expect(content).toContain('Original objective text.');
        expect(content).toContain('- Some note');
    });
});
