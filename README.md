This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## MongoDB Atlas

Goals are stored in the `goals` collection in MongoDB Atlas. The server reads the Atlas connection URL from `MONGODB_URI`, `MONGODB_URL`, or `url`, and credentials from `MONGODB_USERNAME` / `MONGODB_PASSWORD` or `username` / `password`. If the connection URL does not select a database, goals are stored in `dream-tracker`; set `MONGODB_DATABASE` to choose another database. Keep these values in `.env` locally and in your hosting provider's server-side environment settings; never expose them with a `NEXT_PUBLIC_` variable.

If Node.js cannot resolve Atlas SRV records while the operating system can, set the optional `MONGODB_DNS_SERVERS` variable to a comma-separated list of DNS server IP addresses for that runtime. Use a DNS server appropriate to each environment; do not copy a local network resolver into production settings.

The MongoDB database user needs permission to read and write the selected database, and the application host must be allowed in the Atlas network access list. Goal API endpoints are `/api/{person}/goals` for listing and creating goals, `/api/{person}/goals/{goalId}` for editing one, and `/api/{person}/goals/import` for migrating existing browser-saved goals. Valid profiles are `abigail` and `iam`.

The goal API does not include user authentication. Protect the app with an authentication layer before making it publicly accessible.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
