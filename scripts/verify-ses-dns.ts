#!/usr/bin/env tsx
/**
 * SES DNS Verification Script
 *
 * Checks that a domain is properly configured for sending via Amazon SES:
 * 1. SES domain identity status (verified, DKIM enabled)
 * 2. SPF record (includes amazonses.com)
 * 3. DKIM CNAME records (via SES API tokens)
 * 4. DMARC record (p=quarantine or p=reject minimum)
 *
 * Usage:
 *   npx tsx scripts/verify-ses-dns.ts [domain]
 *   SES_SENDING_DOMAIN=example.com npx tsx scripts/verify-ses-dns.ts
 */

import { SESv2Client, GetEmailIdentityCommand } from '@aws-sdk/client-sesv2';
import dns from 'node:dns';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function pass(label: string, detail?: string): void {
  console.log(`  ${GREEN}PASS${RESET} ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label: string, detail?: string): void {
  console.log(`  ${RED}FAIL${RESET} ${label}${detail ? ` — ${detail}` : ''}`);
}

function warn(label: string, detail?: string): void {
  console.log(`  ${YELLOW}WARN${RESET} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function checkSesIdentity(
  ses: SESv2Client,
  domain: string,
): Promise<{ ok: boolean; dkimTokens: string[] }> {
  console.log(`\n${BOLD}1. SES Domain Identity${RESET}`);
  try {
    const result = await ses.send(
      new GetEmailIdentityCommand({ EmailIdentity: domain }),
    );

    const verified = result.VerifiedForSendingStatus === true;
    if (verified) {
      pass('Domain verified for sending');
    } else {
      fail('Domain NOT verified for sending');
    }

    const dkimStatus = result.DkimAttributes?.Status;
    const dkimOk = dkimStatus === 'SUCCESS';
    if (dkimOk) {
      pass('DKIM status', dkimStatus);
    } else {
      fail('DKIM status', dkimStatus ?? 'unknown');
    }

    const tokens = result.DkimAttributes?.Tokens ?? [];
    return { ok: verified && dkimOk, dkimTokens: tokens };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail('SES API call failed', message);
    return { ok: false, dkimTokens: [] };
  }
}

async function checkSpf(domain: string): Promise<boolean> {
  console.log(`\n${BOLD}2. SPF Record${RESET}`);
  try {
    const records = await dns.promises.resolveTxt(domain);
    const flat = records.map((r) => r.join('')).filter((r) => r.startsWith('v=spf1'));

    if (flat.length === 0) {
      fail('No SPF record found');
      return false;
    }

    const spf = flat[0]!;
    const hasAmazonSes = spf.includes('include:amazonses.com');
    if (hasAmazonSes) {
      pass('SPF includes amazonses.com', spf);
    } else {
      fail('SPF missing amazonses.com', spf);
    }
    return hasAmazonSes;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail('SPF lookup failed', message);
    return false;
  }
}

async function checkDkim(domain: string, tokens: string[]): Promise<boolean> {
  console.log(`\n${BOLD}3. DKIM CNAME Records${RESET}`);
  if (tokens.length === 0) {
    warn('No DKIM tokens from SES — cannot verify CNAME records');
    return false;
  }

  let allOk = true;
  for (const token of tokens) {
    const cname = `${token}._domainkey.${domain}`;
    try {
      const results = await dns.promises.resolveCname(cname);
      if (results.length > 0) {
        pass(`DKIM CNAME ${token}`, results[0]);
      } else {
        fail(`DKIM CNAME ${token}`, 'no records');
        allOk = false;
      }
    } catch {
      fail(`DKIM CNAME ${token}`, 'not found');
      allOk = false;
    }
  }
  return allOk;
}

async function checkDmarc(domain: string): Promise<boolean> {
  console.log(`\n${BOLD}4. DMARC Record${RESET}`);
  try {
    const records = await dns.promises.resolveTxt(`_dmarc.${domain}`);
    const flat = records.map((r) => r.join('')).filter((r) => r.startsWith('v=DMARC1'));

    if (flat.length === 0) {
      fail('No DMARC record found at _dmarc.' + domain);
      return false;
    }

    const dmarc = flat[0]!;
    // Extract the p= policy value
    const policyMatch = dmarc.match(/;\s*p=([\w]+)/i) ?? dmarc.match(/^v=DMARC1;\s*p=([\w]+)/i);
    const policy = policyMatch?.[1]?.toLowerCase();

    if (policy === 'quarantine' || policy === 'reject') {
      pass(`DMARC policy p=${policy}`, dmarc);
      return true;
    } else if (policy === 'none') {
      fail(`DMARC policy p=none is too weak — minimum p=quarantine required`, dmarc);
      return false;
    } else {
      fail(`DMARC policy not found or unrecognized`, dmarc);
      return false;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    fail('DMARC lookup failed', message);
    return false;
  }
}

async function main(): Promise<void> {
  const domain =
    process.argv[2] ??
    process.env['SES_SENDING_DOMAIN'] ??
    'thirdwavebbq.com.au';

  const region = process.env['AWS_REGION'] ?? 'ap-southeast-2';

  console.log(`${BOLD}SES DNS Verification for: ${domain}${RESET}`);
  console.log(`Region: ${region}\n`);

  const ses = new SESv2Client({ region });

  const results: boolean[] = [];

  const identity = await checkSesIdentity(ses, domain);
  results.push(identity.ok);

  results.push(await checkSpf(domain));
  results.push(await checkDkim(domain, identity.dkimTokens));
  results.push(await checkDmarc(domain));

  const allPassed = results.every(Boolean);

  console.log(`\n${BOLD}${'='.repeat(40)}${RESET}`);
  if (allPassed) {
    console.log(`${GREEN}${BOLD}All checks passed!${RESET}`);
  } else {
    console.log(`${RED}${BOLD}Some checks failed — review above.${RESET}`);
  }

  process.exit(allPassed ? 0 : 1);
}

void main();
