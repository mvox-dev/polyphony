#!/usr/bin/env node
/**
 * Generate initial Ed25519 signing key for JWT tokens
 * Run with: npx tsx scripts/generate-signing-key.ts
 */

import { webcrypto } from 'node:crypto';
import { nanoid } from 'nanoid';

async function main() {
	console.log('Generating Ed25519 key pair for JWT signing...\n');

	// Generate key pair using Web Crypto API
	const keyPair = (await webcrypto.subtle.generateKey(
		{ name: 'Ed25519' },
		true, // extractable
		['sign', 'verify']
	)) as unknown as CryptoKeyPair;

	// Export to JWK format
	const publicJwk = await webcrypto.subtle.exportKey('jwk', keyPair.publicKey as CryptoKey);
	const privateJwk = await webcrypto.subtle.exportKey('jwk', keyPair.privateKey as CryptoKey);

	// Generate key ID
	const keyId = `key-${nanoid(16)}`;

	console.log('✅ Key pair generated!\n');
	console.log('Key ID:', keyId);
	console.log('\nPublic JWK:', JSON.stringify(publicJwk, null, 2));
	console.log('\nPrivate JWK:', JSON.stringify(privateJwk, null, 2));

	console.log('\n📋 SQL to insert into production database:\n');
	console.log(`INSERT INTO signing_keys (id, public_key, private_key, algorithm, created_at)`);
	console.log(`VALUES (`);
	console.log(`  '${keyId}',`);
	console.log(`  '${JSON.stringify(publicJwk)}',`);
	console.log(`  '${JSON.stringify(privateJwk)}',`);
	console.log(`  'EdDSA',`);
	console.log(`  datetime('now')`);
	console.log(`);`);

	console.log('\n💡 Run this command to insert:');
	console.log(
		`pnpm wrangler d1 execute polyphony-registry-db --remote --command "INSERT INTO signing_keys (id, public_key, private_key, algorithm, created_at) VALUES ('${keyId}', '${JSON.stringify(publicJwk)}', '${JSON.stringify(privateJwk)}', 'EdDSA', datetime('now'));"`
	);
}

main().catch(console.error);
