/**
 * Comprehensive API Endpoint Tests
 * Tests all fixed components: Rate limiter, Hierarchy cache, Groups API
 */

console.log('\n🧪 COMPREHENSIVE API ENDPOINT TESTS\n');
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

// ============================================================================
// HEALTH CHECKS
// ============================================================================
console.log('\n1️⃣  Health Checks\n');

await test('GET /api/health', async () => {
  const data = await get(`${BASE_URL}/api/health`);
  if (data.status !== 'ok') throw new Error('Status not ok');
  if (!data.oracle.connected) throw new Error('Oracle not connected');
});

await test('GET /api/health/live', async () => {
  const data = await get(`${BASE_URL}/api/health/live`);
  if (data.status !== 'alive') throw new Error('Not alive');
});

await test('GET /api/health/ready', async () => {
  const data = await get(`${BASE_URL}/api/health/ready`);
  if (!data.ready) throw new Error('Not ready');
});

// ============================================================================
// HIERARCHY CACHE API
// ============================================================================
console.log('\n2️⃣  Hierarchy Cache API\n');

await test('POST /api/hierarchy/load (BU=88)', async () => {
  const data = await post(`${BASE_URL}/api/hierarchy/load`, { business_unit_id: 88 });
  if (!data.success) throw new Error('Load failed');
  if (!data.data.rows_loaded) throw new Error('No rows loaded');
});

await test('GET /api/hierarchy/stats', async () => {
  const data = await get(`${BASE_URL}/api/hierarchy/stats`);
  if (!data.success) throw new Error('Stats failed');
  if (!Array.isArray(data.data)) throw new Error('Stats not array');
});

await test('GET /api/hierarchy/get?business_unit_id=88', async () => {
  const data = await get(`${BASE_URL}/api/hierarchy/get?business_unit_id=88&ttl_seconds=36000`);
  if (!data.success) throw new Error('Get failed');
  const hierarchy = data.data;
  if (!hierarchy.departments || Object.keys(hierarchy.departments).length === 0) {
    throw new Error('No hierarchy data');
  }
});

await test('GET /api/hierarchy/is-valid?business_unit_id=88', async () => {
  const data = await get(`${BASE_URL}/api/hierarchy/is-valid?business_unit_id=88&ttl_seconds=36000`);
  if (!data.success) throw new Error('Validation failed');
  if (data.data.isValid !== true) throw new Error('Cache not valid');
});

// ============================================================================
// GROUPS API
// ============================================================================
console.log('\n3️⃣  Groups API\n');

await test('GET /api/groups?business_unit_id=1', async () => {
  const data = await get(`${BASE_URL}/api/groups?business_unit_id=1`);
  if (!data.success) throw new Error('Groups list failed');
  if (!Array.isArray(data.data)) throw new Error('Data not array');
});

await test('GET /api/groups/tree?business_unit_id=1', async () => {
  const data = await get(`${BASE_URL}/api/groups/tree?business_unit_id=1`);
  if (!data.success) throw new Error('Tree failed');
});

await test('GET /api/groups/version', async () => {
  const data = await get(`${BASE_URL}/api/groups/version`);
  if (!data.success) throw new Error('Version failed');
  if (!data.data.version) throw new Error('No version');
});

await test('GET /api/groups/hierarchy-rules?business_unit_id=1', async () => {
  const data = await get(`${BASE_URL}/api/groups/hierarchy-rules?business_unit_id=1`);
  if (!data.success) throw new Error('Hierarchy rules failed');
});

// ============================================================================
// RATE LIMITER TEST (multiple rapid requests)
// ============================================================================
console.log('\n4️⃣  Rate Limiter Test (10 rapid requests)\n');

await test('Rate Limiter - 10 rapid requests', async () => {
  const promises = [];
  for (let i = 0; i < 10; i++) {
    promises.push(get(`${BASE_URL}/api/health/live`));
  }
  const results = await Promise.all(promises);
  if (results.length !== 10) throw new Error('Not all requests succeeded');
});

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '='.repeat(80));
console.log('📊 TEST SUMMARY\n');
console.log(`✅ Passed: ${passed}`);
console.log(`❌ Failed: ${failed}`);
console.log(`📈 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%\n`);

if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED!\n');
  console.log('✅ Rate limiter: Working');
  console.log('✅ Hierarchy cache: Working');
  console.log('✅ Groups API: Working');
  console.log('✅ Health checks: Working\n');
  console.log('='.repeat(80) + '\n');
  process.exit(0);
} else {
  console.log('⚠️  SOME TESTS FAILED\n');
  console.log('Review errors above for details.\n');
  console.log('='.repeat(80) + '\n');
  process.exit(1);
}

