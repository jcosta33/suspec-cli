import { execSync } from 'child_process';
import { platform } from 'os';

/**
 * Send an OS-native desktop notification.
 * Silently fails if the OS does not support the command.
 */
export function notify(title: string, message: string): void {
    try {
        const os = platform();
        if (os === 'darwin') {
            execSync(`osascript -e 'display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}"'`);
        } else if (os === 'linux') {
            execSync(`notify-send "${title.replace(/"/g, '\\"')}" "${message.replace(/"/g, '\\"')}"`);
        } else if (os === 'win32') {
            // Using BurntToast or similar native powershell might be complex without modules, 
            // but a basic message box or simple toast can be attempted. 
            // We'll use a basic balloon tip if possible, else just ignore.
            const script = `
                Add-Type -AssemblyName System.Windows.Forms;
                $notify = New-Object System.Windows.Forms.NotifyIcon;
                $notify.Icon = [System.Drawing.SystemIcons]::Information;
                $notify.BalloonTipTitle = "${title.replace(/"/g, '""')}";
                $notify.BalloonTipText = "${message.replace(/"/g, '""')}";
                $notify.Visible = $true;
                $notify.ShowBalloonTip(3000);
            `;
            execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`);
        }
    } catch (_e) {
        // Ignore notification errors
    }
}
