import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface AnthropicResponse {
    content: Array<{ text: string }>;
}
function isAnthropicResponse(data: unknown): data is AnthropicResponse {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    if (!Array.isArray(obj.content) || !obj.content[0]) return false;
    const first = obj.content[0] as Record<string, unknown>;
    return typeof first.text === 'string';
}

interface OpenAIResponse {
    choices: Array<{ message: { content: string } }>;
}
function isOpenAIResponse(data: unknown): data is OpenAIResponse {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    if (!Array.isArray(obj.choices) || !obj.choices[0]) return false;
    const first = obj.choices[0] as Record<string, unknown>;
    if (!first.message || typeof first.message !== 'object') return false;
    const msg = first.message as Record<string, unknown>;
    return typeof msg.content === 'string';
}

/**
 * Sends a quick prompt to the configured LLM API to generate a one-line insight.
 * Gracefully returns null if no API key is configured or the request fails.
 */
export async function summarize_insight(repoRoot: string, prompt: string): Promise<string | null> {
    const envPath = join(repoRoot, '.env');
    if (!existsSync(envPath)) return null;
    
    let envContent = '';
    try {
        envContent = readFileSync(envPath, 'utf8');
    } catch {
        return null;
    }
    
    const anthropicMatch = envContent.match(/^ANTHROPIC_API_KEY=(.*)$/m);
    const openaiMatch = envContent.match(/^OPENAI_API_KEY=(.*)$/m);
    
    if (anthropicMatch && anthropicMatch[1]) {
        const key = anthropicMatch[1].trim();
        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': key,
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 100,
                    system: 'You are a helpful CLI assistant. Provide exactly one short, punchy sentence as an insight. Do not use quotes or prefixes.',
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            if (res.ok) {
                const json = await res.json();
                if (isAnthropicResponse(json)) {
                    return json.content[0].text.trim();
                }
            }
        } catch (_e) {}
    } else if (openaiMatch && openaiMatch[1]) {
        const key = openaiMatch[1].trim();
        try {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${key}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    max_tokens: 100,
                    messages: [
                        { role: 'system', content: 'You are a helpful CLI assistant. Provide exactly one short, punchy sentence as an insight. Do not use quotes or prefixes.' },
                        { role: 'user', content: prompt }
                    ]
                })
            });
            if (res.ok) {
                const json = await res.json();
                if (isOpenAIResponse(json)) {
                    return json.choices[0].message.content.trim();
                }
            }
        } catch (_e) {}
    }
    
    return null;
}
