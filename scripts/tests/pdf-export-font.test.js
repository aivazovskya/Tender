require('tsx/cjs');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { GET: getPdfExport } = require('../../src/app/api/export/tenders/[id]/pdf/route');

async function runTests() {
  console.log('🧪 [Test Suite] Testing Open Font PDF Export (Noto Sans Cyrillic & Kazakh)...');

  // 1. Verify file presence/absence
  console.log('\n▶ 1. Verifying font files in public/fonts/...');
  const fontsDir = path.join(process.cwd(), 'public', 'fonts');
  const arialPath = path.join(fontsDir, 'arial.ttf');
  const notoPath = path.join(fontsDir, 'noto-sans.ttf');
  const notoBoldPath = path.join(fontsDir, 'noto-sans-bold.ttf');

  if (fs.existsSync(arialPath)) {
    throw new Error('❌ Proprietary arial.ttf font still exists in public/fonts/');
  }
  console.log('  ✅ Proprietary arial.ttf file deleted');

  if (!fs.existsSync(notoPath)) {
    throw new Error('❌ public/fonts/noto-sans.ttf missing');
  }
  console.log('  ✅ public/fonts/noto-sans.ttf present');

  if (!fs.existsSync(notoBoldPath)) {
    throw new Error('❌ public/fonts/noto-sans-bold.ttf missing');
  }
  console.log('  ✅ public/fonts/noto-sans-bold.ttf present');

  // 2. Verify static code in route.ts
  console.log('\n▶ 2. Checking route.ts for hardcoded proprietary font paths...');
  const routePath = path.join(process.cwd(), 'src', 'app', 'api', 'export', 'tenders', '[id]', 'pdf', 'route.ts');
  const routeCode = fs.readFileSync(routePath, 'utf8');

  if (routeCode.toLowerCase().includes('arial')) {
    throw new Error('❌ route.ts still contains references to "arial"');
  }
  if (routeCode.includes('C:\\Windows\\Fonts')) {
    throw new Error('❌ route.ts still contains hardcoded Windows font path C:\\Windows\\Fonts');
  }
  console.log('  ✅ No proprietary font or OS-specific font paths found in route.ts');

  // 3. Generate PDF and verify output buffer & headers
  console.log('\n▶ 3. Testing PDF Generation API endpoint with Noto Sans Cyrillic & Kazakh text...');
  process.env.ADMIN_API_KEY = 'secret-admin-key-123';
  const req = {
    headers: {
      get: (h) => {
        const key = h.toLowerCase();
        if (key === 'authorization') return 'Bearer secret-admin-key-123';
        if (key === 'x-user-plan') return 'Team';
        return null;
      }
    }
  };

  const res = await getPdfExport(req, { params: { id: 'mock-1' } });
  
  if (res.status !== 200) {
    throw new Error(`Expected HTTP 200 from PDF export, got ${res.status}`);
  }

  const contentType = res.headers.get('content-type');
  if (contentType !== 'application/pdf') {
    throw new Error(`Expected content-type application/pdf, got ${contentType}`);
  }

  const pdfArrayBuffer = await res.arrayBuffer();
  const pdfBuffer = Buffer.from(pdfArrayBuffer);
  
  const pdfHeader = pdfBuffer.toString('utf8', 0, 5);
  if (pdfHeader !== '%PDF-') {
    throw new Error(`Invalid PDF header: expected %PDF-, got ${pdfHeader}`);
  }

  if (pdfBuffer.length < 5000) {
    throw new Error(`PDF buffer unexpectedly small: ${pdfBuffer.length} bytes`);
  }

  console.log(`  ✅ PDF generated successfully (${pdfBuffer.length} bytes, header: ${pdfHeader})`);
  console.log('\n🎉 Open Font PDF Export Test Suite completed successfully!\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
