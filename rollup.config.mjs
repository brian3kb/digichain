import terser from '@rollup/plugin-terser';

export default {
  input: 'main.js',
  output: {
    dir: 'latest',
    format: 'cjs'
  },
  plugins: [terser()]
};
