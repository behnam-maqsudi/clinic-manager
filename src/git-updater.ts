import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { GitUpdateStatus } from './shared/types';

const execAsync = promisify(exec);
const ROOT_DIR = path.join(__dirname, '..');

async function runGit(args: string) {
  return execAsync(`git ${args}`, { cwd: ROOT_DIR, windowsHide: true });
}

export async function getGitStatus(): Promise<GitUpdateStatus> {
  try {
    const { stdout: branchOut } = await runGit('rev-parse --abbrev-ref HEAD');
    const branch = branchOut.trim();

    const { stdout: commitOut } = await runGit('rev-parse --short HEAD');
    const commit = commitOut.trim();

    let hasRemote = false;
    let remoteUrl = '';
    try {
      const { stdout: remoteOut } = await runGit('remote get-url origin');
      remoteUrl = remoteOut.trim();
      hasRemote = Boolean(remoteUrl);
    } catch {
      hasRemote = false;
    }

    if (!hasRemote) {
      return {
        ok: true,
        hasRemote: false,
        branch,
        commit,
        behind: 0,
        message: 'مخزن ریموت (GitHub) هنوز تنظیم نشده است.',
      };
    }

    await runGit('fetch origin --quiet');

    let behind = 0;
    try {
      const { stdout: countOut } = await runGit(`rev-list HEAD..origin/${branch} --count`);
      behind = Number.parseInt(countOut.trim(), 10) || 0;
    } catch {
      behind = 0;
    }

    return {
      ok: true,
      hasRemote: true,
      remoteUrl,
      branch,
      commit,
      behind,
      message: behind > 0 ? `${behind} بروزرسانی جدید در گیت‌هاب موجود است.` : 'برنامه کاملاً به‌روز است.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      hasRemote: false,
      behind: 0,
      message: `خطا در بررسی گیت: ${message}`,
    };
  }
}

export async function applyGitUpdate(): Promise<{
  ok: boolean;
  updated: boolean;
  commit?: string;
  packageChanged?: boolean;
  message: string;
}> {
  const status = await getGitStatus();
  if (!status.ok) {
    return { ok: false, updated: false, message: status.message };
  }
  if (!status.hasRemote) {
    return { ok: false, updated: false, message: 'ابتدا باید مخزن گیت‌هاب (origin) را متصل کنید.' };
  }
  if (status.behind === 0) {
    return { ok: true, updated: false, message: 'برنامه همین الان هم روی آخرین نسخه است.' };
  }

  try {
    const { stdout: diffOut } = await runGit(`diff --name-only HEAD..origin/${status.branch}`);
    const changedFiles = diffOut.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const packageChanged = changedFiles.includes('package.json') || changedFiles.includes('package-lock.json');

    await runGit(`pull --ff-only origin ${status.branch}`);

    if (packageChanged) {
      await execAsync('npm install --omit=dev', { cwd: ROOT_DIR, windowsHide: true });
    }

    const { stdout: newCommit } = await runGit('rev-parse --short HEAD');
    return {
      ok: true,
      updated: true,
      commit: newCommit.trim(),
      packageChanged,
      message: 'بروزرسانی با موفقیت انجام شد. سرور در حال راه‌اندازی مجدد است...',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      updated: false,
      message: `خطا در دریافت بروزرسانی: ${message}`,
    };
  }
}
