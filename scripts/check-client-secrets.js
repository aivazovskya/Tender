const fs = require('fs');
const path = require('path');

const MAX_DEPTH = 5;
const SRC_DIR = path.join(process.cwd(), 'src');

// Regex to catch process.env.SOMETHING_SECRET / TOKEN / KEY
const SECRET_REGEX = /process\.env\.([A-Z0-9_]*(?:SECRET|TOKEN|KEY)[A-Z0-9_]*)/g;

// Extensions to attempt resolving
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

/**
 * Check if a file starts with 'use client' or "use client" directive
 */
function isClientComponent(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
        continue;
      }
      if (trimmed === "'use client'" || trimmed === '"use client"' || trimmed.startsWith("'use client';") || trimmed.startsWith('"use client";')) {
        return true;
      }
      // If first executable line is not 'use client', it's not a client component
      break;
    }
  } catch (err) {
    // Ignore unreadable files
  }
  return false;
}

/**
 * Find all files recursively in a directory matching extensions
 */
function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next') {
        getAllFiles(filePath, fileList);
      }
    } else if (/\.(ts|tsx|js|jsx)$/.test(file)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

/**
 * Resolve import path to absolute file path
 */
function resolveImportPath(importPath, currentFilePath) {
  let targetPath = null;

  if (importPath.startsWith('@/')) {
    targetPath = path.join(SRC_DIR, importPath.slice(2));
  } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
    targetPath = path.join(path.dirname(currentFilePath), importPath);
  } else {
    // External npm module
    return null;
  }

  // If exact file exists
  if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
    return targetPath;
  }

  // Try appending extensions
  for (const ext of EXTENSIONS) {
    const candidate = targetPath + ext;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

/**
 * Extract import target paths from a file
 */
function getImports(filePath) {
  const imports = [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Match import ... from 'path' or import 'path' or export ... from 'path'
    const importRegex = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      const target = match[1];
      const resolved = resolveImportPath(target, filePath);
      if (resolved) {
        imports.push({ raw: target, resolved });
      }
    }
  } catch (err) {
    // Ignore read errors
  }
  return imports;
}

/**
 * Inspect a file's content for Prisma or Secret violations
 */
function checkFileViolations(filePath) {
  const violations = [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // Check for ci-guard-ignore comment on current line or preceding line
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (line.includes('ci-guard-ignore') || prevLine.includes('ci-guard-ignore')) {
        continue;
      }

      // Check 1: Prisma client import / usage
      const isPrismaFile = filePath.replace(/\\/g, '/').endsWith('src/lib/prisma.ts');
      const importsPrismaDirectly = /(?:from|import)\s+['"](@\/lib\/prisma|@prisma\/client|.*\/lib\/prisma)['"]/.test(line);
      
      if (importsPrismaDirectly || (isPrismaFile && /new\s+PrismaClient/.test(line))) {
        violations.push({
          type: 'Prisma Client Leak',
          detail: line.trim(),
          lineNum
        });
      }

      // Check 2: process.env SECRET/TOKEN/KEY
      let match;
      SECRET_REGEX.lastIndex = 0;
      while ((match = SECRET_REGEX.exec(line)) !== null) {
        const varName = match[1];
        if (!varName.startsWith('NEXT_PUBLIC_')) {
          violations.push({
            type: `Server Secret Leak (${varName})`,
            detail: line.trim(),
            lineNum
          });
        }
      }
    }
  } catch (err) {
    // Ignore read errors
  }
  return violations;
}

/**
 * Main Guard logic
 */
function runGuard() {
  const allFiles = getAllFiles(SRC_DIR);
  const clientFiles = allFiles.filter(isClientComponent);

  console.log(`🔍 [CI Guard] Scanning ${clientFiles.length} client component(s) in src/...`);

  let totalViolations = 0;
  const warnings = [];

  for (const clientFile of clientFiles) {
    // BFS or DFS search up to MAX_DEPTH
    const queue = [{ path: clientFile, chain: [clientFile], depth: 0 }];
    const visited = new Set([clientFile]);

    while (queue.length > 0) {
      const current = queue.shift();

      // Check violations in current file
      const violations = checkFileViolations(current.path);
      if (violations.length > 0) {
        totalViolations += violations.length;
        const relativeChain = current.chain.map(p => path.relative(process.cwd(), p));
        
        console.error(`\n❌ [CLIENT SECRET LEAK DETECTED]`);
        console.error(`Client Component: ${relativeChain[0]}`);
        console.error(`Import Chain:      ${relativeChain.join(' -> ')}`);
        
        for (const v of violations) {
          console.error(`  - Line ${v.lineNum}: [${v.type}] -> ${v.detail}`);
        }
      }

      // If max depth reached, stop expanding this branch
      if (current.depth >= MAX_DEPTH) {
        const relativeChain = current.chain.map(p => path.relative(process.cwd(), p));
        warnings.push(`Import chain reached maximum depth (${MAX_DEPTH}): ${relativeChain.join(' -> ')}`);
        continue;
      }

      // Expand imports
      const imports = getImports(current.path);
      for (const imp of imports) {
        if (!visited.has(imp.resolved)) {
          visited.add(imp.resolved);
          queue.push({
            path: imp.resolved,
            chain: [...current.chain, imp.resolved],
            depth: current.depth + 1
          });
        }
      }
    }
  }

  if (warnings.length > 0) {
    console.warn('\n⚠️ [CI Guard Warnings]:');
    for (const w of warnings) {
      console.warn(`  - ${w}`);
    }
  }

  if (totalViolations > 0) {
    console.error(`\n💥 CI Guard Failed! Found ${totalViolations} server secret/Prisma leak violation(s) in client components.`);
    return false;
  }

  console.log(`\n✔ [CI Guard Passed] No server secrets or Prisma leaks found in client components.`);
  return true;
}

// Execute if called directly from CLI
if (require.main === module) {
  const success = runGuard();
  process.exit(success ? 0 : 1);
}

module.exports = { runGuard, isClientComponent, checkFileViolations, resolveImportPath };
