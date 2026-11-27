import fs from 'node:fs';
import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import type { GitUpdateStatus } from './shared/types';

const execAsync = promisify(exec);
const ROOT_DIR = path.join(__dirname, '..');
const GITHUB_REPO = 'behnam-maqsudi/clinic-manager';

async function runGit(args: string) {
  return execAsync(`git ${args}`, { cwd: ROOT_DIR, windowsHide: true });
}

function getAppVersion(): string {
  try {
    const pkgPath = path.join(ROOT_DIR, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

async function getReleaseStatus(): Promise<GitUpdateStatus> {
  const currentVersion = getAppVersion();
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'User-Agent': 'clinic-manager-app' },
    });
    if (!res.ok) {
      return {
        ok: true,
        hasRemote: true,
        isPackagedApp: true,
        commit: `v${currentVersion}`,
        branch: 'release',
        behind: 0,
        releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
        message: 'نسخه فعلی نصب است. برای بررسی نسخه‌های جدید به صفحه Releases گیت‌هاب مراجعه کنید.',
      };
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latestTag = data.tag_name || '';
    const releaseUrl = data.html_url || `https://github.com/${GITHUB_REPO}/releases`;
    return {
      ok: true,
      hasRemote: true,
      isPackagedApp: true,
      commit: `v${currentVersion}`,
      branch: 'release',
      latestTag,
      releaseUrl,
      behind: latestTag && latestTag !== `v${currentVersion}` ? 1 : 0,
      message: latestTag
        ? `آخرین نسخه منتشرشده در گیت‌هاب: ${latestTag} (نسخه فعلی: v${currentVersion})`
        : 'نسخه فعلی به‌روز است.',
    };
  } catch {
    return {
      ok: true,
      hasRemote: true,
      isPackagedApp: true,
      commit: `v${currentVersion}`,
      branch: 'release',
      behind: 0,
      releaseUrl: `https://github.com/${GITHUB_REPO}/releases`,
      message: 'عدم دسترسی به اینترنت یا گیت‌هاب برای بررسی نسخه جدید.',
    };
  }
}

export async function getGitStatus(): Promise<GitUpdateStatus> {
  const isAsarOrNoGit = ROOT_DIR.includes('.asar') || !fs.existsSync(path.join(ROOT_DIR, '.git'));
  if (isAsarOrNoGit) {
    return getReleaseStatus();
  }

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
  const isAsarOrNoGit = ROOT_DIR.includes('.asar') || !fs.existsSync(path.join(ROOT_DIR, '.git'));
  if (isAsarOrNoGit) {
    return {
      ok: false,
      updated: false,
      message: 'در نسخه نصبی دسکتاپ، نسخه جدید را از صفحه Releases گیت‌هاب دانلود و نصب کنید.',
    };
  }

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
