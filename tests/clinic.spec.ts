import { expect, test } from '@playwright/test';

test.describe('Clinic Manager — Core UI & Logic E2E', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/api/patients?date=all&q=تست E2E');
    const data = await res.json();
    for (const p of data.patients || []) {
      await request.delete(`/api/patients/${p.id}`);
    }
  });

  test('full clinic workflow: create, search, status, attachments/QR, bulk import, themes & dev mode', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'مطب دکتر بهامین جهانیان' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'شبکه مطب' })).toHaveCount(0);

    // 1. Create patient with file_number + quick note chip
    await page.getByRole('button', { name: 'ثبت مراجعه‌کننده' }).click();
    await page.getByPlaceholder('مثلاً علی رضایی').fill('تست E2E علی رضایی');
    await page.getByPlaceholder('412').fill('9412');
    await page.getByPlaceholder('09123456789').fill('09120006789');
    await page.getByRole('button', { name: '+ چکاپ سالانه' }).click();
    await page.getByRole('button', { name: 'ذخیره اطلاعات' }).click();

    await expect(page.locator('table').getByText('تست E2E علی رضایی', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('پرونده ۹۴۱۲')).toBeVisible();

    // 2. Search by last 4 digits of mobile
    const searchInput = page.getByPlaceholder('جستجو با نام، شماره پرونده، ۴ رقم آخر موبایل یا کد ملی...');
    await searchInput.fill('6789');
    await expect(page.locator('table').getByText('تست E2E علی رضایی', { exact: true })).toBeVisible();

    await searchInput.fill('999999');
    await expect(page.getByText('هنوز مراجعه‌کننده‌ای در این لیست ثبت نشده است')).toBeVisible();
    await searchInput.fill('');

    // 2.5. Shamsi DatePicker opens and filters
    await page.getByRole('button', { name: 'انتخاب تاریخ شمسی' }).click();
    await expect(page.locator('.rmdp-wrapper')).toBeVisible();
    await page.locator('.rmdp-day.rmdp-today span').first().click();
    await page.getByRole('button', { name: 'امروز', exact: true }).click();
    await expect(page.locator('table').getByText('تست E2E علی رضایی', { exact: true })).toBeVisible();

    // 3. Doctor role + status progression
    await page.getByRole('button', { name: 'پزشک', exact: true }).click();
    const row = page.locator('tr', { hasText: 'تست E2E علی رضایی' });
    await row.getByRole('button', { name: 'شروع ویزیت' }).click();
    await expect(row.getByText('در حال ویزیت')).toBeVisible();

    await row.getByRole('button', { name: 'ویزیت شد ✓' }).click();
    await expect(row.getByText('ویزیت‌شده')).toBeVisible();

    // Ensure attachments, date, and notes columns are removed from main table
    await expect(page.locator('thead').getByText('مدارک و آزمایش‌ها')).toHaveCount(0);
    await expect(page.locator('thead').getByText('تاریخ شمسی')).toHaveCount(0);
    await expect(page.locator('thead').getByText('یادداشت')).toHaveCount(0);

    // 3.5. Click patient row to open Full Details modal and update notes
    await row.click();
    await expect(page.getByText('یادداشت کامل پزشک / منشی')).toBeVisible();
    await page.getByPlaceholder('یادداشتی ثبت نشده است...').fill('یادداشت کامل تست جزئیات پرونده');
    await page.getByRole('button', { name: 'ذخیره یادداشت' }).click();
    await page.getByRole('button', { name: 'بستن جزئیات' }).click();

    // 4. Re-open details modal -> verify saved note persisted, then open Lab attachments & QR Code modal
    await row.click();
    await expect(page.getByPlaceholder('یادداشتی ثبت نشده است...')).toHaveValue('یادداشت کامل تست جزئیات پرونده');
    await page.getByRole('button', { name: 'مدیریت فایل‌ها / اسکن QR موبایل' }).click();
    await expect(page.getByText('آپلود سریع با دوربین گوشی')).toBeVisible();
    const qrImg = page.getByAltText('QR Code');
    await expect(qrImg).toBeVisible();
    const qrSrc = await qrImg.getAttribute('src');
    expect(qrSrc).toContain('data:image/png;base64,');

    // Upload a test file from PC input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'lab-checkup.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test lab'),
    });
    await expect(page.getByText('lab-checkup.pdf')).toBeVisible();
    await page.locator('.fixed').getByRole('button').first().click(); // close lab modal

    // 5. Bulk notebook import (paste tab)
    await page.getByRole('button', { name: 'ورود از دفتر' }).click();
    await page.getByRole('button', { name: 'کپی / پیست متن لیست' }).click();
    await page
      .getByPlaceholder(/علی رضایی - 09123456789/)
      .fill('تست E2E مریم کریمی - 09351112233 - 9501');
    await page.getByRole('button', { name: 'ثبت همه در لیست' }).click();
    await expect(page.getByText('تست E2E مریم کریمی')).toBeVisible();

    // 6. Settings: Theme switcher + Developer Mode
    await page.getByRole('button', { name: 'تنظیمات' }).click();
    await page.getByRole('button', { name: /تیره شبانه/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Toggle Dev Mode on
    await page.getByRole('button', { name: 'تغییر حالت توسعه‌دهنده' }).click();
    await expect(page.getByText('ابزارهای تست سریع فعال است:')).toBeVisible();

    // Close settings
    await page.locator('.fixed').getByRole('button').first().click();

    // 7. Cleanup test patients via API so DB stays clean
    const listRes = await page.request.get('/api/patients?date=all&q=تست E2E');
    const listData = await listRes.json();
    for (const p of listData.patients || []) {
      await page.request.delete(`/api/patients/${p.id}`);
    }

    expect(errors).toEqual([]);
  });
});
