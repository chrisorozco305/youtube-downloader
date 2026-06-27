// Babel config so Jest can transform JSX and modern JS.
// Vite handles this for the dev/build server, but Jest needs its own transformer.
module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    ['@babel/preset-react', { runtime: 'automatic' }],
  ],
};
