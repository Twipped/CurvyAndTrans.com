
module.exports = exports = {
  extends: "twipped/browser",
  env: {es6: true, jquery: true},
  rules: {
    'indent': [ 2, 2, {
      'MemberExpression': 1,
    } ],
    'prefer-arrow-callback': 0,
    'object-shorthand': 0,
    'node/no-unsupported-features/node-builtins': 0
  },
  overrides: [
    {
      files: ['$*.jsx', '**/*.jsx'],
      extends: "twipped/react",
      rules: {
        'react/jsx-indent': [2, 2, {checkAttributes: true}],
        'react/jsx-indent-props': [2, 2],
        "react/no-unknown-property": [2, { ignore: ['class'] }],
        'node/no-unpublished-import': 0,
        "node/no-missing-import": ["error", {
          "allowModules": ["svg", 'react'],
          "tryExtensions": [".js", ".jsx"]
        }]
      }
    }
  ]
};
