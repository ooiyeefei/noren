# Security policy

## Reporting a problem

Please report security problems privately through GitHub:
[report a vulnerability](https://github.com/ooiyeefei/noren/security/advisories/new). Do not open a public
issue, pull request or discussion for a security problem.

Include what you found, the steps to reproduce it, and what an attacker could do with it. The report stays
private between you and the maintainer until a fix is ready.

## What is in scope

- The code in this repository.
- The live site, [noren.yooi.me](https://noren.yooi.me).

Problems in the services Noren uses (Clerk, Convex, Vercel, OpenAI, Anthropic, OpenFreeMap) belong with those
services. Tell us as well if Noren's use of them makes the problem worse.

## Testing the live site

Do not run load tests, vulnerability scanners or other high-volume automated tools against noren.yooi.me. The
hosting platform blocks clients that send too many requests. Do not read, change or delete other people's data,
and do not use real people's personal information in a test. Use your own invited account, or ask for a test
account in your report.

## Not security reports

To ask for a place, story or post to be removed, use the
[removal form](https://noren.yooi.me/en/takedown) instead.
