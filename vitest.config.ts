import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    {
      name: 'fix-windows-parentheses',
      config(config) {
        if (config.test && config.test.include) {
          config.test.include = config.test.include.map((pattern) => {
            if (typeof pattern === 'string') {
              return pattern.replace(/\(/g, '\\(').replace(/\)/g, '\\)');
            }
            return pattern;
          });
        }
      }
    }
  ]
});
