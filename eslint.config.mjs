// Flat-config replacement for the deprecated `.eslintrc.json`. ESLint v9 +
// Next.js 16 (which removed `next lint`) require this format.
//
// `eslint-config-next/core-web-vitals` already exports a flat-config array,
// so we spread it directly without `FlatCompat`.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals"

export default [
  ...nextCoreWebVitals,
  {
    ignores: [
      ".next/",
      "node_modules/",
      "out/",
      "build/",
      "coverage/",
      "playwright-report/",
      ".vercel/",
    ],
  },
]
