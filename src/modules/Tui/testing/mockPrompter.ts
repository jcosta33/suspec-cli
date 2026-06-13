// A scripted Prompter for testing flow logic without a terminal. Records the human-facing calls
// (intro/note/log/…) for assertion, and answers select/confirm/text/multiselect from queued values
// (push CANCEL to simulate a cancelled prompt). Under-scripting throws, so a test that forgets an
// answer fails loudly rather than hanging.

import { type Prompter, type Cancelled } from '../useCases/prompter.ts';

export type MockCalls = {
    intros: string[];
    outros: string[];
    notes: { message: string; title?: string }[];
    infos: string[];
    successes: string[];
    warns: string[];
    errors: string[];
    spinnerMessages: string[];
};

export type MockScript = Readonly<{
    select?: unknown[];
    multiselect?: unknown[][];
    confirm?: boolean[];
    text?: string[];
}>;

export type MockPrompter = Prompter & { readonly calls: MockCalls };

function take<TValue>(queue: TValue[] | undefined, kind: string): TValue {
    if (queue === undefined || queue.length === 0) {
        throw new Error(`mock prompter: no scripted answer for ${kind}`);
    }
    return queue.shift() as TValue;
}

export function create_mock_prompter(script: MockScript = {}): MockPrompter {
    const calls: MockCalls = { intros: [], outros: [], notes: [], infos: [], successes: [], warns: [], errors: [], spinnerMessages: [] };
    const selects = [...(script.select ?? [])];
    const multiselects = [...(script.multiselect ?? [])];
    const confirms = [...(script.confirm ?? [])];
    const texts = [...(script.text ?? [])];

    return {
        calls,
        intro: (title) => calls.intros.push(title),
        outro: (message) => calls.outros.push(message),
        note: (message, title) => calls.notes.push({ message, title }),
        info: (message) => calls.infos.push(message),
        success: (message) => calls.successes.push(message),
        warn: (message) => calls.warns.push(message),
        error: (message) => calls.errors.push(message),
        // Defer take() into the promise chain so an under-scripted prompt rejects (not a sync throw).
        select: () => Promise.resolve().then(() => take<string | Cancelled>(selects as (string | Cancelled)[], 'select')),
        multiselect: () => Promise.resolve().then(() => take<string[] | Cancelled>(multiselects as (string[] | Cancelled)[], 'multiselect')),
        confirm: () => Promise.resolve().then(() => take<boolean | Cancelled>(confirms as (boolean | Cancelled)[], 'confirm')),
        text: () => Promise.resolve().then(() => take<string | Cancelled>(texts as (string | Cancelled)[], 'text')),
        spinner: () => ({
            start: (message) => calls.spinnerMessages.push(message),
            message: (message) => calls.spinnerMessages.push(message),
            stop: (message) => calls.spinnerMessages.push(message),
        }),
    };
}
