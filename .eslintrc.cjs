module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true
    },
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'prettier'
  ],
  settings: {
    react: {
      version: 'detect'
    }
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/jsx-uses-react': 'off',
    'react-hooks/exhaustive-deps': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off'
  },
  ignorePatterns: [
    'dist',
    'node_modules',
    'server/node_modules',
    'server/package-lock.json',
    'vite.config.ts',
    'tsconfig.node.json'
  ],
  overrides: [
    {
      files: ['server/**/*.js'],
      env: {
        node: true,
        browser: false
      },
      parser: 'espree',
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'script'
      },
      extends: ['eslint:recommended', 'prettier']
    }
  ]
}
