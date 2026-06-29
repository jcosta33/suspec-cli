// The Prompter is the seam that makes the interactive surface (AC-015) testable: TUI flow logic
// runs over this interface, and the @clack/prompts-backed adapter below is the thin shell that
// touches the real terminal. Tests drive flows with a mock Prompter (see testing/mockPrompter.ts).
// A cancelled prompt resolves to CANCEL — flows check for it and bail cleanly.

import { intro, outro, note, log, select, multiselect, confirm, text, spinner, isCancel } from '@clack/prompts';

export const CANCEL: unique symbol = Symbol('suspec.prompt.cancel');
export type Cancelled = typeof CANCEL;

export type Choice<TValue> = Readonly<{ value: TValue; label: string; hint?: string }>;

export type Spinner = Readonly<{
    start: (message: string) => void;
    message: (message: string) => void;
    stop: (message: string) => void;
}>;

export type Prompter = Readonly<{
    intro: (title: string) => void;
    outro: (message: string) => void;
    note: (message: string, title?: string) => void;
    info: (message: string) => void;
    success: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    // Values are strings (command names, requirement ids, slugs) — keeps clack's conditional Option
    // type resolvable and the surface simple. Callers map the chosen string back to meaning.
    select: (input: {
        message: string;
        options: readonly Choice<string>[];
        initialValue?: string;
    }) => Promise<string | Cancelled>;
    multiselect: (input: {
        message: string;
        options: readonly Choice<string>[];
        required?: boolean;
    }) => Promise<string[] | Cancelled>;
    confirm: (input: { message: string; initialValue?: boolean }) => Promise<boolean | Cancelled>;
    text: (input: { message: string; placeholder?: string; defaultValue?: string }) => Promise<string | Cancelled>;
    spinner: () => Spinner;
}>;

export function is_cancelled(value: unknown): value is Cancelled {
    return value === CANCEL;
}

// The real adapter — a thin pass-through to @clack/prompts, mapping its cancel symbol to CANCEL.
// This shell is intentionally untested (it only forwards to a terminal library); the flow logic is
// tested via the mock Prompter.
/* v8 ignore start */
export function create_clack_prompter(): Prompter {
    return {
        intro: (title) => {
            intro(title);
        },
        outro: (message) => {
            outro(message);
        },
        note: (message, title) => {
            note(message, title);
        },
        info: (message) => {
            log.info(message);
        },
        success: (message) => {
            log.success(message);
        },
        warn: (message) => {
            log.warn(message);
        },
        error: (message) => {
            log.error(message);
        },
        select: async (input) => {
            const options = input.options.map((option) => ({
                value: option.value,
                label: option.label,
                hint: option.hint,
            }));
            const result = await select<string>({ message: input.message, options, initialValue: input.initialValue });
            return isCancel(result) ? CANCEL : result;
        },
        multiselect: async (input) => {
            const options = input.options.map((option) => ({
                value: option.value,
                label: option.label,
                hint: option.hint,
            }));
            const result = await multiselect<string>({
                message: input.message,
                options,
                required: input.required ?? false,
            });
            return isCancel(result) ? CANCEL : result;
        },
        confirm: async (input) => {
            const result = await confirm({ message: input.message, initialValue: input.initialValue });
            return isCancel(result) ? CANCEL : result;
        },
        text: async (input) => {
            const result = await text({
                message: input.message,
                placeholder: input.placeholder,
                defaultValue: input.defaultValue,
            });
            return isCancel(result) ? CANCEL : result;
        },
        spinner: () => {
            const instance = spinner();
            return {
                start: (message) => {
                    instance.start(message);
                },
                message: (message) => {
                    instance.message(message);
                },
                stop: (message) => {
                    instance.stop(message);
                },
            };
        },
    };
}
/* v8 ignore stop */
