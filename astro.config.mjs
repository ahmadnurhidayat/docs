import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://docs.ahmadnurhidayat.com',
  base: '/',
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      theme: 'dark-plus',
      wrap: false,
    },
  },
  output: 'static',
  build: {
    assets: '_assets',
  },
});
