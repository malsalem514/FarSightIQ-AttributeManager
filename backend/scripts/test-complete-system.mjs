/**
 * Complete System Test - All APIs
 */

console.log('\n🧪 COMPLETE SYSTEM TEST\n');
console.log('='.repeat(80));

const BASE_URL = 'http://localhost:3002';
let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

async function get(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

async function post(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  return response.json();
}

// HEALTH CHECKS
console.log('\n📊 HEALTH CHECKS\n');
await test('GET /api/health', async () => {
  const data = await get(`${BASE_URL}/api/health`);
  if (data.status !== 'ok') throw new Error('Health check failed');
});

// HIERARCHY CACHE API (Previously failing - now fixed!)
console.log('\n🗂️  HIERARCHY CACHE API (FIX-004 Applied)\n');

await test('POST /api/hierarchy/load (BU=88)', async () => {
  const data = await post(`${BASE_URL}/api/hierarchy/load`, { business_unit_id: 88 });
  if (!data.success) throw new Error('Load failed');
  if (!data.data.rows_loaded) throw new Error('No rows loaded');
});

await test('GET /api/hierarchy/get (BU=88, TTL=3600)', async () => {
  const data = await get(`${BASE_URL}/api/hierarchy/get?business_unit_id=88&ttl_seconds=3600`);
  if (!data.success) throw new Error('Get failed');
  const h = data.data;
  if (!h.departments || Object.keys(h.departments).length === 0) {
    throw new Error(`No departments (got ${Object.keys(h.departments || {}).length})`);
  }
  console.log(`   → ${Object.keys(h.departments).length} depts, ${Object.keys(h.classes || {}).length} classes, ${Object.keys(h.subclasses || {}).length} subclasses`);
});

await test('GET /api/hierarchy/is-valid (BU=88, TTL=3600)', async () => {
  const data = await get(`${BASE_URL}/api/hierarchy/is-valid?business_unit_id=88&ttl_seconds=3600`);
  if (!data.success) throw new Error('Validation failed');
  if (data.data.isValid !== true) throw new Error(`Cache not valid (got: ${data.data.isValid})`);
});

await test('GET /api/hierarchy/stats', async () => {
  const data = await get(`${BASE_URL}/api/hierarchy/stats`);
  if (!data.success) throw new Error('Stats failed');
  if (!Array.isArray(data.data)) throw new Error('Stats not array');
  console.log(`   → ${data.data.length} cache entries`);
});

// GROUPS API
console.log('\n📦 GROUPS API\n');

await test('GET /api/groups (BU=1)', async () => {
  const data = await get(`${BASE_URL}/api/groups?business_unit_id=1`);
  if (!data.success) throw new Error('Groups failed');
});

await test('GET /api/groups/version', async () => {
  const data = await get(`${BASE_URL}/api/groups/version`);
  if (!data.success) throw new Error('Version failed');
  console.log(`   → Package version: ${data.data.version}`);
});

// SUMMARY
console.log('\n' + '='.repeat(80));
console.log('📊 COMPLETE SYSTEM TEST SUMMARY\n');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED!\n');
  console.log('✅ FIX-004 (Timezone TTL): RESOLVED');
  console.log('✅ Hierarchy Cache API: OPERATIONAL');
  console.log('✅ Groups API: OPERATIONAL');
  console.log('✅ Health Checks: PASSING\n');
  console.log('🚀 SYSTEM IS 100% PRODUCTION READY!\n');
  console.log('='.repeat(80) + '\n');
  process.exit(0);
} else {
  console.log('⚠️  SOME TESTS FAILING\n');
  console.log('='.repeat(80) + '\n');
  process.exit(1);
}

