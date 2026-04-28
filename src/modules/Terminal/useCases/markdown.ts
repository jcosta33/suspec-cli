import color from 'picocolors';

export function format_markdown(text: string): string {
    let result = text;

    // Code blocks
    result = result.replace(/```[a-z]*\n([\s\S]*?)```/g, (_match, p1) => {
        const lines = p1.split('\n');
        // Remove trailing empty line if it exists
        if (lines[lines.length - 1] === '') lines.pop();
        
        return color.dim('╭─\n') + lines.map((l: string) => `${color.dim('│')} ${color.yellow(l)}`).join('\n') + '\n' + color.dim('╰─');
    });

    // Headings
    result = result.replace(/^### (.*$)/gim, color.cyan(color.bold('### $1')));
    result = result.replace(/^## (.*$)/gim, color.cyan(color.bold('## $1')));
    result = result.replace(/^# (.*$)/gim, color.cyan(color.bold('# $1')));
    
    // Bold and Italic
    result = result.replace(/\*\*(.*?)\*\*/g, color.bold('$1'));
    result = result.replace(/\*(.*?)\*/g, color.italic('$1'));
    
    // Links
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${color.cyan('$1')} ${color.dim('($2)')}`);
    
    // Inline code
    result = result.replace(/`([^`]+)`/g, color.yellow('$1'));
    
    // Blockquotes
    result = result.replace(/^> (.*$)/gim, `${color.gray('┃')} ${color.italic('$1')}`);
    
    return result;
}