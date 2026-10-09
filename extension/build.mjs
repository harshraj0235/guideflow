import * as esbuild from 'esbuild';
import { cpSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

const outdir = resolve(__dirname, 'dist');

// Ensure output directory exists
if (!existsSync(outdir)) {
  mkdirSync(outdir, { recursive: true });
}

// Build configuration
const buildOptions = {
  entryPoints: {
    'background': resolve(__dirname, 'src/background/background.ts'),
    'content': resolve(__dirname, 'src/content/content.ts'),
    'popup': resolve(__dirname, 'src/popup/popup.ts'),
    'review': resolve(__dirname, 'src/review/review.ts'),
  },
  bundle: true,
  outdir,
  format: 'esm',
  target: 'chrome110',
  sourcemap: true,
  minify: !isWatch,
  logLevel: 'info',
};

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('👀 Watching for changes...');
    } else {
      await esbuild.build(buildOptions);
    }

    // Copy static files
    cpSync(resolve(__dirname, 'manifest.json'), resolve(outdir, 'manifest.json'));
    cpSync(resolve(__dirname, 'popup.html'), resolve(outdir, 'popup.html'));
    cpSync(resolve(__dirname, 'review.html'), resolve(outdir, 'review.html'));

    // Copy icons directory
    const iconsDir = resolve(__dirname, 'icons');
    const distIconsDir = resolve(outdir, 'icons');
    if (existsSync(iconsDir)) {
      cpSync(iconsDir, distIconsDir, { recursive: true });
    } else {
      mkdirSync(distIconsDir, { recursive: true });
    }

    console.log('✅ Extension built to dist/');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
