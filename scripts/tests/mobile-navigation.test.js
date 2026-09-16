const fs = require('fs');
const path = require('path');
const assert = require('assert');

function runTests() {
  console.log('🧪 Starting Mobile Navigation Test Suite...\n');

  const navPath = path.join(process.cwd(), 'src/components/Navigation.tsx');
  const navCode = fs.readFileSync(navPath, 'utf8');

  // 1. Check useState and icon imports
  console.log('  1️⃣ Checking imports...');
  assert.ok(
    navCode.includes('useState') && navCode.includes('Menu') && navCode.includes('X'),
    'Navigation.tsx must import useState, Menu, and X icons'
  );
  console.log('     ✅ useState, Menu, and X icons imported');

  // 2. Check isMobileMenuOpen state
  console.log('\n  2️⃣ Checking isMobileMenuOpen state...');
  assert.ok(
    navCode.includes('const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)'),
    'Navigation.tsx must define isMobileMenuOpen state'
  );
  console.log('     ✅ isMobileMenuOpen state defined');

  // 3. Check mobile hamburger button
  console.log('\n  3️⃣ Checking mobile menu toggle button...');
  assert.ok(
    navCode.includes('md:hidden') && navCode.includes('setIsMobileMenuOpen(!isMobileMenuOpen)'),
    'Navigation.tsx must include mobile toggle button with md:hidden and toggle handler'
  );
  console.log('     ✅ Mobile toggle button rendered with responsive visibility');

  // 4. Check mobile navigation drawer with all key sections
  console.log('\n  4️⃣ Checking mobile drawer tabs...');
  assert.ok(
    navCode.includes("setActiveTab('catalog')") &&
    navCode.includes("setActiveTab('matching')") &&
    navCode.includes("setActiveTab('kanban')") &&
    navCode.includes("setActiveTab('reports')") &&
    navCode.includes("setActiveTab('security')"),
    'Mobile drawer must provide navigation for catalog, matching, kanban, reports, security'
  );

  assert.ok(
    navCode.includes("currentUser?.role === 'ADMIN'") && navCode.includes("setActiveTab('admin')"),
    'Mobile drawer must conditionally display admin tab for ADMIN users'
  );

  assert.ok(
    navCode.includes('setIsMobileMenuOpen(false)'),
    'Mobile drawer buttons must close the menu upon tab selection'
  );
  console.log('     ✅ All navigation tabs present and auto-close menu on selection');

  console.log('\n🎉 Mobile Navigation Test Suite completed successfully!\n');
}

if (process.argv[1] && process.argv[1].endsWith('mobile-navigation.test.js')) {
  try {
    runTests();
    process.exit(0);
  } catch (err) {
    console.error('💥 Test failed:', err);
    process.exit(1);
  }
}

module.exports = { runTests };
