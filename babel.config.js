
module.exports = exports = {
  plugins: [
    // [ '@babel/plugin-proposal-class-properties', { loose: true } ],
  ],
  presets: [
    [ '@babel/preset-env', {
      useBuiltIns: 'usage',
      corejs: { version: 3, shippedProposals: true },
    } ],
    'preact',
  ],
};
